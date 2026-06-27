import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDe, redeIdDeQualquer } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { dispararParaClientes } from './disparo.service'
import { sugerirMensagem } from './ia.service'

const SEGMENTOS = ['NOVO', 'FREQUENTE', 'VIP', 'INATIVO', 'ATACADO'] as const

const selCliente = {
  id: true, nome: true, telefone: true, consentimentoLgpd: true,
  segmento: true, totalGasto: true, ultimaCompraEm: true, vendedoraId: true,
} as const

const criarSchema = z.object({
  nome: z.string().min(2),
  segmento: z.enum(SEGMENTOS).optional(),
  clienteIds: z.array(z.string()).optional(),
  mensagemTemplate: z.string().min(5),
})

const sugerirSchema = z.object({ segmento: z.enum(SEGMENTOS).optional(), contexto: z.string().optional() })

const modeloSchema = z.object({
  nome: z.string().min(2),
  mensagemTemplate: z.string().min(5),
  segmento: z.enum(SEGMENTOS).nullish(),
  imagemUrl: z.string().nullish(),
  ativa: z.boolean().optional(),
})

/** Vendedora só age sobre a própria carteira; gerente/gestor sobre toda a loja. */
function filtroCarteira(request: FastifyRequest, lojaId: string): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = { lojaId, ativo: true }
  if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
  return where
}

export async function campanhasRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireFeature('whatsapp'))

  // Sugestão de mensagem (IA quando há chave; senão modelo do segmento)
  app.post('/sugerir', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request) => {
    const body = sugerirSchema.parse(request.body)
    return sugerirMensagem(body)
  })

  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    return prisma.campanha.findMany({
      where: { lojaId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { criadaPor: { select: { nome: true } } },
    })
  })

  // Resultados agregados das campanhas da loja (painel do gestor/gerente).
  app.get('/resumo', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const campanhas = await prisma.campanha.findMany({
      where: { lojaId },
      select: {
        enviados: true, simulados: true, falhas: true, semConsentimento: true,
        criadaPorId: true, criadaPor: { select: { nome: true } },
      },
    })

    const tot = { campanhas: campanhas.length, enviadas: 0, simuladas: 0, falhas: 0, semLgpd: 0 }
    const porVend = new Map<string, { nome: string; campanhas: number; enviadas: number; alcance: number }>()
    for (const c of campanhas) {
      tot.enviadas += c.enviados; tot.simuladas += c.simulados; tot.falhas += c.falhas; tot.semLgpd += c.semConsentimento
      const alcance = c.enviados + c.simulados + c.falhas + c.semConsentimento
      const v = porVend.get(c.criadaPorId) ?? { nome: c.criadaPor.nome, campanhas: 0, enviadas: 0, alcance: 0 }
      v.campanhas += 1; v.enviadas += c.enviados; v.alcance += alcance
      porVend.set(c.criadaPorId, v)
    }
    return {
      ...tot,
      // público alcançado = soma de todos os contatos atingidos pelos disparos
      alcance: tot.enviadas + tot.simuladas + tot.falhas + tot.semLgpd,
      porVendedora: [...porVend.values()].sort((a, b) => b.alcance - a.alcance),
    }
  })

  // ─────────── Campanhas da MARCA (catálogo centralizado) ───────────
  // Gestor monta uma vez (nível da rede) e disponibiliza; vendedoras disparam para a carteira.

  // Lista os modelos da rede. Gestor: todos (com resultado consolidado). Vendedora/gerente: só ativos.
  app.get('/modelos', { preHandler: [app.authenticate] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const ehGestor = request.user.role === 'GESTOR' || request.user.role === 'SUPER_ADMIN'
    const modelos = await prisma.campanhaModelo.findMany({
      where: { redeId, ...(ehGestor ? {} : { ativa: true }) },
      orderBy: { createdAt: 'desc' },
      include: { criadaPor: { select: { nome: true } } },
    })

    const base = (m: (typeof modelos)[number]) => ({
      id: m.id, nome: m.nome, mensagemTemplate: m.mensagemTemplate,
      segmentoAlvo: m.segmentoAlvo, imagemUrl: m.imagemUrl, ativa: m.ativa,
      criadaPor: m.criadaPor.nome, createdAt: m.createdAt,
    })
    if (!ehGestor || modelos.length === 0) return modelos.map(base)

    // Consolida os disparos por modelo (alcance/enviadas) para o gestor acompanhar.
    const ag = await prisma.campanha.groupBy({
      by: ['modeloId'],
      where: { modeloId: { in: modelos.map((m) => m.id) } },
      _sum: { enviados: true, simulados: true, falhas: true, semConsentimento: true },
      _count: { _all: true },
    })
    const porModelo = new Map(ag.map((a) => [a.modeloId, a]))
    return modelos.map((m) => {
      const a = porModelo.get(m.id)
      const enviadas = a?._sum.enviados ?? 0, simuladas = a?._sum.simulados ?? 0
      const falhas = a?._sum.falhas ?? 0, semLgpd = a?._sum.semConsentimento ?? 0
      return { ...base(m), resultado: { disparos: a?._count._all ?? 0, enviadas, simuladas, falhas, semLgpd, alcance: enviadas + simuladas + falhas + semLgpd } }
    })
  })

  // Cria uma campanha da marca (gestor).
  app.post('/modelos', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const b = modeloSchema.parse(request.body)
    const m = await prisma.campanhaModelo.create({
      data: { redeId, criadaPorId: request.user.sub, nome: b.nome, mensagemTemplate: b.mensagemTemplate, segmentoAlvo: b.segmento ?? null, imagemUrl: b.imagemUrl ?? null, ativa: b.ativa ?? true },
      select: { id: true },
    })
    return reply.code(201).send(m)
  })

  // Edita / ativa-desativa uma campanha da marca (gestor).
  app.patch('/modelos/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }
    const b = modeloSchema.partial().parse(request.body)
    const existe = await prisma.campanhaModelo.findFirst({ where: { id, redeId }, select: { id: true } })
    if (!existe) return reply.code(404).send({ erro: 'Campanha não encontrada' })
    await prisma.campanhaModelo.update({
      where: { id },
      data: {
        ...(b.nome !== undefined ? { nome: b.nome } : {}),
        ...(b.mensagemTemplate !== undefined ? { mensagemTemplate: b.mensagemTemplate } : {}),
        ...(b.segmento !== undefined ? { segmentoAlvo: b.segmento ?? null } : {}),
        ...(b.imagemUrl !== undefined ? { imagemUrl: b.imagemUrl ?? null } : {}),
        ...(b.ativa !== undefined ? { ativa: b.ativa } : {}),
      },
    })
    return { ok: true }
  })

  app.delete('/modelos/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }
    const existe = await prisma.campanhaModelo.findFirst({ where: { id, redeId }, select: { id: true } })
    if (!existe) return reply.code(404).send({ erro: 'Campanha não encontrada' })
    await prisma.campanhaModelo.delete({ where: { id } })
    return { ok: true }
  })

  // Vendedora/gerente dispara uma campanha da marca para a própria carteira (ou loja).
  app.post('/modelos/:id/disparar', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const { segmento } = z.object({ segmento: z.enum(SEGMENTOS).optional() }).parse(request.body ?? {})

    const modelo = await prisma.campanhaModelo.findFirst({ where: { id, redeId, ativa: true } })
    if (!modelo) return reply.code(404).send({ erro: 'Campanha indisponível' })

    const seg = segmento ?? modelo.segmentoAlvo ?? undefined
    const where = filtroCarteira(request, lojaId)
    if (seg) where.segmento = seg
    const clientes = await prisma.cliente.findMany({ where, select: selCliente })
    if (clientes.length === 0) return reply.code(422).send({ erro: 'Nenhum cliente no público-alvo' })

    const campanha = await prisma.campanha.create({
      data: { lojaId, criadaPorId: request.user.sub, modeloId: modelo.id, nome: modelo.nome, segmentoAlvo: seg ?? null, mensagemTemplate: modelo.mensagemTemplate },
    })
    const res = await dispararParaClientes({
      lojaId, template: modelo.mensagemTemplate, origem: 'CAMPANHA',
      campanhaId: campanha.id, clientes, vendedoraFallbackId: request.user.sub,
    })
    await prisma.campanha.update({ where: { id: campanha.id }, data: { enviados: res.enviados, simulados: res.simulados, falhas: res.falhas, semConsentimento: res.semConsentimento } })
    return reply.code(201).send({ campanhaId: campanha.id, ...res })
  })

  // Cria a campanha e dispara para o público-alvo (segmento ou lista de clientes)
  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarSchema.parse(request.body)

    const where = filtroCarteira(request, lojaId)
    if (body.segmento) where.segmento = body.segmento
    if (body.clienteIds?.length) where.id = { in: body.clienteIds }

    const clientes = await prisma.cliente.findMany({ where, select: selCliente })
    if (clientes.length === 0) return reply.code(422).send({ erro: 'Nenhum cliente no público-alvo selecionado' })

    // Regra do gestor: se a vendedora não pode editar o disparo, força o texto padrão da marca.
    const rede = await prisma.loja.findUnique({
      where: { id: lojaId },
      select: { rede: { select: { textoDisparoPadrao: true, disparoVendedoraEditavel: true } } },
    })
    const travada = request.user.role === 'VENDEDORA' && rede?.rede && !rede.rede.disparoVendedoraEditavel
    const template = travada && rede?.rede?.textoDisparoPadrao ? rede.rede.textoDisparoPadrao : body.mensagemTemplate

    const campanha = await prisma.campanha.create({
      data: { lojaId, criadaPorId: request.user.sub, nome: body.nome, segmentoAlvo: body.segmento ?? null, mensagemTemplate: template },
    })

    const res = await dispararParaClientes({
      lojaId, template, origem: 'CAMPANHA',
      campanhaId: campanha.id, clientes, vendedoraFallbackId: request.user.sub,
    })

    await prisma.campanha.update({
      where: { id: campanha.id },
      data: { enviados: res.enviados, simulados: res.simulados, falhas: res.falhas, semConsentimento: res.semConsentimento },
    })

    return reply.code(201).send({ campanhaId: campanha.id, ...res })
  })
}

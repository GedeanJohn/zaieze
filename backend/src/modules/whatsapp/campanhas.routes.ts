import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
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

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { aplicarReajuste, definirPrecos, listarPlanos, listarReajustes } from '../planos/planos.service'
import { normalizarCodigo } from '../promo/promo.service'
import { cancelarPreapproval, mpConfigurado } from '../assinaturas/mercadopago.service'

const num = (v: unknown) => Number(v ?? 0)

/** Painel do Admin (operador do SaaS — SUPER_ADMIN): preços, reajuste IGP-M, redes e códigos promocionais. */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authorize('SUPER_ADMIN'))

  // ── Planos & Preços ──
  app.get('/planos', async () => ({ planos: await listarPlanos() }))

  const precosSchema = z.object({
    precos: z.record(z.enum(['START', 'PRO', 'ELITE']), z.coerce.number().nonnegative()),
  })
  app.put('/planos', async (request) => {
    const { precos } = precosSchema.parse(request.body)
    await definirPrecos(precos)
    return { ok: true, planos: await listarPlanos() }
  })

  // ── Reajuste por inflação (IGP-M acumulado) — só novas assinaturas/trocas ──
  const reajusteSchema = z.object({ percentual: z.coerce.number().gt(0).max(100) })
  app.post('/reajuste', async (request) => {
    const { percentual } = reajusteSchema.parse(request.body)
    const detalhe = await aplicarReajuste(percentual, 'IGP-M', request.user.nome)
    return { ok: true, detalhe, planos: await listarPlanos() }
  })
  app.get('/reajustes', async () => ({ reajustes: await listarReajustes() }))

  // ── Tabela do IGP-M (acumulado 12m por mês) — base do reajuste anual por aniversário ──
  app.get('/igpm', async () => ({
    indices: await prisma.indiceIgpm.findMany({ orderBy: [{ ano: 'desc' }, { mes: 'desc' }] }),
  }))

  const igpmSchema = z.object({
    ano: z.coerce.number().int().min(2020).max(2100),
    mes: z.coerce.number().int().min(1).max(12),
    percentual: z.coerce.number().min(-50).max(100),
  })
  // Lança/atualiza a taxa de um mês (idempotente por ano+mês).
  app.put('/igpm', async (request) => {
    const b = igpmSchema.parse(request.body)
    const indice = await prisma.indiceIgpm.upsert({
      where: { ano_mes: { ano: b.ano, mes: b.mes } },
      create: { ano: b.ano, mes: b.mes, percentual: b.percentual, registradoPor: request.user.nome },
      update: { percentual: b.percentual, registradoPor: request.user.nome },
    })
    return { ok: true, indice }
  })
  app.delete('/igpm/:ano/:mes', async (request) => {
    const { ano, mes } = request.params as { ano: string; mes: string }
    await prisma.indiceIgpm.deleteMany({ where: { ano: Number(ano), mes: Number(mes) } })
    return { ok: true }
  })

  // Histórico dos reajustes aplicados por aniversário (auditoria).
  app.get('/reajustes-aniversario', async () => ({
    reajustes: await prisma.reajusteAssinatura.findMany({ orderBy: { aplicadoEm: 'desc' }, take: 100 }),
  }))

  // ── Visão multi-tenant: todas as redes (clientes do SaaS) ──
  app.get('/redes', async () => {
    const redes = await prisma.rede.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        assinatura: { select: { plano: true, status: true, valor: true, cicloFimEm: true, cancelamentoSolicitadoEm: true, simulada: true } },
        _count: { select: { lojas: true, usuarios: true } },
      },
    })
    return {
      redes: redes.map((r) => ({
        id: r.id, nome: r.nome, slug: r.slug, plano: r.plano, ativo: r.ativo, criadoEm: r.createdAt,
        lojas: r._count.lojas, usuarios: r._count.usuarios,
        assinatura: r.assinatura
          ? {
              plano: r.assinatura.plano, status: r.assinatura.status, valor: num(r.assinatura.valor),
              cicloFimEm: r.assinatura.cicloFimEm, cancelamentoAgendado: Boolean(r.assinatura.cancelamentoSolicitadoEm),
              simulada: r.assinatura.simulada,
            }
          : null,
      })),
    }
  })

  // Ativa uma rede em modo CORTESIA (grátis): destrava assinaturas presas em PENDENTE — ex.: adesão
  // que não concluiu o pagamento, ou cupom que deixou o valor zerado. Marca simulada/valor 0 e
  // cancela (best-effort) qualquer preapproval pendente no Mercado Pago.
  app.post('/redes/:id/ativar-cortesia', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rede = await prisma.rede.findUnique({ where: { id }, include: { assinatura: true } })
    if (!rede) return reply.code(404).send({ erro: 'Rede não encontrada' })

    if (rede.assinatura?.mpPreapprovalId && mpConfigurado()) {
      await cancelarPreapproval(rede.assinatura.mpPreapprovalId).catch(() => { /* pendente/sem efeito */ })
    }

    await prisma.$transaction([
      prisma.rede.update({ where: { id }, data: { ativo: true } }),
      ...(rede.assinatura
        ? [prisma.assinatura.update({
            where: { redeId: id },
            data: {
              status: 'ATIVA', simulada: true, valor: 0, mpPreapprovalId: null,
              cancelamentoSolicitadoEm: null, cancelamentoOrigem: null,
              cicloFimEm: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          })]
        : []),
    ])
    return { ok: true }
  })

  // ── Códigos promocionais ──
  app.get('/promos', async () => ({
    promos: await prisma.codigoPromocional.findMany({ orderBy: { createdAt: 'desc' } }),
  }))

  const promoSchema = z.object({
    codigo: z.string().min(2).max(40),
    tipo: z.enum(['DIAS_GRATIS', 'PERCENTUAL']),
    dias: z.coerce.number().int().positive().optional(),
    percentual: z.coerce.number().positive().max(100).optional(),
    descricao: z.string().max(140).optional(),
    validadeAte: z.string().optional(),
    maxUsos: z.coerce.number().int().positive().optional(),
  })
  app.post('/promos', async (request, reply) => {
    const b = promoSchema.parse(request.body)
    if (b.tipo === 'DIAS_GRATIS' && !b.dias) return reply.code(422).send({ erro: 'Informe os dias grátis.' })
    if (b.tipo === 'PERCENTUAL' && !b.percentual) return reply.code(422).send({ erro: 'Informe o percentual de desconto.' })
    const codigo = normalizarCodigo(b.codigo)
    if (await prisma.codigoPromocional.findUnique({ where: { codigo } })) {
      return reply.code(409).send({ erro: 'Já existe um código com esse nome.' })
    }
    const promo = await prisma.codigoPromocional.create({
      data: {
        codigo, tipo: b.tipo,
        dias: b.tipo === 'DIAS_GRATIS' ? b.dias : null,
        percentual: b.tipo === 'PERCENTUAL' ? b.percentual : null,
        descricao: b.descricao ?? null,
        validadeAte: b.validadeAte ? new Date(b.validadeAte) : null,
        maxUsos: b.maxUsos ?? null,
      },
    })
    return reply.code(201).send({ promo })
  })

  app.patch('/promos/:id', async (request) => {
    const { id } = request.params as { id: string }
    const b = z.object({ ativo: z.boolean().optional(), maxUsos: z.coerce.number().int().positive().nullable().optional(), validadeAte: z.string().nullable().optional() }).parse(request.body)
    return prisma.codigoPromocional.update({
      where: { id },
      data: {
        ...(b.ativo !== undefined ? { ativo: b.ativo } : {}),
        ...(b.maxUsos !== undefined ? { maxUsos: b.maxUsos } : {}),
        ...(b.validadeAte !== undefined ? { validadeAte: b.validadeAte ? new Date(b.validadeAte) : null } : {}),
      },
    })
  })

  app.delete('/promos/:id', async (request) => {
    const { id } = request.params as { id: string }
    await prisma.codigoPromocional.delete({ where: { id } })
    return { ok: true }
  })
}

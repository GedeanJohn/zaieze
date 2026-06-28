import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { aplicarReajuste, definirPrecos, listarPlanos, listarReajustes } from '../planos/planos.service'
import { normalizarCodigo } from '../promo/promo.service'

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

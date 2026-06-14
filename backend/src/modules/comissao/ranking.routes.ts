import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'

const num = (v: unknown) => Number(v ?? 0)

function janelaMes(mes?: string): { inicio: Date; fim: Date } {
  const base = mes ? new Date(`${mes}-01T00:00:00`) : new Date()
  return { inicio: new Date(base.getFullYear(), base.getMonth(), 1), fim: new Date(base.getFullYear(), base.getMonth() + 1, 1) }
}

/** Ranking gamificado de vendedoras (módulo 11) — visível para toda a equipe. */
export async function rankingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireFeature('gamificacao'))

  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { mes } = request.query as { mes?: string }
    const { inicio, fim } = janelaMes(mes)

    const [vendedoras, vendas] = await Promise.all([
      prisma.usuario.findMany({ where: { lojaId, role: 'VENDEDORA', ativo: true }, select: { id: true, nome: true, metaMensal: true, equipe: { select: { nome: true } } } }),
      prisma.venda.findMany({ where: { lojaId, status: 'CONCLUIDA', createdAt: { gte: inicio, lt: fim } }, select: { vendedoraId: true, total: true } }),
    ])

    const agg = new Map<string, { total: number; vendas: number }>()
    for (const v of vendas) {
      const a = agg.get(v.vendedoraId) ?? { total: 0, vendas: 0 }
      a.total += num(v.total)
      a.vendas += 1
      agg.set(v.vendedoraId, a)
    }

    return vendedoras
      .map((vd) => {
        const a = agg.get(vd.id) ?? { total: 0, vendas: 0 }
        const meta = vd.metaMensal != null ? num(vd.metaMensal) : null
        return {
          id: vd.id,
          nome: vd.nome,
          equipe: vd.equipe?.nome ?? null,
          total: a.total,
          vendas: a.vendas,
          ticketMedio: a.vendas > 0 ? a.total / a.vendas : 0,
          meta,
          pctMeta: meta && meta > 0 ? Math.round((a.total / meta) * 100) : null,
        }
      })
      .sort((x, y) => y.total - x.total)
      .map((v, i) => ({ posicao: i + 1, ...v }))
  })
}

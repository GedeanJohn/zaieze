import type { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'

const num = (v: unknown) => Number(v ?? 0)

/** Sistema Atacado (módulo 14): clientes de atacado (sacoleiras/revendedores) e o giro do atacado. */
export async function atacadoRoutes(app: FastifyInstance) {

  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const where: Prisma.ClienteWhereInput = { lojaId, ativo: true, segmento: 'ATACADO', consumidorOutro: false }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub

    const [clientes, agg] = await Promise.all([
      prisma.cliente.findMany({
        where,
        orderBy: { totalGasto: 'desc' },
        select: { id: true, nome: true, telefone: true, totalGasto: true, ultimaCompraEm: true, vendedora: { select: { nome: true } } },
      }),
      prisma.venda.aggregate({ where: { lojaId, atacado: true, status: 'CONCLUIDA' }, _sum: { total: true }, _count: true }),
    ])

    return {
      clientes: clientes.map((c) => ({ ...c, totalGasto: num(c.totalGasto) })),
      resumo: {
        clientes: clientes.length,
        faturamentoAtacado: num(agg._sum.total),
        pedidos: agg._count,
        ticketMedio: agg._count > 0 ? num(agg._sum.total) / agg._count : 0,
      },
    }
  })
}

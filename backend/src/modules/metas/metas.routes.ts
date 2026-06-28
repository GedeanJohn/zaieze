import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDe } from '../../plugins/auth'
import { metaDaLoja, numVendedorasAtivas } from './metas.service'

const num = (v: unknown) => Number(v ?? 0)

/** Configuração das metas da rede (marca → loja → vendedora). GESTOR/SUPER_ADMIN. */
export async function metasRoutes(app: FastifyInstance) {
  // Meta derivada da loja selecionada — usada na tela de Equipe (gestor e gerente).
  app.get('/loja', { preHandler: [app.authorize('GESTOR', 'GERENTE', 'SUPER_ADMIN')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const [metaLoja, n] = await Promise.all([metaDaLoja(lojaId), numVendedorasAtivas(lojaId)])
    return { metaLoja, numVendedoras: n, metaVendedora: n > 0 ? metaLoja / n : 0 }
  })

  app.get('/', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const [rede, lojas] = await Promise.all([
      prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { metaMensal: true, metaModo: true } }),
      prisma.loja.findMany({ where: { redeId }, orderBy: { createdAt: 'asc' }, select: { id: true, nome: true, metaMensal: true } }),
    ])
    const metaMarca = num(rede.metaMensal)
    const totalLojas = lojas.length

    const lojasOut = await Promise.all(
      lojas.map(async (l) => {
        const n = await numVendedorasAtivas(l.id)
        const metaLoja = rede.metaModo === 'MANUAL'
          ? num(l.metaMensal)
          : (totalLojas > 0 ? metaMarca / totalLojas : 0)
        return {
          id: l.id,
          nome: l.nome,
          metaManual: num(l.metaMensal),
          numVendedoras: n,
          metaLoja,
          metaVendedora: n > 0 ? metaLoja / n : 0,
        }
      }),
    )
    return { metaMensal: metaMarca, metaModo: rede.metaModo, lojas: lojasOut }
  })

  const schema = z.object({
    metaMensal: z.coerce.number().nonnegative().optional(),
    metaModo: z.enum(['IGUAL', 'MANUAL']).optional(),
    metasPorLoja: z.record(z.string(), z.coerce.number().nonnegative()).optional(),
  })

  app.put('/', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const body = schema.parse(request.body)

    if (body.metaMensal !== undefined || body.metaModo) {
      await prisma.rede.update({
        where: { id: redeId },
        data: {
          ...(body.metaMensal !== undefined ? { metaMensal: body.metaMensal } : {}),
          ...(body.metaModo ? { metaModo: body.metaModo } : {}),
        },
      })
    }

    if (body.metasPorLoja) {
      const lojas = await prisma.loja.findMany({ where: { redeId }, select: { id: true } })
      const daRede = new Set(lojas.map((l) => l.id))
      for (const [lojaId, valor] of Object.entries(body.metasPorLoja)) {
        if (daRede.has(lojaId)) {
          await prisma.loja.update({ where: { id: lojaId }, data: { metaMensal: valor } })
        }
      }
    }
    return { ok: true }
  })
}

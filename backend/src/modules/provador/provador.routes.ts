import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { sugerirLook } from '../whatsapp/ia.service'
import { requireFeature } from '../../plugins/planos'

/**
 * Provador Virtual IA / Montador de Looks (módulo 13): a partir de uma peça base,
 * sugere combinações de outras categorias (com estoque) e um texto de styling por IA.
 */
export async function provadorRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireFeature('provador'))

  app.get('/:produtoId/looks', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { produtoId } = request.params as { produtoId: string }

    const base = await prisma.produto.findFirst({
      where: { id: produtoId, lojaId },
      select: { id: true, nome: true, referencia: true, precoVarejo: true, fotos: true, categoriaId: true, colecaoId: true, categoria: { select: { nome: true } } },
    })
    if (!base) return reply.code(404).send({ erro: 'Produto não encontrado' })

    const candidatos = await prisma.produto.findMany({
      where: {
        lojaId, ativo: true, id: { not: base.id },
        ...(base.categoriaId ? { categoriaId: { not: base.categoriaId } } : {}),
        variacoes: { some: { estoque: { gt: 0 } } },
      },
      select: { id: true, nome: true, precoVarejo: true, fotos: true, colecaoId: true, categoria: { select: { nome: true } } },
      take: 40,
    })
    // prioriza a mesma coleção e garante variedade de categorias
    candidatos.sort((a, b) => Number(b.colecaoId === base.colecaoId) - Number(a.colecaoId === base.colecaoId))
    const categoriasVistas = new Set<string>()
    const complementos: typeof candidatos = []
    for (const c of candidatos) {
      const cat = c.categoria?.nome ?? '—'
      if (categoriasVistas.has(cat)) continue
      categoriasVistas.add(cat)
      complementos.push(c)
      if (complementos.length >= 3) break
    }

    const look = await sugerirLook(base.nome, complementos.map((c) => c.nome))
    return { base, complementos, sugestaoLook: look.texto, viaIa: look.viaIa }
  })
}

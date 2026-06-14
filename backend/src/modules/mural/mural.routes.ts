import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'

const postSchema = z.object({
  titulo: z.string().min(2),
  conteudo: z.string().min(2),
  imagemUrl: z.string().url().optional(),
})

/** Mural de Novidades (módulo 12): a marca/gerência publica; a equipe acompanha. */
export async function muralRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireFeature('gamificacao'))

  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    return prisma.postMural.findMany({
      where: { lojaId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { autor: { select: { nome: true } } },
    })
  })

  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const b = postSchema.parse(request.body)
    const post = await prisma.postMural.create({
      data: { lojaId, autorId: request.user.sub, titulo: b.titulo, conteudo: b.conteudo, imagemUrl: b.imagemUrl },
      include: { autor: { select: { nome: true } } },
    })
    return reply.code(201).send(post)
  })
}

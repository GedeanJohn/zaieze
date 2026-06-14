import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'

const equipeSchema = z.object({ nome: z.string().min(2) })

/** Equipes da loja — o GERENTE constrói uma ou mais equipes de vendedoras. */
export async function equipesRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    return prisma.equipe.findMany({
      where: { lojaId },
      orderBy: { nome: 'asc' },
      include: {
        vendedoras: {
          select: { id: true, nome: true, ativo: true, metaMensal: true },
          orderBy: { nome: 'asc' },
        },
      },
    })
  })

  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = equipeSchema.parse(request.body)
    try {
      const equipe = await prisma.equipe.create({ data: { lojaId, nome: body.nome } })
      return reply.code(201).send(equipe)
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        return reply.code(409).send({ erro: 'Já existe uma equipe com este nome nesta loja' })
      }
      throw e
    }
  })

  app.patch('/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = equipeSchema.parse(request.body)
    const existente = await prisma.equipe.findFirst({ where: { id, lojaId } })
    if (!existente) return reply.code(404).send({ erro: 'Equipe não encontrada' })
    return prisma.equipe.update({ where: { id }, data: body })
  })

  app.delete('/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const existente = await prisma.equipe.findFirst({
      where: { id, lojaId },
      include: { _count: { select: { vendedoras: true } } },
    })
    if (!existente) return reply.code(404).send({ erro: 'Equipe não encontrada' })
    if (existente._count.vendedoras > 0) {
      return reply.code(422).send({ erro: 'Mova as vendedoras para outra equipe antes de excluir' })
    }
    await prisma.equipe.delete({ where: { id } })
    return reply.code(204).send()
  })
}

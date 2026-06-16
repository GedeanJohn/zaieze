import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'

/**
 * Coleções com ciclo de vida.
 * A estoquista monta a coleção (EM_PREPARACAO) cadastrando as peças e, quando termina,
 * LIBERA — aí ela passa a aparecer para todas as vendedoras ao mesmo tempo (catálogo + PDV).
 * Enquanto não liberada, suas peças ficam invisíveis para a vendedora (competição justa pelo estoque).
 */

const criarSchema = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional(),
})

const MUTACAO = ['SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE'] as const

export async function colecoesRoutes(app: FastifyInstance) {
  // Lista as coleções da loja com contagem de peças. Vendedora só vê as liberadas.
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { status } = request.query as { status?: string }
    const where: Prisma.ColecaoWhereInput = { lojaId }
    if (request.user.role === 'VENDEDORA') where.status = 'LIBERADA'
    else if (status === 'EM_PREPARACAO' || status === 'LIBERADA') where.status = status

    const colecoes = await prisma.colecao.findMany({
      where,
      orderBy: [{ status: 'asc' }, { nome: 'asc' }],
      include: { _count: { select: { produtos: true } } },
    })
    return colecoes.map((c) => ({
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      status: c.status,
      liberadaEm: c.liberadaEm,
      pecas: c._count.produtos,
    }))
  })

  // Cria uma coleção vazia (em preparação) para a estoquista ir cadastrando as peças.
  app.post('/', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarSchema.parse(request.body)
    try {
      const colecao = await prisma.colecao.create({ data: { lojaId, nome: body.nome.trim(), descricao: body.descricao } })
      return reply.code(201).send(colecao)
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') return reply.code(409).send({ erro: `Já existe uma coleção "${body.nome}" nesta loja` })
      throw e
    }
  })

  app.patch('/:id', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = criarSchema.partial().parse(request.body)
    const existente = await prisma.colecao.findFirst({ where: { id, lojaId } })
    if (!existente) return reply.code(404).send({ erro: 'Coleção não encontrada' })
    return prisma.colecao.update({ where: { id }, data: { nome: body.nome?.trim(), descricao: body.descricao } })
  })

  // Libera a coleção: passa a aparecer simultaneamente para todas as vendedoras.
  app.post('/:id/liberar', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const colecao = await prisma.colecao.findFirst({ where: { id, lojaId }, include: { _count: { select: { produtos: true } } } })
    if (!colecao) return reply.code(404).send({ erro: 'Coleção não encontrada' })
    if (colecao._count.produtos === 0) return reply.code(422).send({ erro: 'Cadastre ao menos uma peça antes de liberar a coleção' })
    if (colecao.status === 'LIBERADA') return reply.code(409).send({ erro: 'Coleção já está liberada' })
    return prisma.colecao.update({ where: { id }, data: { status: 'LIBERADA', liberadaEm: new Date() } })
  })

  // Recolhe a coleção (volta a esconder das vendedoras) — correção/ajuste pelo gestor/estoquista.
  app.post('/:id/recolher', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const colecao = await prisma.colecao.findFirst({ where: { id, lojaId } })
    if (!colecao) return reply.code(404).send({ erro: 'Coleção não encontrada' })
    return prisma.colecao.update({ where: { id }, data: { status: 'EM_PREPARACAO', liberadaEm: null } })
  })
}

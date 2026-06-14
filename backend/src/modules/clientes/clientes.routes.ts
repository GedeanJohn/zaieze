import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { SEGMENTOS, segmentarLoja, type Distribuicao } from './segmentacao'

const criarClienteSchema = z.object({
  nome: z.string().min(2),
  telefone: z.string().min(8),
  email: z.string().email().optional(),
  cpf: z.string().optional(),
  instagram: z.string().optional(),
  vendedoraId: z.string().optional(),
  consentimentoLgpd: z.boolean().default(false),
  observacoes: z.string().optional(),
})

const atualizarClienteSchema = criarClienteSchema.partial().extend({
  ativo: z.boolean().optional(),
})

/**
 * Filtro de carteira (regra crítica da spec):
 * - VENDEDORA enxerga apenas clientes da própria carteira — aplicado no backend.
 * - DONO_LOJA / SUPER_ADMIN enxergam todos os clientes da loja.
 */
function filtroCarteira(request: FastifyRequest, lojaId: string): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = { lojaId }
  if (request.user.role === 'VENDEDORA') {
    where.vendedoraId = request.user.sub
  }
  return where
}

export async function clientesRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { busca, segmento } = request.query as { busca?: string; segmento?: string }

    const where = filtroCarteira(request, lojaId)
    if (segmento) where.segmento = segmento as never
    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { telefone: { contains: busca } },
      ]
    }

    return prisma.cliente.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: { vendedora: { select: { id: true, nome: true } } },
    })
  })

  // Distribuição da carteira por segmento (respeita o isolamento da vendedora)
  app.get('/resumo/segmentos', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const grupos = await prisma.cliente.groupBy({
      by: ['segmento'],
      where: { ...filtroCarteira(request, lojaId), ativo: true },
      _count: { _all: true },
    })
    const distribuicao = Object.fromEntries(SEGMENTOS.map((s) => [s, 0])) as Distribuicao
    for (const g of grupos) distribuicao[g.segmento] += g._count._all
    const total = Object.values(distribuicao).reduce((s, n) => s + n, 0)
    return { total, distribuicao }
  })

  // Recalcula a segmentação automática da loja (módulo 3) — gerente/gestor
  app.post('/segmentar', { preHandler: [requireFeature('crm_segmentacao'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    return segmentarLoja(lojaId)
  })

  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }

    const cliente = await prisma.cliente.findFirst({
      where: { ...filtroCarteira(request, lojaId), id },
      include: {
        vendedora: { select: { id: true, nome: true } },
        vendas: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { itens: { include: { variacao: { include: { produto: { select: { nome: true } } } } } } },
        },
      },
    })
    if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado ou fora da sua carteira' })
    return cliente
  })

  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarClienteSchema.parse(request.body)

    // Vendedora cadastrando cliente assume o cliente na própria carteira
    const vendedoraId = request.user.role === 'VENDEDORA' ? request.user.sub : body.vendedoraId

    if (vendedoraId) {
      const vendedora = await prisma.usuario.findFirst({ where: { id: vendedoraId, lojaId, role: 'VENDEDORA' } })
      if (!vendedora) return reply.code(422).send({ erro: 'Vendedora inválida para esta loja' })
    }

    try {
      const cliente = await prisma.cliente.create({
        data: { ...body, lojaId, vendedoraId },
        include: { vendedora: { select: { id: true, nome: true } } },
      })
      return reply.code(201).send(cliente)
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        return reply.code(409).send({ erro: 'Já existe um cliente com este telefone nesta loja' })
      }
      throw e
    }
  })

  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = atualizarClienteSchema.parse(request.body)

    const existente = await prisma.cliente.findFirst({ where: { ...filtroCarteira(request, lojaId), id } })
    if (!existente) return reply.code(404).send({ erro: 'Cliente não encontrado ou fora da sua carteira' })

    // Somente dono/admin transfere carteira
    if (body.vendedoraId !== undefined && request.user.role === 'VENDEDORA') {
      return reply.code(403).send({ erro: 'Apenas o gerente pode transferir clientes de carteira' })
    }

    return prisma.cliente.update({
      where: { id },
      data: body,
      include: { vendedora: { select: { id: true, nome: true } } },
    })
  })
}

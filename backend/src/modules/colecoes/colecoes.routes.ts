import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { midiaExpiraEm } from '../midia/limpeza.service'

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
      include: { _count: { select: { produtos: true } }, loja: { select: { rede: { select: { plano: true } } } } },
    })
    const agora = Date.now()
    return colecoes.map((c) => {
      const plano = c.loja.rede?.plano
      const expira = c.status === 'LIBERADA' && plano ? midiaExpiraEm(c.liberadaEm, plano) : null
      const diasParaExpirarMidia = expira ? Math.ceil((expira.getTime() - agora) / 86_400_000) : null
      return {
        id: c.id,
        nome: c.nome,
        descricao: c.descricao,
        status: c.status,
        liberadaEm: c.liberadaEm,
        outlet: c.outlet,
        outletDesde: c.outletDesde,
        descontoOutletPct: c.descontoOutletPct,
        pecas: c._count.produtos,
        // Limpeza de mídia por plano: aviso ao gestor (data + contagem regressiva).
        midiaExpiraEm: expira,
        diasParaExpirarMidia,
        midiaExpiradaEm: c.midiaExpiradaEm,
      }
    })
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

  // Marca/desmarca a coleção como OUTLET (decisão do gestor). Outlet é ortogonal ao status:
  // a coleção continua LIBERADA/vendável, só ganha selo e desconto opcional.
  // - descontoOutletPct: desconto % da COLEÇÃO inteira (null = sem desconto de coleção)
  // - descontosPorPeca: desconto % de PEÇAS específicas (override do desconto da coleção)
  // Ao desmarcar (outlet=false), limpa todos os descontos de outlet (coleção e peças).
  app.post('/:id/outlet', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = z.object({
      outlet: z.boolean(),
      descontoOutletPct: z.number().int().min(1).max(90).nullish(),
      descontosPorPeca: z.array(z.object({ produtoId: z.string(), pct: z.number().int().min(1).max(90).nullable() })).optional(),
    }).parse(request.body)

    const colecao = await prisma.colecao.findFirst({ where: { id, lojaId } })
    if (!colecao) return reply.code(404).send({ erro: 'Coleção não encontrada' })

    return prisma.$transaction(async (tx) => {
      const atualizada = await tx.colecao.update({
        where: { id },
        data: body.outlet
          ? { outlet: true, outletDesde: colecao.outlet ? colecao.outletDesde : new Date(), descontoOutletPct: body.descontoOutletPct ?? null }
          : { outlet: false, outletDesde: null, descontoOutletPct: null },
      })
      if (!body.outlet) {
        // Saiu do Outlet: zera descontos de peça desta coleção.
        await tx.produto.updateMany({ where: { colecaoId: id, lojaId }, data: { descontoOutletPct: null } })
      } else if (body.descontosPorPeca?.length) {
        for (const d of body.descontosPorPeca) {
          await tx.produto.updateMany({ where: { id: d.produtoId, colecaoId: id, lojaId }, data: { descontoOutletPct: d.pct } })
        }
      }
      return { id: atualizada.id, outlet: atualizada.outlet, outletDesde: atualizada.outletDesde, descontoOutletPct: atualizada.descontoOutletPct }
    })
  })

  // Exclui a coleção. As peças NÃO são apagadas — Produto.colecaoId vira null (SetNull no schema).
  app.delete('/:id', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const colecao = await prisma.colecao.findFirst({ where: { id, lojaId } })
    if (!colecao) return reply.code(404).send({ erro: 'Coleção não encontrada' })
    await prisma.colecao.delete({ where: { id } })
    return { ok: true }
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

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDeQualquer } from '../../plugins/auth'
import { midiaExpiraEm } from '../midia/limpeza.service'

/**
 * Coleções no nível da MARCA/REDE (estoque central da fábrica).
 * O gestor de estoque monta a coleção (EM_PREPARACAO) cadastrando as peças e, quando termina,
 * LIBERA — aí ela passa a aparecer para as vendedoras das lojas em que foi DISTRIBUÍDA.
 * "Distribuir" (ColecaoLoja) é só permissão de venda: o estoque é único (não há estoque por loja).
 */

const criarSchema = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional(),
  lojaIds: z.array(z.string()).optional(), // distribuição inicial (opcional)
  validadeAte: z.coerce.date().nullish(), // data limite de vigência (null = sem prazo)
})

const distribuicaoSchema = z.object({
  lojaIds: z.array(z.string()), // conjunto completo de lojas que podem vender a coleção
})

// Estoque central: cadastro/curadoria da coleção é papel da rede (gestor de estoque).
const MUTACAO = ['SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA'] as const

/** Valida que todas as lojas pertencem à rede e devolve os ids válidos (sem duplicados). */
async function lojasDaRede(redeId: string, lojaIds: string[]): Promise<string[]> {
  const unicos = [...new Set(lojaIds)]
  if (unicos.length === 0) return []
  const lojas = await prisma.loja.findMany({ where: { id: { in: unicos }, redeId }, select: { id: true } })
  return lojas.map((l) => l.id)
}

export async function colecoesRoutes(app: FastifyInstance) {
  // Lista as coleções da REDE. Papéis de loja só veem as distribuídas à sua loja
  // (a vendedora, apenas as LIBERADAS).
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const { status } = request.query as { status?: string }
    const role = request.user.role
    const where: Prisma.ColecaoWhereInput = { redeId }
    if (status === 'EM_PREPARACAO' || status === 'LIBERADA') where.status = status
    if (role === 'GERENTE' || role === 'VENDEDORA') {
      const lojaId = await lojaIdDe(request)
      where.lojas = { some: { lojaId } }
      if (role === 'VENDEDORA') where.status = 'LIBERADA'
    }

    const [colecoes, rede] = await Promise.all([
      prisma.colecao.findMany({
        where,
        orderBy: [{ status: 'asc' }, { nome: 'asc' }],
        include: { _count: { select: { produtos: true } }, lojas: { select: { lojaId: true } } },
      }),
      prisma.rede.findUnique({ where: { id: redeId }, select: { plano: true } }),
    ])
    const agora = Date.now()
    return colecoes.map((c) => {
      const expira = c.status === 'LIBERADA' && rede?.plano ? midiaExpiraEm(c.liberadaEm, rede.plano) : null
      const diasParaExpirarMidia = expira ? Math.ceil((expira.getTime() - agora) / 86_400_000) : null
      return {
        id: c.id,
        nome: c.nome,
        descricao: c.descricao,
        status: c.status,
        liberadaEm: c.liberadaEm,
        validadeAte: c.validadeAte,
        vigenciaExpirada: !!c.validadeAte && c.validadeAte.getTime() < agora,
        outlet: c.outlet,
        outletDesde: c.outletDesde,
        descontoOutletPct: c.descontoOutletPct,
        pecas: c._count.produtos,
        lojaIds: c.lojas.map((l) => l.lojaId), // distribuição (para os toggles no frontend)
        // Limpeza de mídia por plano: aviso ao gestor (data + contagem regressiva).
        midiaExpiraEm: expira,
        diasParaExpirarMidia,
        midiaExpiradaEm: c.midiaExpiradaEm,
      }
    })
  })

  // Cria uma coleção vazia (em preparação) para o gestor de estoque ir cadastrando as peças.
  // Pode já distribuir para um conjunto de lojas.
  app.post('/', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const body = criarSchema.parse(request.body)
    const lojaIds = body.lojaIds ? await lojasDaRede(redeId, body.lojaIds) : []
    try {
      const colecao = await prisma.colecao.create({
        data: {
          redeId,
          nome: body.nome.trim(),
          descricao: body.descricao,
          validadeAte: body.validadeAte,
          lojas: lojaIds.length ? { create: lojaIds.map((lojaId) => ({ lojaId })) } : undefined,
        },
      })
      return reply.code(201).send(colecao)
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') return reply.code(409).send({ erro: `Já existe uma coleção "${body.nome}" nesta marca` })
      throw e
    }
  })

  app.patch('/:id', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const body = criarSchema.partial().parse(request.body)
    const existente = await prisma.colecao.findFirst({ where: { id, redeId } })
    if (!existente) return reply.code(404).send({ erro: 'Coleção não encontrada' })
    return prisma.colecao.update({
      where: { id },
      data: { nome: body.nome?.trim(), descricao: body.descricao, ...(body.validadeAte !== undefined ? { validadeAte: body.validadeAte } : {}) },
    })
  })

  // Define a distribuição da coleção (toggles): o conjunto COMPLETO de lojas que podem vendê-la.
  app.put('/:id/distribuicao', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const body = distribuicaoSchema.parse(request.body)
    const colecao = await prisma.colecao.findFirst({ where: { id, redeId } })
    if (!colecao) return reply.code(404).send({ erro: 'Coleção não encontrada' })

    const lojaIds = await lojasDaRede(redeId, body.lojaIds)
    await prisma.$transaction([
      prisma.colecaoLoja.deleteMany({ where: { colecaoId: id, lojaId: { notIn: lojaIds.length ? lojaIds : ['__nenhuma__'] } } }),
      prisma.colecaoLoja.createMany({ data: lojaIds.map((lojaId) => ({ colecaoId: id, lojaId })), skipDuplicates: true }),
    ])
    return { id, lojaIds }
  })

  // Libera a coleção: passa a aparecer simultaneamente para as vendedoras das lojas distribuídas.
  app.post('/:id/liberar', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const colecao = await prisma.colecao.findFirst({ where: { id, redeId }, include: { _count: { select: { produtos: true } } } })
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
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const body = z.object({
      outlet: z.boolean(),
      descontoOutletPct: z.number().int().min(1).max(90).nullish(),
      descontosPorPeca: z.array(z.object({ produtoId: z.string(), pct: z.number().int().min(1).max(90).nullable() })).optional(),
    }).parse(request.body)

    const colecao = await prisma.colecao.findFirst({ where: { id, redeId } })
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
        await tx.produto.updateMany({ where: { colecaoId: id, redeId }, data: { descontoOutletPct: null } })
      } else if (body.descontosPorPeca?.length) {
        for (const d of body.descontosPorPeca) {
          await tx.produto.updateMany({ where: { id: d.produtoId, colecaoId: id, redeId }, data: { descontoOutletPct: d.pct } })
        }
      }
      return { id: atualizada.id, outlet: atualizada.outlet, outletDesde: atualizada.outletDesde, descontoOutletPct: atualizada.descontoOutletPct }
    })
  })

  // Exclui a coleção. As peças NÃO são apagadas — Produto.colecaoId vira null (SetNull no schema).
  app.delete('/:id', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const colecao = await prisma.colecao.findFirst({ where: { id, redeId } })
    if (!colecao) return reply.code(404).send({ erro: 'Coleção não encontrada' })
    await prisma.colecao.delete({ where: { id } })
    return { ok: true }
  })

  // Recolhe a coleção (volta a esconder das vendedoras) — correção/ajuste pelo gestor de estoque.
  app.post('/:id/recolher', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const colecao = await prisma.colecao.findFirst({ where: { id, redeId } })
    if (!colecao) return reply.code(404).send({ erro: 'Coleção não encontrada' })
    return prisma.colecao.update({ where: { id }, data: { status: 'EM_PREPARACAO', liberadaEm: null } })
  })
}

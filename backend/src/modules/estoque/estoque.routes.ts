import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { redeIdDeQualquer } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { flagPedidosDisponiveis } from '../reservas/reservas.service'

const itemEntradaSchema = z.object({
  variacaoId: z.string(),
  quantidade: z.coerce.number().int().positive(),
})

const entradaSchema = z.object({
  nota: z.string().optional(), // referência da nota/lote da confecção
  observacao: z.string().optional(),
  itens: z.array(itemEntradaSchema).min(1, 'Informe ao menos um item'),
})

const ajusteSchema = z.object({
  variacaoId: z.string(),
  novaQuantidade: z.coerce.number().int().nonnegative(),
  motivo: z.string().min(1, 'Informe o motivo do ajuste'),
})

// Remaneja a reserva de varejo (transfere do atacado p/ varejo, ou estorna), sem mexer no total.
const reservaSchema = z.object({
  variacaoId: z.string(),
  quantidadeVarejo: z.coerce.number().int().nonnegative(),
})

// Estoque central da fábrica: operado pelo gestor de estoque (papéis de rede).
const GESTAO = ['SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA'] as const

const PARADO_DIAS = 60 // sem saída de venda há 60+ dias e com estoque = encalhado
const num = (v: unknown) => Number(v ?? 0)

/** KPIs do estoque central (rede). comDetalhe inclui as listas de críticos e parados. */
async function kpiEstoqueRede(redeId: string, comDetalhe: boolean) {
  const desde = new Date(Date.now() - PARADO_DIAS * 86_400_000)
  const [variacoes, vendidas] = await Promise.all([
    prisma.variacaoProduto.findMany({
      where: { produto: { redeId, ativo: true } },
      select: {
        id: true, cor: true, tamanho: true, estoque: true, estoqueMinimo: true,
        produto: { select: { nome: true, referencia: true, custo: true, precoVarejo: true } },
      },
    }),
    prisma.movimentoEstoque.findMany({
      where: { tipo: 'SAIDA_VENDA', createdAt: { gte: desde }, variacao: { produto: { redeId } } },
      select: { variacaoId: true }, distinct: ['variacaoId'],
    }),
  ])

  const vendidasSet = new Set(vendidas.map((v) => v.variacaoId))
  let totalPecas = 0, valorCusto = 0, valorVenda = 0, criticosCount = 0, paradosCount = 0
  const criticos: { produto: string; referencia: string | null; cor: string; tamanho: string; estoque: number; estoqueMinimo: number }[] = []
  const parados: { produto: string; referencia: string | null; cor: string; tamanho: string; estoque: number; valorCusto: number }[] = []

  for (const v of variacoes) {
    totalPecas += v.estoque
    valorCusto += v.estoque * num(v.produto.custo)
    valorVenda += v.estoque * num(v.produto.precoVarejo)
    if (v.estoque <= v.estoqueMinimo) {
      criticosCount += 1
      if (comDetalhe) criticos.push({ produto: v.produto.nome, referencia: v.produto.referencia, cor: v.cor, tamanho: v.tamanho, estoque: v.estoque, estoqueMinimo: v.estoqueMinimo })
    }
    if (v.estoque > 0 && !vendidasSet.has(v.id)) {
      paradosCount += 1
      if (comDetalhe) parados.push({ produto: v.produto.nome, referencia: v.produto.referencia, cor: v.cor, tamanho: v.tamanho, estoque: v.estoque, valorCusto: v.estoque * num(v.produto.custo) })
    }
  }

  const base = { totalPecas, valorCusto, valorVenda, skus: variacoes.length, criticosCount, paradosCount }
  if (!comDetalhe) return base
  return {
    ...base,
    criticos: criticos.sort((a, b) => a.estoque - b.estoque).slice(0, 20),
    parados: parados.sort((a, b) => b.valorCusto - a.valorCusto).slice(0, 20),
  }
}

/**
 * Estoque CENTRAL (fábrica/marca) — operado pelo gestor de estoque:
 * entrada de produção, ajuste/contagem (físico = sistema) e extrato de movimentos.
 * As saídas entram aqui automaticamente pelas vendas (de qualquer loja/vendedora).
 */
export async function estoqueRoutes(app: FastifyInstance) {
  // Entrada de produção da confecção no estoque central.
  app.post('/entrada', { preHandler: [app.authorize(...GESTAO)] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const body = entradaSchema.parse(request.body)

    const ids = body.itens.map((i) => i.variacaoId)
    const variacoes = await prisma.variacaoProduto.findMany({ where: { id: { in: ids }, produto: { redeId } }, select: { id: true } })
    const validos = new Set(variacoes.map((v) => v.id))
    for (const item of body.itens) {
      if (!validos.has(item.variacaoId)) return reply.code(422).send({ erro: `Variação ${item.variacaoId} inválida para esta marca` })
    }

    const base = body.nota ? `Entrada · nota ${body.nota}` : 'Entrada de produção'
    const motivo = body.observacao ? `${base} — ${body.observacao}` : base

    await prisma.$transaction(async (tx) => {
      for (const item of body.itens) {
        await tx.variacaoProduto.update({ where: { id: item.variacaoId }, data: { estoque: { increment: item.quantidade } } })
        await tx.movimentoEstoque.create({ data: { variacaoId: item.variacaoId, tipo: 'ENTRADA', quantidade: item.quantidade, motivo } })
        // Reposição pode cobrir pedidos de reserva pendentes dessa variação (FIFO).
        await flagPedidosDisponiveis(tx, item.variacaoId)
      }
    })

    const totalPecas = body.itens.reduce((s, i) => s + i.quantidade, 0)
    return reply.code(201).send({ ok: true, itens: body.itens.length, totalPecas })
  })

  // Ajuste/contagem: define a quantidade física real (físico = sistema)
  app.post('/ajuste', { preHandler: [app.authorize(...GESTAO)] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const body = ajusteSchema.parse(request.body)

    const v = await prisma.variacaoProduto.findFirst({ where: { id: body.variacaoId, produto: { redeId } }, select: { id: true, estoque: true, estoqueVarejo: true } })
    if (!v) return reply.code(422).send({ erro: 'Variação inválida para esta marca' })

    const delta = body.novaQuantidade - v.estoque
    if (delta === 0) return { ok: true, delta: 0 }

    await prisma.$transaction(async (tx) => {
      await tx.variacaoProduto.update({
        where: { id: v.id },
        // Se o novo total ficar abaixo da reserva de varejo, encolhe a reserva junto.
        data: { estoque: body.novaQuantidade, ...(body.novaQuantidade < v.estoqueVarejo ? { estoqueVarejo: body.novaQuantidade } : {}) },
      })
      await tx.movimentoEstoque.create({ data: { variacaoId: v.id, tipo: 'AJUSTE', quantidade: delta, motivo: body.motivo } })
    })
    return { ok: true, delta }
  })

  // Remaneja a reserva de varejo de uma variação (atacado ↔ varejo), sem alterar o total.
  app.post('/reserva-varejo', { preHandler: [app.authorize(...GESTAO)] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const body = reservaSchema.parse(request.body)
    const v = await prisma.variacaoProduto.findFirst({ where: { id: body.variacaoId, produto: { redeId } }, select: { id: true, estoque: true } })
    if (!v) return reply.code(422).send({ erro: 'Variação inválida para esta marca' })
    const novaVarejo = Math.min(body.quantidadeVarejo, v.estoque) // a reserva nunca passa do total
    await prisma.variacaoProduto.update({ where: { id: v.id }, data: { estoqueVarejo: novaVarejo } })
    return { ok: true, estoqueVarejo: novaVarejo, estoqueAtacado: v.estoque - novaVarejo }
  })

  // Extrato de movimentos do estoque central (entradas, saídas de venda, ajustes, devoluções)
  app.get('/movimentos', { preHandler: [app.authorize(...GESTAO)] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const { tipo } = request.query as { tipo?: string }

    const where: Prisma.MovimentoEstoqueWhereInput = { variacao: { produto: { redeId } } }
    if (tipo) where.tipo = tipo as never

    return prisma.movimentoEstoque.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { variacao: { include: { produto: { select: { nome: true, referencia: true } } } } },
    })
  })

  // Dashboard do estoque central da marca.
  app.get('/dashboard', { preHandler: [app.authorize(...GESTAO)] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { nome: true } })
    return { papel: 'REDE', rede, ...(await kpiEstoqueRede(redeId, true)) }
  })

  // Estoque inteligente: campeões de venda (30d) e previsão de ruptura (estoque central)
  app.get('/inteligencia', { preHandler: [requireFeature('estoque_inteligente'), app.authorize(...GESTAO)] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const desde = new Date(Date.now() - 30 * 86_400_000)
    const [variacoes, saidas] = await Promise.all([
      prisma.variacaoProduto.findMany({
        where: { produto: { redeId, ativo: true } },
        select: { id: true, cor: true, tamanho: true, estoque: true, produto: { select: { id: true, nome: true, referencia: true } } },
      }),
      prisma.movimentoEstoque.findMany({
        where: { tipo: 'SAIDA_VENDA', createdAt: { gte: desde }, variacao: { produto: { redeId } } },
        select: { variacaoId: true, quantidade: true },
      }),
    ])

    const vendidoPorVar = new Map<string, number>()
    for (const s of saidas) vendidoPorVar.set(s.variacaoId, (vendidoPorVar.get(s.variacaoId) ?? 0) + Math.abs(s.quantidade))

    const porProduto = new Map<string, { produto: string; referencia: string | null; qtd: number }>()
    const ruptura: { produto: string; referencia: string | null; cor: string; tamanho: string; estoque: number; vendidos30: number; diasEstimados: number }[] = []

    for (const v of variacoes) {
      const vend = vendidoPorVar.get(v.id) ?? 0
      if (vend <= 0) continue
      const p = porProduto.get(v.produto.id) ?? { produto: v.produto.nome, referencia: v.produto.referencia, qtd: 0 }
      p.qtd += vend
      porProduto.set(v.produto.id, p)
      const porDia = vend / 30
      const dias = Math.floor(v.estoque / porDia)
      if (v.estoque > 0 && dias < 10) {
        ruptura.push({ produto: v.produto.nome, referencia: v.produto.referencia, cor: v.cor, tamanho: v.tamanho, estoque: v.estoque, vendidos30: vend, diasEstimados: dias })
      }
    }

    return {
      campeoes: [...porProduto.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 10),
      ruptura: ruptura.sort((a, b) => a.diasEstimados - b.diasEstimados).slice(0, 20),
    }
  })
}

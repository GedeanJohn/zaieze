import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'

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

const GESTAO = ['SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE'] as const

const PARADO_DIAS = 60 // sem saída de venda há 60+ dias e com estoque = encalhado
const num = (v: unknown) => Number(v ?? 0)

/** KPIs de estoque de uma loja. comDetalhe inclui as listas de críticos e parados. */
async function kpiEstoqueLoja(lojaId: string, comDetalhe: boolean) {
  const desde = new Date(Date.now() - PARADO_DIAS * 86_400_000)
  const [variacoes, vendidas, transito] = await Promise.all([
    prisma.variacaoProduto.findMany({
      where: { produto: { lojaId, ativo: true } },
      select: {
        id: true, cor: true, tamanho: true, estoque: true, estoqueMinimo: true,
        produto: { select: { nome: true, referencia: true, custo: true, precoVarejo: true } },
      },
    }),
    prisma.movimentoEstoque.findMany({
      where: { tipo: 'SAIDA_VENDA', createdAt: { gte: desde }, variacao: { produto: { lojaId } } },
      select: { variacaoId: true }, distinct: ['variacaoId'],
    }),
    prisma.transferenciaItem.aggregate({
      where: { transferencia: { status: 'EM_TRANSITO', lojaOrigemId: lojaId } },
      _sum: { quantidadeEnviada: true },
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

  const base = { totalPecas, valorCusto, valorVenda, skus: variacoes.length, criticosCount, paradosCount, emTransito: num(transito._sum.quantidadeEnviada) }
  if (!comDetalhe) return base
  return {
    ...base,
    criticos: criticos.sort((a, b) => a.estoque - b.estoque).slice(0, 20),
    parados: parados.sort((a, b) => b.valorCusto - a.valorCusto).slice(0, 20),
  }
}

/**
 * Estoque — operações da estoquista (rede) e do gerente (loja):
 * entrada de produção (confecção → loja), ajuste/contagem (físico = sistema)
 * e extrato de movimentos. Saídas entram aqui automaticamente pelas vendas.
 */
export async function estoqueRoutes(app: FastifyInstance) {
  // Entrada de produção: confecção entrega na loja
  app.post('/entrada', { preHandler: [app.authorize(...GESTAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = entradaSchema.parse(request.body)

    const ids = body.itens.map((i) => i.variacaoId)
    const variacoes = await prisma.variacaoProduto.findMany({ where: { id: { in: ids }, produto: { lojaId } }, select: { id: true } })
    const validos = new Set(variacoes.map((v) => v.id))
    for (const item of body.itens) {
      if (!validos.has(item.variacaoId)) return reply.code(422).send({ erro: `Variação ${item.variacaoId} inválida para esta loja` })
    }

    const base = body.nota ? `Entrada · nota ${body.nota}` : 'Entrada de produção'
    const motivo = body.observacao ? `${base} — ${body.observacao}` : base

    await prisma.$transaction(async (tx) => {
      for (const item of body.itens) {
        await tx.variacaoProduto.update({ where: { id: item.variacaoId }, data: { estoque: { increment: item.quantidade } } })
        await tx.movimentoEstoque.create({ data: { variacaoId: item.variacaoId, tipo: 'ENTRADA', quantidade: item.quantidade, motivo } })
      }
    })

    const totalPecas = body.itens.reduce((s, i) => s + i.quantidade, 0)
    return reply.code(201).send({ ok: true, itens: body.itens.length, totalPecas })
  })

  // Ajuste/contagem: define a quantidade física real (físico = sistema)
  app.post('/ajuste', { preHandler: [app.authorize(...GESTAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = ajusteSchema.parse(request.body)

    const v = await prisma.variacaoProduto.findFirst({ where: { id: body.variacaoId, produto: { lojaId } }, select: { id: true, estoque: true } })
    if (!v) return reply.code(422).send({ erro: 'Variação inválida para esta loja' })

    const delta = body.novaQuantidade - v.estoque
    if (delta === 0) return { ok: true, delta: 0 }

    await prisma.$transaction(async (tx) => {
      await tx.variacaoProduto.update({ where: { id: v.id }, data: { estoque: body.novaQuantidade } })
      await tx.movimentoEstoque.create({ data: { variacaoId: v.id, tipo: 'AJUSTE', quantidade: delta, motivo: body.motivo } })
    })
    return { ok: true, delta }
  })

  // Extrato de movimentos da loja (entradas, saídas de venda, ajustes, devoluções)
  app.get('/movimentos', { preHandler: [app.authorize(...GESTAO)] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { tipo } = request.query as { tipo?: string }

    const where: Prisma.MovimentoEstoqueWhereInput = { variacao: { produto: { lojaId } } }
    if (tipo) where.tipo = tipo as never

    return prisma.movimentoEstoque.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { variacao: { include: { produto: { select: { nome: true, referencia: true } } } } },
    })
  })

  // Dashboard de estoque: consolidado da rede (gestor/estoquista) ou de uma loja
  app.get('/dashboard', { preHandler: [app.authorize(...GESTAO)] }, async (request) => {
    const { role } = request.user
    const q = request.query as { lojaId?: string }

    if ((role === 'GESTOR' || role === 'ESTOQUISTA' || role === 'SUPER_ADMIN') && !q.lojaId) {
      const redeId = redeIdDe(request)
      const [rede, lojas] = await Promise.all([
        prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { nome: true } }),
        prisma.loja.findMany({ where: { redeId }, orderBy: { createdAt: 'asc' }, select: { id: true, nome: true, ativo: true } }),
      ])
      const porLoja = await Promise.all(lojas.map(async (l) => ({ id: l.id, nome: l.nome, ativo: l.ativo, ...(await kpiEstoqueLoja(l.id, false)) })))
      const consolidado = porLoja.reduce(
        (a, l) => ({
          totalPecas: a.totalPecas + l.totalPecas,
          valorCusto: a.valorCusto + l.valorCusto,
          valorVenda: a.valorVenda + l.valorVenda,
          criticosCount: a.criticosCount + l.criticosCount,
          paradosCount: a.paradosCount + l.paradosCount,
          emTransito: a.emTransito + l.emTransito,
        }),
        { totalPecas: 0, valorCusto: 0, valorVenda: 0, criticosCount: 0, paradosCount: 0, emTransito: 0 },
      )
      return { papel: 'REDE', rede, consolidado, porLoja }
    }

    const lojaId = await lojaIdDe(request)
    const loja = await prisma.loja.findUniqueOrThrow({ where: { id: lojaId }, select: { nome: true } })
    return { papel: 'LOJA', loja: loja.nome, ...(await kpiEstoqueLoja(lojaId, true)) }
  })

  // Estoque inteligente: campeões de venda (30d) e previsão de ruptura
  app.get('/inteligencia', { preHandler: [requireFeature('estoque_inteligente'), app.authorize(...GESTAO)] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const desde = new Date(Date.now() - 30 * 86_400_000)
    const [variacoes, saidas] = await Promise.all([
      prisma.variacaoProduto.findMany({
        where: { produto: { lojaId, ativo: true } },
        select: { id: true, cor: true, tamanho: true, estoque: true, produto: { select: { id: true, nome: true, referencia: true } } },
      }),
      prisma.movimentoEstoque.findMany({
        where: { tipo: 'SAIDA_VENDA', createdAt: { gte: desde }, variacao: { produto: { lojaId } } },
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

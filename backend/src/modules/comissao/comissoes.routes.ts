import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDeQualquer } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { metaDaLoja, numVendedorasAtivas } from '../metas/metas.service'

const num = (v: unknown) => Number(v ?? 0)

function janelaMes(mes?: string): { inicio: Date; fim: Date } {
  const base = mes ? new Date(`${mes}-01T00:00:00`) : new Date()
  return { inicio: new Date(base.getFullYear(), base.getMonth(), 1), fim: new Date(base.getFullYear(), base.getMonth() + 1, 1) }
}

const regraSchema = z.object({
  escopo: z.enum(['PRODUTO', 'CATEGORIA', 'MARCA', 'PADRAO']),
  refId: z.string().optional(),
  percentual: z.coerce.number().min(0).max(100),
  percentualMeta: z.coerce.number().min(0).max(100).optional(),
})

const GESTAO = ['SUPER_ADMIN', 'GESTOR', 'GERENTE'] as const

/**
 * Comissão automática (módulo 9): regra mais específica vence
 * (produto > categoria > marca > padrão) + bônus quando a vendedora bate a meta.
 */
export async function comissoesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireFeature('gamificacao'))

  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { mes } = request.query as { mes?: string }
    const { inicio, fim } = janelaMes(mes)
    const ehVendedora = request.user.role === 'VENDEDORA'

    const [regras, vendedoras, vendas] = await Promise.all([
      prisma.regraComissao.findMany({ where: { lojaId } }),
      prisma.usuario.findMany({
        where: { lojaId, role: 'VENDEDORA', ...(ehVendedora ? { id: request.user.sub } : {}) },
        select: { id: true, nome: true, metaMensal: true, comissaoPadrao: true },
      }),
      prisma.venda.findMany({
        where: { lojaId, status: 'CONCLUIDA', createdAt: { gte: inicio, lt: fim }, ...(ehVendedora ? { vendedoraId: request.user.sub } : {}) },
        select: { vendedoraId: true, itens: { select: { quantidade: true, precoUnitario: true, variacao: { select: { produto: { select: { id: true, categoriaId: true, marcaId: true } } } } } } },
      }),
    ])

    const porProduto = new Map<string, { p: number; pm: number | null }>()
    const porCategoria = new Map<string, { p: number; pm: number | null }>()
    const porMarca = new Map<string, { p: number; pm: number | null }>()
    let padrao: { p: number; pm: number | null } | null = null
    for (const r of regras) {
      const val = { p: num(r.percentual), pm: r.percentualMeta != null ? num(r.percentualMeta) : null }
      if (r.escopo === 'PRODUTO' && r.refId) porProduto.set(r.refId, val)
      else if (r.escopo === 'CATEGORIA' && r.refId) porCategoria.set(r.refId, val)
      else if (r.escopo === 'MARCA' && r.refId) porMarca.set(r.refId, val)
      else if (r.escopo === 'PADRAO') padrao = val
    }

    // Agrupa vendas por vendedora
    const porVend = new Map<string, typeof vendas>()
    for (const v of vendas) {
      const arr = porVend.get(v.vendedoraId) ?? []
      arr.push(v)
      porVend.set(v.vendedoraId, arr)
    }

    // Meta derivada da vendedora = meta da loja ÷ nº de vendedoras ativas (todas iguais).
    const metaLoja = await metaDaLoja(lojaId)
    const nAtivas = await numVendedorasAtivas(lojaId)
    const metaVend = nAtivas > 0 ? metaLoja / nAtivas : 0

    const resultado = vendedoras.map((vd) => {
      const minhasVendas = porVend.get(vd.id) ?? []
      const totalVendido = minhasVendas.reduce((s, v) => s + v.itens.reduce((si, i) => si + num(i.precoUnitario) * i.quantidade, 0), 0)
      const meta = metaVend > 0 ? metaVend : null
      const atingiuMeta = meta != null && meta > 0 && totalVendido >= meta
      const padraoVend = vd.comissaoPadrao != null ? { p: num(vd.comissaoPadrao), pm: null } : null

      let comissao = 0
      for (const v of minhasVendas) {
        for (const item of v.itens) {
          const prod = item.variacao.produto
          const regra =
            porProduto.get(prod.id) ??
            (prod.categoriaId ? porCategoria.get(prod.categoriaId) : undefined) ??
            (prod.marcaId ? porMarca.get(prod.marcaId) : undefined) ??
            padrao ??
            padraoVend
          if (!regra) continue
          const pct = atingiuMeta && regra.pm != null ? regra.pm : regra.p
          comissao += num(item.precoUnitario) * item.quantidade * (pct / 100)
        }
      }

      return {
        vendedoraId: vd.id,
        nome: vd.nome,
        totalVendido,
        comissao,
        meta,
        atingiuMeta,
        pctMeta: meta && meta > 0 ? Math.round((totalVendido / meta) * 100) : null,
      }
    }).sort((a, b) => b.comissao - a.comissao)

    return resultado
  })

  // Regras (gerente/gestor): com rótulo legível do alvo
  app.get('/regras', { preHandler: [app.authorize(...GESTAO)] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const redeId = await redeIdDeQualquer(request)
    // Regras de comissão são por loja; o catálogo de alvos (produto/categoria/marca) é da rede (central).
    const [regras, produtos, categorias, marcas] = await Promise.all([
      prisma.regraComissao.findMany({ where: { lojaId }, orderBy: { escopo: 'asc' } }),
      prisma.produto.findMany({ where: { redeId }, select: { id: true, nome: true } }),
      prisma.categoria.findMany({ where: { redeId }, select: { id: true, nome: true } }),
      prisma.marca.findMany({ where: { redeId }, select: { id: true, nome: true } }),
    ])
    const nome = (escopo: string, refId: string | null) => {
      if (escopo === 'PADRAO') return 'Padrão da loja'
      const m = escopo === 'PRODUTO' ? produtos : escopo === 'CATEGORIA' ? categorias : marcas
      return m.find((x) => x.id === refId)?.nome ?? refId ?? '—'
    }
    return regras.map((r) => ({ ...r, alvo: nome(r.escopo, r.refId) }))
  })

  app.post('/regras', { preHandler: [app.authorize(...GESTAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const b = regraSchema.parse(request.body)
    if (b.escopo !== 'PADRAO' && !b.refId) return reply.code(422).send({ erro: 'Informe o alvo da regra (produto/categoria/marca)' })
    // Sentinela para PADRAO evita NULL na chave única composta (e mantém o upsert estável)
    const refId = b.escopo === 'PADRAO' ? '_PADRAO_' : b.refId!
    return prisma.regraComissao.upsert({
      where: { lojaId_escopo_refId: { lojaId, escopo: b.escopo, refId } },
      create: { lojaId, escopo: b.escopo, refId, percentual: b.percentual, percentualMeta: b.percentualMeta },
      update: { percentual: b.percentual, percentualMeta: b.percentualMeta },
    })
  })
}

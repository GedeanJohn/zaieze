import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDe } from '../../plugins/auth'

function inicioDoDia(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function inicioDoMes(): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

const num = (v: unknown) => Number(v ?? 0)

/** KPIs de uma loja no mês: usado pelo gerente e, por loja, pelo gestor. */
async function kpisDaLoja(lojaId: string) {
  const [hoje, mes, online, clientes, inativos] = await Promise.all([
    prisma.venda.aggregate({
      where: { lojaId, status: 'CONCLUIDA', createdAt: { gte: inicioDoDia() } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.venda.aggregate({
      where: { lojaId, status: 'CONCLUIDA', createdAt: { gte: inicioDoMes() } },
      _sum: { total: true },
      _count: true,
    }),
    // venda online (WhatsApp) do mês — foco do produto
    prisma.venda.aggregate({
      where: { lojaId, status: 'CONCLUIDA', canal: 'ONLINE', createdAt: { gte: inicioDoMes() } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.cliente.count({ where: { lojaId, ativo: true } }),
    prisma.cliente.count({ where: { lojaId, ativo: true, segmento: 'INATIVO' } }),
  ])

  const faturamentoMes = num(mes._sum.total)
  const faturamentoOnlineMes = num(online._sum.total)
  return {
    faturamentoHoje: num(hoje._sum.total),
    vendasHoje: hoje._count,
    faturamentoMes,
    vendasMes: mes._count,
    ticketMedioMes: mes._count > 0 ? faturamentoMes / mes._count : 0,
    faturamentoOnlineMes,
    vendasOnlineMes: online._count,
    pctOnlineMes: faturamentoMes > 0 ? Math.round((faturamentoOnlineMes / faturamentoMes) * 100) : 0,
    clientes,
    clientesInativos: inativos,
  }
}

/** Visão completa da loja: por vendedora, por equipe, top produtos/clientes, estoque crítico. */
async function dashboardDaLoja(lojaId: string) {
  const kpis = await kpisDaLoja(lojaId)

  const [vendedoras, vendasMes, estoqueCritico, topClientes] = await Promise.all([
    prisma.usuario.findMany({
      where: { lojaId, role: 'VENDEDORA' },
      select: {
        id: true, nome: true, ativo: true, metaMensal: true,
        equipe: { select: { id: true, nome: true } },
        _count: { select: { carteira: true } },
      },
    }),
    prisma.venda.findMany({
      where: { lojaId, status: 'CONCLUIDA', createdAt: { gte: inicioDoMes() } },
      include: { itens: { include: { variacao: { include: { produto: { select: { id: true, nome: true } } } } } } },
    }),
    prisma.variacaoProduto.findMany({
      where: { produto: { lojaId, ativo: true }, estoque: { lte: prisma.variacaoProduto.fields.estoqueMinimo } },
      include: { produto: { select: { nome: true } } },
      orderBy: { estoque: 'asc' },
      take: 20,
    }),
    prisma.cliente.findMany({
      where: { lojaId, ativo: true, totalGasto: { gt: 0 } },
      orderBy: { totalGasto: 'desc' },
      take: 5,
      select: { id: true, nome: true, totalGasto: true, segmento: true },
    }),
  ])

  // Agrega vendas do mês por vendedora e por produto
  const porVendedoraMap = new Map<string, { total: number; qtd: number; online: number; qtdOnline: number }>()
  const porProdutoMap = new Map<string, { nome: string; qtd: number; total: number }>()
  // Mix por forma de recebimento, com ranking de vendedoras dentro de cada forma
  const porFormaMap = new Map<string, { total: number; qtd: number; porVend: Map<string, number> }>()
  for (const venda of vendasMes) {
    const acc = porVendedoraMap.get(venda.vendedoraId) ?? { total: 0, qtd: 0, online: 0, qtdOnline: 0 }
    acc.total += num(venda.total)
    acc.qtd += 1
    if (venda.canal === 'ONLINE') {
      acc.online += num(venda.total)
      acc.qtdOnline += 1
    }
    porVendedoraMap.set(venda.vendedoraId, acc)

    const fr = venda.formaRecebimento
    const af = porFormaMap.get(fr) ?? { total: 0, qtd: 0, porVend: new Map<string, number>() }
    af.total += num(venda.total)
    af.qtd += 1
    af.porVend.set(venda.vendedoraId, (af.porVend.get(venda.vendedoraId) ?? 0) + num(venda.total))
    porFormaMap.set(fr, af)

    for (const item of venda.itens) {
      const p = item.variacao.produto
      const ap = porProdutoMap.get(p.id) ?? { nome: p.nome, qtd: 0, total: 0 }
      ap.qtd += item.quantidade
      ap.total += num(item.precoUnitario) * item.quantidade
      porProdutoMap.set(p.id, ap)
    }
  }

  const porVendedora = vendedoras.map((v) => {
    const agg = porVendedoraMap.get(v.id) ?? { total: 0, qtd: 0, online: 0, qtdOnline: 0 }
    const meta = v.metaMensal ? num(v.metaMensal) : null
    return {
      id: v.id,
      nome: v.nome,
      ativo: v.ativo,
      equipe: v.equipe?.nome ?? null,
      clientesCarteira: v._count.carteira,
      totalMes: agg.total,
      vendasMes: agg.qtd,
      ticketMedio: agg.qtd > 0 ? agg.total / agg.qtd : 0,
      onlineMes: agg.online,
      vendasOnlineMes: agg.qtdOnline,
      pctOnline: agg.total > 0 ? Math.round((agg.online / agg.total) * 100) : 0,
      meta,
      pctMeta: meta && meta > 0 ? Math.round((agg.total / meta) * 100) : null,
    }
  }).sort((a, b) => b.totalMes - a.totalMes)

  // Por equipe (agregando as vendedoras)
  const porEquipeMap = new Map<string, { nome: string; total: number; qtd: number; vendedoras: number }>()
  for (const v of porVendedora) {
    const chave = v.equipe ?? 'Sem equipe'
    const acc = porEquipeMap.get(chave) ?? { nome: chave, total: 0, qtd: 0, vendedoras: 0 }
    acc.total += v.totalMes
    acc.qtd += v.vendasMes
    acc.vendedoras += 1
    porEquipeMap.set(chave, acc)
  }

  const nomeVend = new Map(vendedoras.map((vd) => [vd.id, vd.nome]))
  const porFormaRecebimento = [...porFormaMap.entries()]
    .map(([forma, f]) => ({
      forma,
      total: f.total,
      qtd: f.qtd,
      vendedoras: [...f.porVend.entries()]
        .map(([id, total]) => ({ nome: nomeVend.get(id) ?? '—', total }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total)

  return {
    ...kpis,
    porVendedora,
    porFormaRecebimento,
    porEquipe: [...porEquipeMap.values()].sort((a, b) => b.total - a.total),
    topProdutos: [...porProdutoMap.values()].sort((a, b) => b.qtd - a.qtd).slice(0, 5),
    topClientes: topClientes.map((c) => ({ ...c, totalGasto: num(c.totalGasto) })),
    estoqueCritico: estoqueCritico.map((v) => ({
      produto: v.produto.nome, cor: v.cor, tamanho: v.tamanho, sku: v.sku,
      estoque: v.estoque, estoqueMinimo: v.estoqueMinimo,
    })),
  }
}

/**
 * Dashboard hierárquico (módulo 1 da spec):
 * - GESTOR: consolidado da rede + cartões por loja (até o nível de loja).
 * - GERENTE: loja completa — equipes, vendedoras, top produtos, estoque crítico.
 * - VENDEDORA: apenas o relatório das próprias vendas.
 */
export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request: FastifyRequest) => {
    const { role } = request.user

    // ── VENDEDORA: relatório individual ──
    if (role === 'VENDEDORA') {
      const vendedoraId = request.user.sub
      const [hoje, mes, online, eu, carteira, formaRaw] = await Promise.all([
        prisma.venda.aggregate({
          where: { vendedoraId, status: 'CONCLUIDA', createdAt: { gte: inicioDoDia() } },
          _sum: { total: true }, _count: true,
        }),
        prisma.venda.aggregate({
          where: { vendedoraId, status: 'CONCLUIDA', createdAt: { gte: inicioDoMes() } },
          _sum: { total: true }, _count: true,
        }),
        prisma.venda.aggregate({
          where: { vendedoraId, status: 'CONCLUIDA', canal: 'ONLINE', createdAt: { gte: inicioDoMes() } },
          _sum: { total: true }, _count: true,
        }),
        prisma.usuario.findUniqueOrThrow({ where: { id: vendedoraId }, select: { metaMensal: true, equipe: { select: { nome: true } } } }),
        prisma.cliente.count({ where: { vendedoraId, ativo: true } }),
        prisma.venda.groupBy({
          by: ['formaRecebimento'],
          where: { vendedoraId, status: 'CONCLUIDA', createdAt: { gte: inicioDoMes() } },
          _sum: { total: true }, _count: true,
        }),
      ])
      const totalMes = num(mes._sum.total)
      const onlineMes = num(online._sum.total)
      const meta = eu.metaMensal ? num(eu.metaMensal) : null
      return {
        papel: 'VENDEDORA',
        equipe: eu.equipe?.nome ?? null,
        hoje: { total: num(hoje._sum.total), vendas: hoje._count },
        mes: { total: totalMes, vendas: mes._count, ticketMedio: mes._count > 0 ? totalMes / mes._count : 0 },
        online: { total: onlineMes, vendas: online._count, pct: totalMes > 0 ? Math.round((onlineMes / totalMes) * 100) : 0 },
        meta,
        pctMeta: meta && meta > 0 ? Math.round((totalMes / meta) * 100) : null,
        clientesCarteira: carteira,
        porForma: formaRaw
          .map((f) => ({ forma: f.formaRecebimento, total: num(f._sum.total), qtd: f._count }))
          .sort((a, b) => b.total - a.total),
      }
    }

    // ── GESTOR (sem lojaId): consolidado da rede ──
    const q = request.query as { lojaId?: string }
    if ((role === 'GESTOR' || role === 'ESTOQUISTA' || role === 'SUPER_ADMIN') && !q.lojaId) {
      const redeId = redeIdDe(request)
      const [rede, lojas] = await Promise.all([
        prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { nome: true, plano: true } }),
        prisma.loja.findMany({ where: { redeId }, orderBy: { createdAt: 'asc' }, select: { id: true, nome: true, ativo: true } }),
      ])
      const porLoja = await Promise.all(
        lojas.map(async (l) => ({ id: l.id, nome: l.nome, ativo: l.ativo, ...(await kpisDaLoja(l.id)) })),
      )
      return {
        papel: 'GESTOR',
        rede,
        consolidado: {
          faturamentoHoje: porLoja.reduce((s, l) => s + l.faturamentoHoje, 0),
          faturamentoMes: porLoja.reduce((s, l) => s + l.faturamentoMes, 0),
          faturamentoOnlineMes: porLoja.reduce((s, l) => s + l.faturamentoOnlineMes, 0),
          vendasMes: porLoja.reduce((s, l) => s + l.vendasMes, 0),
          vendasOnlineMes: porLoja.reduce((s, l) => s + l.vendasOnlineMes, 0),
          clientes: porLoja.reduce((s, l) => s + l.clientes, 0),
        },
        porLoja,
      }
    }

    // ── GERENTE (ou gestor/admin com ?lojaId): loja completa ──
    const lojaId = await lojaIdDe(request)
    const loja = await prisma.loja.findUniqueOrThrow({ where: { id: lojaId }, select: { nome: true } })
    return { papel: 'LOJA', loja: loja.nome, ...(await dashboardDaLoja(lojaId)) }
  })
}

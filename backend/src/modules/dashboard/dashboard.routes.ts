import type { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDe, redeIdDeQualquer } from '../../plugins/auth'

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
  const loja = await prisma.loja.findUniqueOrThrow({ where: { id: lojaId }, select: { redeId: true } })
  const redeId = loja.redeId
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
      where: { produto: { redeId, ativo: true, colecao: { lojas: { some: { lojaId } } } }, estoque: { lte: prisma.variacaoProduto.fields.estoqueMinimo } },
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

  // Produtos parados: ativos, com estoque, sem nenhuma venda no mês (encalhados).
  const vendidosIds = new Set(porProdutoMap.keys())
  const produtosAtivos = await prisma.produto.findMany({
    where: { redeId, ativo: true, colecao: { lojas: { some: { lojaId } } } },
    select: { id: true, nome: true, variacoes: { select: { estoque: true } } },
  })
  const produtosParados = produtosAtivos
    .filter((p) => !vendidosIds.has(p.id))
    .map((p) => ({ nome: p.nome, estoque: p.variacoes.reduce((s, v) => s + v.estoque, 0) }))
    .filter((p) => p.estoque > 0)
    .sort((a, b) => b.estoque - a.estoque)
    .slice(0, 8)

  // Conversão de atendimento: leads do mês que viraram venda.
  const [leadsTotal, leadsConv] = await Promise.all([
    prisma.lead.count({ where: { lojaId, createdAt: { gte: inicioDoMes() } } }),
    prisma.lead.count({ where: { lojaId, vendaId: { not: null }, createdAt: { gte: inicioDoMes() } } }),
  ])
  const conversao = leadsTotal > 0 ? { total: leadsTotal, convertidos: leadsConv, pct: Math.round((leadsConv / leadsTotal) * 100) } : null

  return {
    ...kpis,
    porVendedora,
    porFormaRecebimento,
    conversao,
    produtosParados,
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

  // ── Dashboard do ESTOQUE CENTRAL (gestor de estoque) — KPIs + giro + ruptura, por período ──
  app.get('/estoque', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE')] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const q = request.query as { de?: string; ate?: string }
    const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { nome: true } })
    const escopoNome = rede.nome

    // Período (para giro/movimentos): default últimos 6 meses.
    const ate = q.ate ? new Date(`${q.ate}T23:59:59.999`) : new Date()
    const de = q.de ? new Date(q.de) : new Date(ate.getFullYear(), ate.getMonth() - 5, 1)

    // Buckets de mês entre de..ate.
    const meses: { chave: string; rotulo: string }[] = []
    const cur = new Date(de.getFullYear(), de.getMonth(), 1)
    while (cur <= ate && meses.length < 24) {
      meses.push({ chave: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`, rotulo: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) })
      cur.setMonth(cur.getMonth() + 1)
    }
    const mesDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    // Estoque central atual (variações de produtos ativos da marca).
    const variacoes = await prisma.variacaoProduto.findMany({
      where: { produto: { redeId, ativo: true } },
      select: { estoque: true, estoqueMinimo: true, produto: { select: { custo: true, precoVarejo: true, categoria: { select: { nome: true } } } } },
    })
    const totalUn = variacoes.reduce((s, v) => s + v.estoque, 0)
    const valorEstoque = variacoes.reduce((s, v) => s + v.estoque * Number(v.produto.custo ?? v.produto.precoVarejo), 0)
    const skus = variacoes.length
    const oos = variacoes.filter((v) => v.estoque === 0).length
    const abaixoMin = variacoes.filter((v) => v.estoque > 0 && v.estoque < v.estoqueMinimo).length
    const oosPct = skus ? Math.round((oos / skus) * 1000) / 10 : 0
    const disponibilidadePct = skus ? Math.round(((skus - oos) / skus) * 1000) / 10 : 100

    // Ruptura por categoria.
    const porCat = new Map<string, { total: number; oos: number }>()
    for (const v of variacoes) {
      const cat = v.produto.categoria?.nome ?? 'Sem categoria'
      const a = porCat.get(cat) ?? { total: 0, oos: 0 }
      a.total += 1; if (v.estoque === 0) a.oos += 1
      porCat.set(cat, a)
    }
    const rupturaPorCategoria = [...porCat.entries()]
      .map(([categoria, a]) => ({ categoria, pct: a.total ? Math.round((a.oos / a.total) * 1000) / 10 : 0, total: a.total }))
      .sort((x, y) => y.pct - x.pct).slice(0, 8)

    // Vendas (peças) no período → giro mensal + giro do período.
    const itens = await prisma.itemVenda.findMany({
      where: { venda: { loja: { redeId }, status: 'CONCLUIDA', createdAt: { gte: de, lte: ate } } },
      select: { quantidade: true, venda: { select: { createdAt: true } } },
    })
    const pecasVendidas = itens.reduce((s, i) => s + i.quantidade, 0)
    const giro = totalUn > 0 ? Math.round((pecasVendidas / totalUn) * 100) / 100 : 0
    const vendasMes = new Map(meses.map((m) => [m.chave, 0]))
    for (const i of itens) { const k = mesDe(i.venda.createdAt); if (vendasMes.has(k)) vendasMes.set(k, vendasMes.get(k)! + i.quantidade) }

    // Movimentos: entradas × saídas por mês.
    const movs = await prisma.movimentoEstoque.findMany({
      where: { variacao: { produto: { redeId } }, createdAt: { gte: de, lte: ate } },
      select: { quantidade: true, createdAt: true },
    })
    const entradasMes = new Map(meses.map((m) => [m.chave, 0]))
    const saidasMes = new Map(meses.map((m) => [m.chave, 0]))
    for (const m of movs) {
      const k = mesDe(m.createdAt); if (!entradasMes.has(k)) continue
      if (m.quantidade >= 0) entradasMes.set(k, entradasMes.get(k)! + m.quantidade)
      else saidasMes.set(k, saidasMes.get(k)! + Math.abs(m.quantidade))
    }

    const serieMensal = meses.map((m) => ({ mes: m.rotulo, vendas: vendasMes.get(m.chave) ?? 0, entradas: entradasMes.get(m.chave) ?? 0, saidas: saidasMes.get(m.chave) ?? 0 }))

    // Estoque crítico (lista) — variações no/abaixo do mínimo.
    const criticoRaw = await prisma.variacaoProduto.findMany({
      where: { produto: { redeId, ativo: true }, estoque: { lte: prisma.variacaoProduto.fields.estoqueMinimo } },
      orderBy: { estoque: 'asc' }, take: 15,
      select: { estoque: true, estoqueMinimo: true, cor: true, tamanho: true, produto: { select: { nome: true } } },
    })
    const estoqueCritico = criticoRaw.map((v) => ({ produto: v.produto.nome, cor: v.cor, tamanho: v.tamanho, estoque: v.estoque, estoqueMinimo: v.estoqueMinimo }))

    return {
      escopo: escopoNome,
      kpis: { totalUn, valorEstoque, skus, oos, oosPct, abaixoMin, disponibilidadePct, giro, pecasVendidas },
      serieMensal, rupturaPorCategoria, estoqueCritico,
    }
  })
}

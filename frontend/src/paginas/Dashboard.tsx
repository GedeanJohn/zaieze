import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, rotuloForma, usuarioLogado } from '../api'
import DashboardEstoque from './DashboardEstoque'
import { useIdioma } from '../lib/i18n'

// ─── Tipos das três visões devolvidas por /api/dashboard ───
interface FormaResumo { forma: string; total: number; qtd: number }
interface FunilCores { noPrazo: number; apertado: number; atrasado: number; total: number }

interface VisaoVendedora {
  papel: 'VENDEDORA'
  equipe: string | null
  funilCores?: FunilCores
  hoje: { total: number; vendas: number }
  mes: { total: number; vendas: number; ticketMedio: number }
  online: { total: number; vendas: number; pct: number }
  meta: number | null
  pctMeta: number | null
  clientesCarteira: number
  porForma: FormaResumo[]
}

interface KpisLoja {
  faturamentoHoje: number; vendasHoje: number
  faturamentoMes: number; vendasMes: number; ticketMedioMes: number
  faturamentoOnlineMes: number; vendasOnlineMes: number; pctOnlineMes: number
  clientes: number; clientesInativos: number
}

interface VisaoGestor {
  papel: 'GESTOR'
  rede: { nome: string; plano: string }
  funilCores?: FunilCores
  consolidado: { faturamentoHoje: number; faturamentoMes: number; faturamentoOnlineMes: number; vendasMes: number; vendasOnlineMes: number; clientes: number }
  porLoja: (KpisLoja & { id: string; nome: string; ativo: boolean })[]
}

interface VendedoraLinha {
  id: string; nome: string; ativo: boolean; equipe: string | null
  clientesCarteira: number; totalMes: number; vendasMes: number; ticketMedio: number
  onlineMes: number; vendasOnlineMes: number; pctOnline: number
  meta: number | null; pctMeta: number | null
}

interface FormaLoja extends FormaResumo {
  vendedoras: { nome: string; total: number }[]
}

interface VisaoLoja extends KpisLoja {
  papel: 'LOJA'
  loja: string
  funilCores?: FunilCores
  porVendedora: VendedoraLinha[]
  porFormaRecebimento: FormaLoja[]
  porEquipe: { nome: string; total: number; qtd: number; vendedoras: number }[]
  topProdutos: { nome: string; qtd: number; total: number }[]
  produtosParados: { nome: string; estoque: number }[]
  conversao: { total: number; convertidos: number; pct: number } | null
  topClientes: { id: string; nome: string; totalGasto: number; segmento: string }[]
  estoqueCritico: { produto: string; cor: string; tamanho: string; sku: string; estoque: number; estoqueMinimo: number }[]
}

type Dados = VisaoVendedora | VisaoGestor | VisaoLoja

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="cartao kpi">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
    </div>
  )
}

// Card "Funil agora": ciclos abertos por cor de tempo de espera (verde/laranja/vermelho).
function FunilCard({ f }: { f: FunilCores }) {
  const { t } = useIdioma()
  const itens = [
    { rotulo: t('dash.noPrazo'), valor: f.noPrazo, cor: '#16a34a', icone: '🟢' },
    { rotulo: t('dash.apertado'), valor: f.apertado, cor: '#d97706', icone: '🟠' },
    { rotulo: t('dash.atrasado'), valor: f.atrasado, cor: '#dc2626', icone: '🔴' },
  ]
  return (
    <div className="cartao">
      <h2 className="painel-titulo">{t('dash.funilAgora')} ({f.total} {f.total === 1 ? t('dash.aberto') : t('dash.abertos')})</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {itens.map((i) => (
          <div key={i.rotulo} style={{ flex: 1, minWidth: 110, border: `1px solid ${i.cor}55`, background: `${i.cor}14`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{i.icone} {i.rotulo}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: i.cor }}>{i.valor}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarraMeta({ pct }: { pct: number }) {
  return (
    <div className="barra-meta" title={`${pct}% da meta`}>
      <span style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

export default function Dashboard() {
  // O estoquista tem um dashboard próprio, focado em indicadores de estoque.
  if (usuarioLogado()?.role === 'ESTOQUISTA') return <DashboardEstoque />
  return <DashboardGeral />
}

function DashboardGeral() {
  const { t } = useIdioma()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  // Drill-down do gestor: '' = rede consolidada; id = loja específica
  const [lojaSel, setLojaSel] = useState('')
  const [lojas, setLojas] = useState<{ id: string; nome: string }[]>([])

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const { data } = await api.get<Dados>('/dashboard', { params: lojaSel ? { lojaId: lojaSel } : {} })
      setDados(data)
      if (data.papel === 'GESTOR') setLojas(data.porLoja.map((l) => ({ id: l.id, nome: l.nome })))
    } catch {
      setErro('Não foi possível carregar o dashboard.')
    }
  }, [lojaSel])

  useEffect(() => { carregar() }, [carregar])

  if (erro) return <div className="alerta">{erro}</div>
  if (!dados) return <p style={{ color: 'var(--ink-soft)' }}>Carregando…</p>

  // Seletor de loja (apenas gestor): consolidado ↔ loja
  const seletor = lojas.length > 0 && (
    <select value={lojaSel} onChange={(e) => setLojaSel(e.target.value)} style={{ width: 'auto' }}>
      <option value="">{t('dash.redeConsolidado')}</option>
      {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
    </select>
  )

  // ─── VENDEDORA ───
  if (dados.papel === 'VENDEDORA') {
    return (
      <>
        <header><h1>{t('dash.vendedora.titulo')}</h1><span style={{ color: 'var(--ink-soft)', fontSize: 14 }}>{dados.equipe ?? t('dash.semEquipe')}</span></header>
        <div className="grade-cards">
          <Kpi rotulo={t('dash.vendiHoje')} valor={formataReal(dados.hoje.total)} />
          <Kpi rotulo={t('dash.vendasHoje')} valor={String(dados.hoje.vendas)} />
          <Kpi rotulo={t('dash.vendiMes')} valor={formataReal(dados.mes.total)} />
          <Kpi rotulo={`${t('dash.vendaOnline')} (${dados.online.pct}%)`} valor={formataReal(dados.online.total)} />
          <Kpi rotulo={t('dash.ticketMedio')} valor={formataReal(dados.mes.ticketMedio)} />
          <Kpi rotulo={t('dash.clientesCarteira')} valor={String(dados.clientesCarteira)} />
        </div>
        {dados.funilCores && <div style={{ marginTop: 16 }}><FunilCard f={dados.funilCores} /></div>}
        {dados.meta != null && (
          <div className="cartao" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>{t('dash.metaDoMes')}: {formataReal(dados.meta)}</span>
              <strong>{dados.pctMeta ?? 0}%</strong>
            </div>
            <BarraMeta pct={dados.pctMeta ?? 0} />
          </div>
        )}
        <div className="cartao" style={{ marginTop: 16 }}>
          <h2 className="painel-titulo">{t('dash.minhasVendasPorForma')}</h2>
          <table>
            <thead><tr><th>{t('dash.forma')}</th><th>{t('dash.vendas')}</th><th>{t('dash.total')}</th></tr></thead>
            <tbody>
              {dados.porForma.map((f) => (
                <tr key={f.forma}><td>{t(`forma.${f.forma}`) || rotuloForma[f.forma] || f.forma}</td><td>{f.qtd}</td><td>{formataReal(f.total)}</td></tr>
              ))}
              {dados.porForma.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>{t('dash.semVendasMes')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  // ─── GESTOR (consolidado da rede) ───
  if (dados.papel === 'GESTOR') {
    return (
      <>
        <header>
          <h1>{dados.rede.nome}</h1>
        </header>
        {seletor && <div style={{ marginBottom: 16 }}>{seletor}</div>}
        <div className="grade-cards">
          <Kpi rotulo={t('dash.faturamentoHoje')} valor={formataReal(dados.consolidado.faturamentoHoje)} />
          <Kpi rotulo={t('dash.faturamentoMes')} valor={formataReal(dados.consolidado.faturamentoMes)} />
          <Kpi
            rotulo={`${t('dash.vendaOnline')} (${dados.consolidado.faturamentoMes > 0 ? Math.round((dados.consolidado.faturamentoOnlineMes / dados.consolidado.faturamentoMes) * 100) : 0}%)`}
            valor={formataReal(dados.consolidado.faturamentoOnlineMes)}
          />
          <Kpi rotulo={t('dash.vendasMes')} valor={String(dados.consolidado.vendasMes)} />
          <Kpi rotulo={t('dash.clientes')} valor={String(dados.consolidado.clientes)} />
        </div>
        {dados.funilCores && <div style={{ marginTop: 16 }}><FunilCard f={dados.funilCores} /></div>}
        <div className="cartao" style={{ marginTop: 16 }}>
          <h2 className="painel-titulo">{t('dash.lojas')}</h2>
          <table>
            <thead><tr><th>{t('dash.loja')}</th><th>{t('dash.hoje')}</th><th>{t('dash.mesCol')}</th><th>{t('dash.vendaOnline')}</th><th>{t('dash.vendasMes')}</th><th>{t('dash.ticketMedio')}</th><th>{t('dash.clientes')}</th></tr></thead>
            <tbody>
              {dados.porLoja.map((l) => (
                <tr key={l.id} style={{ opacity: l.ativo ? 1 : 0.5 }}>
                  <td>{l.nome}{l.ativo ? '' : ` ${t('dash.inativa')}`}</td>
                  <td>{formataReal(l.faturamentoHoje)}</td>
                  <td>{formataReal(l.faturamentoMes)}</td>
                  <td>{formataReal(l.faturamentoOnlineMes)} <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>({l.pctOnlineMes}%)</span></td>
                  <td>{l.vendasMes}</td>
                  <td>{formataReal(l.ticketMedioMes)}</td>
                  <td>{l.clientes}{l.clientesInativos > 0 ? ` (${l.clientesInativos} ${t('dash.inativosParen')})` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }

  // ─── LOJA (gerente, ou gestor com loja selecionada) ───
  return (
    <>
      <header>
        <h1>{dados.loja}</h1>
        {seletor}
      </header>
      <div className="grade-cards">
        <Kpi rotulo={t('dash.faturamentoHoje')} valor={formataReal(dados.faturamentoHoje)} />
        <Kpi rotulo={t('dash.vendasHoje')} valor={String(dados.vendasHoje)} />
        <Kpi rotulo={t('dash.faturamentoMes')} valor={formataReal(dados.faturamentoMes)} />
        <Kpi rotulo={`${t('dash.vendaOnline')} (${dados.pctOnlineMes}%)`} valor={formataReal(dados.faturamentoOnlineMes)} />
        <Kpi rotulo={t('dash.ticketMedio')} valor={formataReal(dados.ticketMedioMes)} />
        <Kpi rotulo={t('dash.clientes')} valor={String(dados.clientes)} />
        <Kpi rotulo={t('dash.inativosDias')} valor={String(dados.clientesInativos)} />
        {dados.conversao && <Kpi rotulo={`${t('dash.conversao')} (${dados.conversao.convertidos}/${dados.conversao.total})`} valor={`${dados.conversao.pct}%`} />}
      </div>

      {dados.funilCores && <div style={{ marginTop: 16 }}><FunilCard f={dados.funilCores} /></div>}

      <div className="grade-paineis" style={{ marginTop: 16 }}>
        <div className="cartao">
          <h2 className="painel-titulo">{t('dash.vendedorasNoMes')}</h2>
          <table>
            <thead><tr><th>{t('dash.vendedora')}</th><th>{t('dash.vendas')}</th><th>{t('dash.total')}</th><th>{t('dash.online')}</th><th>{t('dash.meta')}</th></tr></thead>
            <tbody>
              {dados.porVendedora.map((v) => (
                <tr key={v.id} style={{ opacity: v.ativo ? 1 : 0.5 }}>
                  <td>{v.nome}<div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{v.equipe ?? t('dash.semEquipe')}</div></td>
                  <td>{v.vendasMes}</td>
                  <td>{formataReal(v.totalMes)}</td>
                  <td>{formataReal(v.onlineMes)} <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>({v.pctOnline}%)</span></td>
                  <td style={{ minWidth: 110 }}>
                    {v.meta != null
                      ? <>{v.pctMeta ?? 0}%<BarraMeta pct={v.pctMeta ?? 0} /></>
                      : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                  </td>
                </tr>
              ))}
              {dados.porVendedora.length === 0 && (
                <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>{t('dash.semVendedoras')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2 className="painel-titulo">{t('dash.vendasPorForma')}</h2>
          <table>
            <thead><tr><th>{t('dash.forma')}</th><th>{t('dash.vendas')}</th><th>{t('dash.total')}</th><th>{t('dash.quemMaisVendeu')}</th></tr></thead>
            <tbody>
              {dados.porFormaRecebimento.map((f) => (
                <tr key={f.forma}>
                  <td>{t(`forma.${f.forma}`) || rotuloForma[f.forma] || f.forma}</td>
                  <td>{f.qtd}</td>
                  <td>{formataReal(f.total)}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    {f.vendedoras[0] ? `${f.vendedoras[0].nome} (${formataReal(f.vendedoras[0].total)})` : '—'}
                  </td>
                </tr>
              ))}
              {dados.porFormaRecebimento.length === 0 && (
                <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>{t('dash.semVendasMes')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2 className="painel-titulo">{t('dash.produtosMaisVendidos')}</h2>
          <table>
            <thead><tr><th>{t('dash.produto')}</th><th>{t('dash.qtd')}</th><th>{t('dash.total')}</th></tr></thead>
            <tbody>
              {dados.topProdutos.map((p) => (
                <tr key={p.nome}><td>{p.nome}</td><td>{p.qtd}</td><td>{formataReal(p.total)}</td></tr>
              ))}
              {dados.topProdutos.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>{t('dash.semVendasMes')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2 className="painel-titulo">{t('dash.melhoresClientes')}</h2>
          <table>
            <thead><tr><th>{t('dash.cliente')}</th><th>{t('dash.classificacao')}</th><th>{t('dash.totalGasto')}</th></tr></thead>
            <tbody>
              {dados.topClientes.map((c) => (
                <tr key={c.id}><td>{c.nome}</td><td><span className={`selo ${c.segmento}`}>{c.segmento}</span></td><td>{formataReal(c.totalGasto)}</td></tr>
              ))}
              {dados.topClientes.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>{t('dash.semClientesCompras')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2 className="painel-titulo">{t('dash.produtosParados')}</h2>
          <table>
            <thead><tr><th>{t('dash.produto')}</th><th>{t('dash.emEstoque')}</th></tr></thead>
            <tbody>
              {dados.produtosParados.map((p) => (
                <tr key={p.nome}><td>{p.nome}</td><td><span className="selo baixo">{p.estoque} {t('dash.un')}</span></td></tr>
              ))}
              {dados.produtosParados.length === 0 && (
                <tr><td colSpan={2} style={{ color: 'var(--ok)' }}>{t('dash.tudoGirando')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2 className="painel-titulo">{t('dash.estoqueCritico')}</h2>
          <table>
            <thead><tr><th>{t('dash.produto')}</th><th>{t('dash.grade')}</th><th>{t('dash.estoque')}</th></tr></thead>
            <tbody>
              {dados.estoqueCritico.map((e) => (
                <tr key={e.sku}>
                  <td>{e.produto}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{e.cor}/{e.tamanho}</td>
                  <td><span className="selo baixo">{e.estoque} {t('dash.un')} ({t('dash.min')} {e.estoqueMinimo})</span></td>
                </tr>
              ))}
              {dados.estoqueCritico.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--ok)' }}>{t('dash.tudoAcimaMinimo')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

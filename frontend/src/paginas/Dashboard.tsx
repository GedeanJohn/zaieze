import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, rotuloForma } from '../api'

// ─── Tipos das três visões devolvidas por /api/dashboard ───
interface FormaResumo { forma: string; total: number; qtd: number }

interface VisaoVendedora {
  papel: 'VENDEDORA'
  equipe: string | null
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
  porVendedora: VendedoraLinha[]
  porFormaRecebimento: FormaLoja[]
  porEquipe: { nome: string; total: number; qtd: number; vendedoras: number }[]
  topProdutos: { nome: string; qtd: number; total: number }[]
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

function BarraMeta({ pct }: { pct: number }) {
  return (
    <div className="barra-meta" title={`${pct}% da meta`}>
      <span style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

export default function Dashboard() {
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
      <option value="">Rede (consolidado)</option>
      {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
    </select>
  )

  // ─── VENDEDORA ───
  if (dados.papel === 'VENDEDORA') {
    return (
      <>
        <header><h1>Meu desempenho</h1><span style={{ color: 'var(--ink-soft)', fontSize: 14 }}>{dados.equipe ?? 'Sem equipe'}</span></header>
        <div className="grade-cards">
          <Kpi rotulo="Vendi hoje" valor={formataReal(dados.hoje.total)} />
          <Kpi rotulo="Vendas hoje" valor={String(dados.hoje.vendas)} />
          <Kpi rotulo="Vendi no mês" valor={formataReal(dados.mes.total)} />
          <Kpi rotulo={`Venda online (${dados.online.pct}%)`} valor={formataReal(dados.online.total)} />
          <Kpi rotulo="Ticket médio" valor={formataReal(dados.mes.ticketMedio)} />
          <Kpi rotulo="Clientes na carteira" valor={String(dados.clientesCarteira)} />
        </div>
        {dados.meta != null && (
          <div className="cartao" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span>Meta do mês: {formataReal(dados.meta)}</span>
              <strong>{dados.pctMeta ?? 0}%</strong>
            </div>
            <BarraMeta pct={dados.pctMeta ?? 0} />
          </div>
        )}
        <div className="cartao" style={{ marginTop: 16 }}>
          <h2 className="painel-titulo">Minhas vendas por forma de recebimento</h2>
          <table>
            <thead><tr><th>Forma</th><th>Vendas</th><th>Total</th></tr></thead>
            <tbody>
              {dados.porForma.map((f) => (
                <tr key={f.forma}><td>{rotuloForma[f.forma] ?? f.forma}</td><td>{f.qtd}</td><td>{formataReal(f.total)}</td></tr>
              ))}
              {dados.porForma.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>Sem vendas no mês.</td></tr>
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
          <span style={{ color: 'var(--ink-soft)', fontSize: 14 }}>Rede · plano {dados.rede.plano}</span>
        </header>
        {seletor && <div style={{ marginBottom: 16 }}>{seletor}</div>}
        <div className="grade-cards">
          <Kpi rotulo="Faturamento hoje" valor={formataReal(dados.consolidado.faturamentoHoje)} />
          <Kpi rotulo="Faturamento no mês" valor={formataReal(dados.consolidado.faturamentoMes)} />
          <Kpi
            rotulo={`Venda online (${dados.consolidado.faturamentoMes > 0 ? Math.round((dados.consolidado.faturamentoOnlineMes / dados.consolidado.faturamentoMes) * 100) : 0}%)`}
            valor={formataReal(dados.consolidado.faturamentoOnlineMes)}
          />
          <Kpi rotulo="Vendas no mês" valor={String(dados.consolidado.vendasMes)} />
          <Kpi rotulo="Clientes" valor={String(dados.consolidado.clientes)} />
        </div>
        <div className="cartao" style={{ marginTop: 16 }}>
          <h2 className="painel-titulo">Lojas</h2>
          <table>
            <thead><tr><th>Loja</th><th>Hoje</th><th>Mês</th><th>Venda online</th><th>Vendas mês</th><th>Ticket médio</th><th>Clientes</th></tr></thead>
            <tbody>
              {dados.porLoja.map((l) => (
                <tr key={l.id} style={{ opacity: l.ativo ? 1 : 0.5 }}>
                  <td>{l.nome}{l.ativo ? '' : ' (inativa)'}</td>
                  <td>{formataReal(l.faturamentoHoje)}</td>
                  <td>{formataReal(l.faturamentoMes)}</td>
                  <td>{formataReal(l.faturamentoOnlineMes)} <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>({l.pctOnlineMes}%)</span></td>
                  <td>{l.vendasMes}</td>
                  <td>{formataReal(l.ticketMedioMes)}</td>
                  <td>{l.clientes}{l.clientesInativos > 0 ? ` (${l.clientesInativos} inativos)` : ''}</td>
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
        <Kpi rotulo="Faturamento hoje" valor={formataReal(dados.faturamentoHoje)} />
        <Kpi rotulo="Vendas hoje" valor={String(dados.vendasHoje)} />
        <Kpi rotulo="Faturamento no mês" valor={formataReal(dados.faturamentoMes)} />
        <Kpi rotulo={`Venda online (${dados.pctOnlineMes}%)`} valor={formataReal(dados.faturamentoOnlineMes)} />
        <Kpi rotulo="Ticket médio" valor={formataReal(dados.ticketMedioMes)} />
        <Kpi rotulo="Clientes" valor={String(dados.clientes)} />
        <Kpi rotulo="Inativos (90+ dias)" valor={String(dados.clientesInativos)} />
      </div>

      <div className="grade-paineis" style={{ marginTop: 16 }}>
        <div className="cartao">
          <h2 className="painel-titulo">Vendedoras no mês</h2>
          <table>
            <thead><tr><th>Vendedora</th><th>Vendas</th><th>Total</th><th>Online</th><th>Meta</th></tr></thead>
            <tbody>
              {dados.porVendedora.map((v) => (
                <tr key={v.id} style={{ opacity: v.ativo ? 1 : 0.5 }}>
                  <td>{v.nome}<div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{v.equipe ?? 'Sem equipe'}</div></td>
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
                <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>Sem vendedoras.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2 className="painel-titulo">Vendas por forma de recebimento</h2>
          <table>
            <thead><tr><th>Forma</th><th>Vendas</th><th>Total</th><th>Quem mais vendeu</th></tr></thead>
            <tbody>
              {dados.porFormaRecebimento.map((f) => (
                <tr key={f.forma}>
                  <td>{rotuloForma[f.forma] ?? f.forma}</td>
                  <td>{f.qtd}</td>
                  <td>{formataReal(f.total)}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    {f.vendedoras[0] ? `${f.vendedoras[0].nome} (${formataReal(f.vendedoras[0].total)})` : '—'}
                  </td>
                </tr>
              ))}
              {dados.porFormaRecebimento.length === 0 && (
                <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>Sem vendas no mês.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2 className="painel-titulo">Produtos mais vendidos</h2>
          <table>
            <thead><tr><th>Produto</th><th>Qtd</th><th>Total</th></tr></thead>
            <tbody>
              {dados.topProdutos.map((p) => (
                <tr key={p.nome}><td>{p.nome}</td><td>{p.qtd}</td><td>{formataReal(p.total)}</td></tr>
              ))}
              {dados.topProdutos.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>Sem vendas no mês.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2 className="painel-titulo">Melhores clientes</h2>
          <table>
            <thead><tr><th>Cliente</th><th>Segmento</th><th>Total gasto</th></tr></thead>
            <tbody>
              {dados.topClientes.map((c) => (
                <tr key={c.id}><td>{c.nome}</td><td><span className={`selo ${c.segmento}`}>{c.segmento}</span></td><td>{formataReal(c.totalGasto)}</td></tr>
              ))}
              {dados.topClientes.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>Sem clientes com compras.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cartao">
          <h2 className="painel-titulo">Estoque crítico</h2>
          <table>
            <thead><tr><th>Produto</th><th>Grade</th><th>Estoque</th></tr></thead>
            <tbody>
              {dados.estoqueCritico.map((e) => (
                <tr key={e.sku}>
                  <td>{e.produto}</td>
                  <td style={{ color: 'var(--ink-soft)' }}>{e.cor}/{e.tamanho}</td>
                  <td><span className="selo baixo">{e.estoque} un (mín {e.estoqueMinimo})</span></td>
                </tr>
              ))}
              {dados.estoqueCritico.length === 0 && (
                <tr><td colSpan={3} style={{ color: 'var(--ok)' }}>Tudo acima do mínimo. 👍</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

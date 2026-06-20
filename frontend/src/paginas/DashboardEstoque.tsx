import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, RadialBarChart, RadialBar,
} from 'recharts'
import { api, formataReal } from '../api'

interface Estoque {
  escopo: string
  vazio?: boolean
  kpis: { totalUn: number; valorEstoque: number; skus: number; oos: number; oosPct: number; abaixoMin: number; disponibilidadePct: number; giro: number; pecasVendidas: number }
  serieMensal: { mes: string; vendas: number; entradas: number; saidas: number }[]
  rupturaPorCategoria: { categoria: string; pct: number; total: number }[]
  estoqueCritico: { produto: string; cor: string; tamanho: string; estoque: number; estoqueMinimo: number }[]
}

const hoje = () => new Date().toISOString().slice(0, 10)
function mesesAtras(n: number) { const d = new Date(); d.setMonth(d.getMonth() - n); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function DashboardEstoque() {
  const [lojas, setLojas] = useState<{ id: string; nome: string }[]>([])
  const [lojaId, setLojaId] = useState('')
  const [de, setDe] = useState(mesesAtras(5))
  const [ate, setAte] = useState(hoje())
  const [d, setD] = useState<Estoque | null>(null)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    api.get('/lojas').then(({ data }) => setLojas(data.map((l: { id: string; nome: string }) => ({ id: l.id, nome: l.nome })))).catch(() => {})
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const params: Record<string, string> = { de, ate }
      if (lojaId) params.lojaId = lojaId
      const { data } = await api.get('/dashboard/estoque', { params })
      setD(data)
    } catch { setD(null) } finally { setCarregando(false) }
  }, [lojaId, de, ate])
  useEffect(() => { carregar() }, [carregar])

  const dispCor = (p: number) => (p >= 90 ? '#2e7d32' : p >= 75 ? '#b26a00' : '#c62828')

  return (
    <>
      <header><h1>Estoque · Indicadores</h1></header>

      <div className="cartao">
        <div className="linha-campos">
          <div className="campo">
            <label>Loja</label>
            <select value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
              <option value="">Todas as lojas</option>
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="campo"><label>De</label><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div className="campo"><label>Até</label><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>O período afeta giro, vendas e movimentos. Estoque, ruptura e disponibilidade refletem o momento atual.</div>
      </div>

      {!d || d.vazio ? (
        <div className="cartao" style={{ color: 'var(--ink-soft)' }}>{carregando ? 'Carregando…' : 'Sem dados de estoque para o filtro.'}</div>
      ) : (
        <>
          <div className="grade-cards">
            <Kpi rotulo="Em estoque" valor={`${d.kpis.totalUn} un`} />
            <Kpi rotulo="Valor de estoque" valor={formataReal(d.kpis.valorEstoque)} />
            <Kpi rotulo="Ruptura (OOS)" valor={`${d.kpis.oosPct}%`} alerta={d.kpis.oosPct > 0} />
            <Kpi rotulo="Abaixo do mínimo" valor={`${d.kpis.abaixoMin}`} alerta={d.kpis.abaixoMin > 0} />
            <Kpi rotulo="Giro (período)" valor={`${d.kpis.giro}`} />
          </div>

          <div className="grade-paineis">
            <div className="cartao">
              <h2 className="painel-titulo">Disponibilidade</h2>
              <ResponsiveContainer width="100%" height={190}>
                <RadialBarChart innerRadius="72%" outerRadius="100%" startAngle={180} endAngle={0}
                  data={[{ name: 'disp', value: d.kpis.disponibilidadePct, fill: dispCor(d.kpis.disponibilidadePct) }]}>
                  <RadialBar background dataKey="value" />
                </RadialBarChart>
              </ResponsiveContainer>
              <div style={{ textAlign: 'center', marginTop: -36, fontSize: 30, fontWeight: 700 }}>{d.kpis.disponibilidadePct}%</div>
              <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, marginTop: 4 }}>{d.kpis.skus - d.kpis.oos} de {d.kpis.skus} SKUs com estoque</div>
            </div>

            <div className="cartao">
              <h2 className="painel-titulo">Saída de peças por mês (giro)</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={d.serieMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={12} /><Tooltip />
                  <Line type="monotone" dataKey="vendas" stroke="#c2552b" strokeWidth={2} name="Peças vendidas" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grade-paineis">
            <div className="cartao">
              <h2 className="painel-titulo">Entradas × Saídas por mês</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.serieMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
                  <Bar dataKey="entradas" fill="#2e7d32" name="Entradas" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="saidas" fill="#c2552b" name="Saídas" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="cartao">
              <h2 className="painel-titulo">Ruptura por categoria (%)</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.rupturaPorCategoria} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis type="number" fontSize={12} unit="%" /><YAxis type="category" dataKey="categoria" width={110} fontSize={11} /><Tooltip />
                  <Bar dataKey="pct" fill="#2563eb" name="Ruptura %" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="cartao">
            <h2 className="painel-titulo">Estoque crítico</h2>
            <table>
              <thead><tr><th>Produto</th><th>Cor / Tamanho</th><th>Estoque</th></tr></thead>
              <tbody>
                {d.estoqueCritico.map((e, i) => (
                  <tr key={i}><td>{e.produto}</td><td>{e.cor} / {e.tamanho}</td><td><span className="selo baixo">{e.estoque} un (mín {e.estoqueMinimo})</span></td></tr>
                ))}
                {d.estoqueCritico.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>Nenhum item crítico. 👍</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

function Kpi({ rotulo, valor, alerta }: { rotulo: string; valor: string | number; alerta?: boolean }) {
  return <div className="cartao kpi"><div className="rotulo">{rotulo}</div><div className="valor" style={{ color: alerta ? 'var(--danger)' : undefined }}>{valor}</div></div>
}

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  CartesianGrid, RadialBarChart, RadialBar,
} from 'recharts'
import { api, formataReal } from '../api'
import { useIdioma } from '../lib/i18n'

interface Estoque {
  escopo: string
  kpis: { totalUn: number; valorEstoque: number; skus: number; oos: number; oosPct: number; abaixoMin: number; disponibilidadePct: number; giro: number; pecasVendidas: number }
  serieMensal: { mes: string; vendas: number; entradas: number; saidas: number }[]
  rupturaPorCategoria: { categoria: string; pct: number; total: number }[]
  estoqueCritico: { produto: string; cor: string; tamanho: string; estoque: number; estoqueMinimo: number }[]
}

const hoje = () => new Date().toISOString().slice(0, 10)
function mesesAtras(n: number) { const d = new Date(); d.setMonth(d.getMonth() - n); d.setDate(1); return d.toISOString().slice(0, 10) }

export default function DashboardEstoque() {
  const { t } = useIdioma()
  const [de, setDe] = useState(mesesAtras(5))
  const [ate, setAte] = useState(hoje())
  const [d, setD] = useState<Estoque | null>(null)
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const { data } = await api.get('/dashboard/estoque', { params: { de, ate } })
      setD(data)
    } catch { setD(null) } finally { setCarregando(false) }
  }, [de, ate])
  useEffect(() => { carregar() }, [carregar])

  const dispCor = (p: number) => (p >= 90 ? '#2e7d32' : p >= 75 ? '#b26a00' : '#c62828')

  return (
    <>
      <header><h1>{t('dashEstq.titulo')}</h1></header>

      <div className="cartao">
        <div className="linha-campos">
          <div className="campo"><label>{t('dashEstq.de')}</label><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div className="campo"><label>{t('dashEstq.ate')}</label><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('dashEstq.periodoExplicacao')}</div>
      </div>

      {!d ? (
        <div className="cartao" style={{ color: 'var(--ink-soft)' }}>{carregando ? t('dashEstq.carregando') : t('dashEstq.semDados')}</div>
      ) : (
        <>
          <div className="grade-cards">
            <Kpi rotulo={t('dashEstq.emEstoque')} valor={`${d.kpis.totalUn} un`} />
            <Kpi rotulo={t('dashEstq.valorEstoque')} valor={formataReal(d.kpis.valorEstoque)} />
            <Kpi rotulo={t('dashEstq.rupturaOos')} valor={`${d.kpis.oosPct}%`} alerta={d.kpis.oosPct > 0} />
            <Kpi rotulo={t('dashEstq.abaixoMinimo')} valor={`${d.kpis.abaixoMin}`} alerta={d.kpis.abaixoMin > 0} />
            <Kpi rotulo={t('dashEstq.giroPeriodo')} valor={`${d.kpis.giro}`} />
          </div>

          <div className="grade-paineis">
            <div className="cartao">
              <h2 className="painel-titulo">{t('dashEstq.disponibilidade')}</h2>
              <ResponsiveContainer width="100%" height={190}>
                <RadialBarChart innerRadius="72%" outerRadius="100%" startAngle={180} endAngle={0}
                  data={[{ name: 'disp', value: d.kpis.disponibilidadePct, fill: dispCor(d.kpis.disponibilidadePct) }]}>
                  <RadialBar background dataKey="value" />
                </RadialBarChart>
              </ResponsiveContainer>
              <div style={{ textAlign: 'center', marginTop: -36, fontSize: 30, fontWeight: 700 }}>{d.kpis.disponibilidadePct}%</div>
              <div style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, marginTop: 4 }}>{t('dashEstq.skusComEstoque', { disp: d.kpis.skus - d.kpis.oos, total: d.kpis.skus })}</div>
            </div>

            <div className="cartao">
              <h2 className="painel-titulo">{t('dashEstq.saidaPorMes')}</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={d.serieMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={12} /><Tooltip />
                  <Line type="monotone" dataKey="vendas" stroke="#c2552b" strokeWidth={2} name={t('dashEstq.pecasVendidas')} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grade-paineis">
            <div className="cartao">
              <h2 className="painel-titulo">{t('dashEstq.entradasXSaidas')}</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.serieMensal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
                  <Bar dataKey="entradas" fill="#2e7d32" name={t('dashEstq.entradas')} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="saidas" fill="#c2552b" name={t('dashEstq.saidas')} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="cartao">
              <h2 className="painel-titulo">{t('dashEstq.rupturaPorCategoria')}</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.rupturaPorCategoria} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis type="number" fontSize={12} unit="%" /><YAxis type="category" dataKey="categoria" width={110} fontSize={11} /><Tooltip />
                  <Bar dataKey="pct" fill="#2563eb" name={t('dashEstq.rupturaPct')} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="cartao">
            <h2 className="painel-titulo">{t('dashEstq.estoqueCritico')}</h2>
            <table>
              <thead><tr><th>{t('dashEstq.colProduto')}</th><th>{t('dashEstq.colCorTamanho')}</th><th>{t('dashEstq.colEstoque')}</th></tr></thead>
              <tbody>
                {d.estoqueCritico.map((e, i) => (
                  <tr key={i}><td>{e.produto}</td><td>{e.cor} / {e.tamanho}</td><td><span className="selo baixo">{e.estoque} un ({t('dashEstq.minSufixo', { n: e.estoqueMinimo })})</span></td></tr>
                ))}
                {d.estoqueCritico.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>{t('dashEstq.nenhumItemCritico')}</td></tr>}
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

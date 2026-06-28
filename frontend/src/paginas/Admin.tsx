import { useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, type Plano } from '../api'

interface PlanoAdmin { plano: Plano; nome: string; limite: string; resumo: string; preco: number }
interface Reajuste { id: string; indice: string; percentual: string; detalhe: Record<string, { de: number; para: number }> | null; aplicadoPor: string | null; aplicadoEm: string }
interface RedeAdmin {
  id: string; nome: string; slug: string; plano: Plano; ativo: boolean; criadoEm: string; lojas: number; usuarios: number
  assinatura: { plano: Plano; status: string; valor: number; cicloFimEm: string | null; cancelamentoAgendado: boolean; simulada: boolean } | null
}
interface Promo { id: string; codigo: string; tipo: 'DIAS_GRATIS' | 'PERCENTUAL'; dias: number | null; percentual: string | null; descricao: string | null; validadeAte: string | null; maxUsos: number | null; usos: number; ativo: boolean }

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

export default function Admin() {
  const [planos, setPlanos] = useState<PlanoAdmin[]>([])
  const [precos, setPrecos] = useState<Record<string, string>>({})
  const [reajustes, setReajustes] = useState<Reajuste[]>([])
  const [redes, setRedes] = useState<RedeAdmin[]>([])
  const [promos, setPromos] = useState<Promo[]>([])
  const [pct, setPct] = useState('')
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  function carregar() {
    api.get('/admin/planos').then(({ data }) => {
      setPlanos(data.planos)
      setPrecos(Object.fromEntries(data.planos.map((p: PlanoAdmin) => [p.plano, String(p.preco)])))
    }).catch((e) => setErro(mensagemDeErro(e)))
    api.get('/admin/reajustes').then(({ data }) => setReajustes(data.reajustes)).catch(() => {})
    api.get('/admin/redes').then(({ data }) => setRedes(data.redes)).catch(() => {})
    api.get('/admin/promos').then(({ data }) => setPromos(data.promos)).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function salvarPrecos() {
    setOcupado(true); setMsg(''); setErro('')
    try {
      const corpo = Object.fromEntries(Object.entries(precos).map(([k, v]) => [k, Number(v)]))
      await api.put('/admin/planos', { precos: corpo })
      setMsg('Preços salvos. Valem para novas assinaturas e trocas de plano.')
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  async function aplicarReajuste() {
    const p = Number(pct)
    if (!p || p <= 0) { setErro('Informe o IGP-M acumulado (%).'); return }
    if (!window.confirm(`Reajustar TODOS os planos em ${p}% (IGP-M)? Vale só para novas assinaturas.`)) return
    setOcupado(true); setMsg(''); setErro('')
    try {
      await api.post('/admin/reajuste', { percentual: p })
      setMsg(`Reajuste de ${p}% aplicado.`)
      setPct('')
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  return (
    <>
      <header><h1>🛠️ Painel do Admin</h1><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Operação do SaaS</span></header>
      {erro && <div className="alerta">{erro}</div>}
      {msg && <div className="sucesso">{msg}</div>}

      {/* ── Preços & Reajuste ── */}
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>💳 Planos & Preços</h2>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
          O preço vale para <strong>novas assinaturas e trocas de plano</strong>. Assinantes ativos seguem no valor antigo.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {planos.map((p) => (
            <div key={p.plano} className="campo">
              <label>{p.nome} (R$/mês)</label>
              <input type="number" step="0.01" min="0" value={precos[p.plano] ?? ''} onChange={(e) => setPrecos({ ...precos, [p.plano]: e.target.value })} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}><button className="btn" onClick={salvarPrecos} disabled={ocupado}>Salvar preços</button></div>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 14 }}>
          <h3 style={{ margin: '0 0 8px' }}>📈 Reajuste por inflação (IGP-M)</h3>
          <div className="linha-campos" style={{ alignItems: 'end' }}>
            <div className="campo">
              <label>IGP-M acumulado (12 meses) %</label>
              <input type="number" step="0.001" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="ex.: 4.5" />
            </div>
            <div><button className="btn secundario" onClick={aplicarReajuste} disabled={ocupado}>Aplicar a todos os planos</button></div>
          </div>
          {pct && Number(pct) > 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>
              Prévia: {planos.map((p) => `${p.nome} ${formataReal(p.preco)} → ${formataReal(Math.round(p.preco * (1 + Number(pct) / 100) * 100) / 100)}`).join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* ── Códigos promocionais ── */}
      <PromoSection promos={promos} onChange={carregar} />

      {/* ── Redes (clientes) ── */}
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>🏢 Redes (clientes) · {redes.length}</h2>
        <table>
          <thead><tr><th>Marca</th><th>Endereço</th><th>Plano</th><th>Assinatura</th><th>Lojas</th><th>Usuários</th><th>Desde</th></tr></thead>
          <tbody>
            {redes.map((r) => (
              <tr key={r.id} style={{ opacity: r.ativo ? 1 : 0.5 }}>
                <td>{r.nome}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.slug}.zaieze.com</td>
                <td>{r.plano}</td>
                <td>
                  {r.assinatura
                    ? <span className={`selo ${r.assinatura.status === 'ATIVA' ? 'ok' : r.assinatura.status === 'CANCELADA' ? 'baixo' : 'ATACADO'}`}>{r.assinatura.status}{r.assinatura.simulada ? ' (sim)' : ''}</span>
                    : '—'}
                </td>
                <td>{r.lojas}</td>
                <td>{r.usuarios}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtData(r.criadoEm)}</td>
              </tr>
            ))}
            {redes.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>Nenhuma rede ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Histórico de reajustes ── */}
      {reajustes.length > 0 && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>🗂️ Histórico de reajustes</h2>
          <table>
            <thead><tr><th>Data</th><th>Índice</th><th>%</th><th>Por</th><th>Detalhe</th></tr></thead>
            <tbody>
              {reajustes.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtData(r.aplicadoEm)}</td>
                  <td>{r.indice}</td>
                  <td>{Number(r.percentual)}%</td>
                  <td>{r.aplicadoPor ?? '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                    {r.detalhe ? Object.entries(r.detalhe).map(([pl, v]) => `${pl}: ${formataReal(v.de)}→${formataReal(v.para)}`).join(' · ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ── Seção de códigos promocionais ──
function PromoSection({ promos, onChange }: { promos: Promo[]; onChange: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [tipo, setTipo] = useState<'DIAS_GRATIS' | 'PERCENTUAL'>('DIAS_GRATIS')
  const [dias, setDias] = useState('90')
  const [percentual, setPercentual] = useState('')
  const [descricao, setDescricao] = useState('')
  const [validadeAte, setValidadeAte] = useState('')
  const [maxUsos, setMaxUsos] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function criar(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try {
      await api.post('/admin/promos', {
        codigo, tipo,
        dias: tipo === 'DIAS_GRATIS' ? Number(dias) : undefined,
        percentual: tipo === 'PERCENTUAL' ? Number(percentual) : undefined,
        descricao: descricao || undefined,
        validadeAte: validadeAte || undefined,
        maxUsos: maxUsos ? Number(maxUsos) : undefined,
      })
      setCodigo(''); setDescricao(''); setValidadeAte(''); setMaxUsos(''); setPercentual('')
      onChange()
    } catch (e2) { setErro(mensagemDeErro(e2)) } finally { setOcupado(false) }
  }

  async function alternar(p: Promo) { await api.patch(`/admin/promos/${p.id}`, { ativo: !p.ativo }).catch(() => {}); onChange() }
  async function remover(p: Promo) { if (window.confirm(`Excluir o código ${p.codigo}?`)) { await api.delete(`/admin/promos/${p.id}`).catch(() => {}); onChange() } }

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>🎟️ Códigos promocionais</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Use no checkout. <strong>Dias grátis</strong> = "comece a pagar depois de N dias" (free trial). <strong>Percentual</strong> = desconto na mensalidade.
      </div>
      <form onSubmit={criar} className="linha-campos" style={{ alignItems: 'end' }}>
        <div className="campo">
          <label>Código</label>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="BEMVINDO90" required />
        </div>
        <div className="campo">
          <label>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as 'DIAS_GRATIS' | 'PERCENTUAL')}>
            <option value="DIAS_GRATIS">Dias grátis</option>
            <option value="PERCENTUAL">% de desconto</option>
          </select>
        </div>
        {tipo === 'DIAS_GRATIS'
          ? <div className="campo"><label>Dias grátis</label><input type="number" min="1" value={dias} onChange={(e) => setDias(e.target.value)} /></div>
          : <div className="campo"><label>Desconto (%)</label><input type="number" min="1" max="100" step="0.01" value={percentual} onChange={(e) => setPercentual(e.target.value)} /></div>}
        <div className="campo"><label>Validade (opcional)</label><input type="date" value={validadeAte} onChange={(e) => setValidadeAte(e.target.value)} /></div>
        <div className="campo"><label>Máx. usos (opcional)</label><input type="number" min="1" value={maxUsos} onChange={(e) => setMaxUsos(e.target.value)} /></div>
        <div><button className="btn" disabled={ocupado}>Criar código</button></div>
      </form>
      <div className="campo" style={{ marginTop: 6 }}>
        <label>Descrição (opcional)</label>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: campanha de lançamento" />
      </div>
      {erro && <div className="alerta" style={{ marginTop: 8 }}>{erro}</div>}

      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Código</th><th>Benefício</th><th>Validade</th><th>Usos</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {promos.map((p) => (
            <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
              <td><strong>{p.codigo}</strong></td>
              <td>{p.tipo === 'DIAS_GRATIS' ? `${p.dias} dias grátis` : `${Number(p.percentual)}% off`}{p.descricao ? ` · ${p.descricao}` : ''}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtData(p.validadeAte)}</td>
              <td>{p.usos}{p.maxUsos ? `/${p.maxUsos}` : ''}</td>
              <td><span className={`selo ${p.ativo ? 'ok' : 'baixo'}`}>{p.ativo ? 'ativo' : 'inativo'}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); alternar(p) }}>{p.ativo ? 'desativar' : 'ativar'}</a>
                {' · '}<a href="#" onClick={(e) => { e.preventDefault(); remover(p) }}>excluir</a>
              </td>
            </tr>
          ))}
          {promos.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-soft)' }}>Nenhum código ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

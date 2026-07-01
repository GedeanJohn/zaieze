import { useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, type Plano } from '../api'

interface PlanoAdmin { plano: Plano; nome: string; limite: string; resumo: string; preco: number }
interface RedeAdmin {
  id: string; nome: string; slug: string; plano: Plano; ativo: boolean; criadoEm: string; lojas: number; usuarios: number
  assinatura: { plano: Plano; status: string; valor: number; cicloFimEm: string | null; cancelamentoAgendado: boolean; simulada: boolean } | null
}
interface Promo { id: string; codigo: string; tipo: 'DIAS_GRATIS' | 'PERCENTUAL'; dias: number | null; percentual: string | null; descricao: string | null; validadeAte: string | null; maxUsos: number | null; usos: number; ativo: boolean }

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

export default function Admin() {
  const [planos, setPlanos] = useState<PlanoAdmin[]>([])
  const [precos, setPrecos] = useState<Record<string, string>>({})
  const [redes, setRedes] = useState<RedeAdmin[]>([])
  const [promos, setPromos] = useState<Promo[]>([])
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  function carregar() {
    api.get('/admin/planos').then(({ data }) => {
      setPlanos(data.planos)
      setPrecos(Object.fromEntries(data.planos.map((p: PlanoAdmin) => [p.plano, String(p.preco)])))
    }).catch((e) => setErro(mensagemDeErro(e)))
    api.get('/admin/redes').then(({ data }) => setRedes(data.redes)).catch(() => {})
    api.get('/admin/promos').then(({ data }) => setPromos(data.promos)).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function ativarCortesia(r: RedeAdmin) {
    if (!window.confirm(`Ativar ${r.nome} em modo CORTESIA (grátis)? Destrava o acesso e cancela qualquer cobrança pendente no Mercado Pago.`)) return
    setOcupado(true); setMsg(''); setErro('')
    try {
      await api.post(`/admin/redes/${r.id}/ativar-cortesia`)
      setMsg(`${r.nome} ativada (cortesia). O lojista já pode acessar.`)
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  async function salvarPrecos() {
    setOcupado(true); setMsg(''); setErro('')
    try {
      const corpo = Object.fromEntries(Object.entries(precos).map(([k, v]) => [k, Number(v)]))
      await api.put('/admin/planos', { precos: corpo })
      setMsg('Preços salvos. Valem para novas assinaturas e trocas de plano.')
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
      </div>

      {/* ── Reajuste anual por IGP-M (contratos existentes, por aniversário) ── */}
      <IgpmSection />

      {/* ── Códigos promocionais ── */}
      <PromoSection promos={promos} onChange={carregar} />

      {/* ── Redes (clientes) ── */}
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>🏢 Redes (clientes) · {redes.length}</h2>
        <table>
          <thead><tr><th>Marca</th><th>Endereço</th><th>Plano</th><th>Assinatura</th><th>Lojas</th><th>Usuários</th><th>Desde</th><th>Ações</th></tr></thead>
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
                <td style={{ whiteSpace: 'nowrap' }}>
                  {(!r.ativo || r.assinatura?.status === 'PENDENTE')
                    ? <a href="#" onClick={(e) => { e.preventDefault(); ativarCortesia(r) }} style={{ color: '#16a34a', fontWeight: 600 }}>Ativar (cortesia)</a>
                    : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                </td>
              </tr>
            ))}
            {redes.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--ink-soft)' }}>Nenhuma rede ainda.</td></tr>}
          </tbody>
        </table>
      </div>

    </>
  )
}

// ── Reajuste anual por IGP-M (tabela mensal + log dos reajustes por aniversário) ──
const MESES = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
interface IndiceIgpm { id: string; ano: number; mes: number; percentual: string; registradoPor: string | null }
interface ReajusteAniv { id: string; redeNome: string; ano: number; mes: number; percentual: string; valorAntes: string; valorDepois: string; aplicadoEm: string }

function IgpmSection() {
  const agora = new Date()
  const [indices, setIndices] = useState<IndiceIgpm[]>([])
  const [log, setLog] = useState<ReajusteAniv[]>([])
  const [ano, setAno] = useState(String(agora.getFullYear()))
  const [mes, setMes] = useState(String(agora.getMonth() + 1))
  const [taxa, setTaxa] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  function carregar() {
    api.get('/admin/igpm').then(({ data }) => setIndices(data.indices)).catch(() => {})
    api.get('/admin/reajustes-aniversario').then(({ data }) => setLog(data.reajustes)).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try {
      await api.put('/admin/igpm', { ano: Number(ano), mes: Number(mes), percentual: Number(taxa) })
      setTaxa(''); carregar()
    } catch (e2) { setErro(mensagemDeErro(e2)) } finally { setOcupado(false) }
  }
  async function remover(i: IndiceIgpm) {
    if (!window.confirm(`Excluir a taxa de ${MESES[i.mes]}/${i.ano}?`)) return
    await api.delete(`/admin/igpm/${i.ano}/${i.mes}`).catch(() => {}); carregar()
  }

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>📈 Reajuste anual por IGP-M</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Lance o <strong>IGP-M acumulado (12 meses)</strong> de cada mês. No <strong>aniversário de cada contrato</strong>, o sistema
        aplica automaticamente a taxa do <strong>mês anterior ao aniversário</strong> (o 12º mês do contrato) — ex.: contrato de
        jun/2026 reajusta em jun/2027 com o índice de mai/2027. Se a taxa do mês ainda não foi lançada, ele aguarda e aplica quando você lançar.
      </div>
      <form onSubmit={salvar} className="linha-campos" style={{ alignItems: 'end' }}>
        <div className="campo"><label>Mês</label>
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div className="campo"><label>Ano</label><input type="number" min="2020" max="2100" value={ano} onChange={(e) => setAno(e.target.value)} /></div>
        <div className="campo"><label>IGP-M 12m (%)</label><input type="number" step="0.001" value={taxa} onChange={(e) => setTaxa(e.target.value)} placeholder="ex.: 4.5" required /></div>
        <div><button className="btn" disabled={ocupado}>Lançar taxa</button></div>
      </form>
      {erro && <div className="alerta" style={{ marginTop: 8 }}>{erro}</div>}

      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Mês/Ano</th><th>IGP-M 12m</th><th>Por</th><th></th></tr></thead>
        <tbody>
          {indices.map((i) => (
            <tr key={i.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{MESES[i.mes]}/{i.ano}</td>
              <td>{Number(i.percentual)}%</td>
              <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{i.registradoPor ?? '—'}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); remover(i) }}>excluir</a></td>
            </tr>
          ))}
          {indices.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>Nenhuma taxa lançada ainda.</td></tr>}
        </tbody>
      </table>

      {log.length > 0 && (
        <>
          <h3 style={{ margin: '16px 0 6px' }}>🗂️ Reajustes aplicados (por aniversário)</h3>
          <table>
            <thead><tr><th>Data</th><th>Marca</th><th>Índice</th><th>%</th><th>Valor</th></tr></thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtData(r.aplicadoEm)}</td>
                  <td>{r.redeNome}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{MESES[r.mes]}/{r.ano}</td>
                  <td>{Number(r.percentual)}%</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formataReal(Number(r.valorAntes))} → {formataReal(Number(r.valorDepois))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
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

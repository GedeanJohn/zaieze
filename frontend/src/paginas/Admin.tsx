import { useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, type Plano } from '../api'
import { useToast } from '../componentes/Toast'

interface PlanoAdmin { plano: Plano; nome: string; limite: string; resumo: string; preco: number }
interface AddonAdmin { tipo: string; nome: string; resumo: string; preco: number }
interface RedeAdmin {
  id: string; nome: string; slug: string; plano: Plano; ativo: boolean; criadoEm: string; lojas: number; usuarios: number
  assinatura: { plano: Plano; status: string; valor: number; cicloFimEm: string | null; cancelamentoAgendado: boolean; simulada: boolean } | null
}
interface Promo { id: string; codigo: string; tipo: 'DIAS_GRATIS' | 'PERCENTUAL'; aplicaA: 'REDE' | 'ASSESSOR'; plano: string | null; dias: number | null; percentual: string | null; descricao: string | null; validadeAte: string | null; maxUsos: number | null; usos: number; ativo: boolean }

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

export default function Admin() {
  const [planos, setPlanos] = useState<PlanoAdmin[]>([])
  const [precos, setPrecos] = useState<Record<string, string>>({})
  const [addons, setAddons] = useState<AddonAdmin[]>([])
  const [precosAddon, setPrecosAddon] = useState<Record<string, string>>({})
  const [descontoAnual, setDescontoAnual] = useState('10')
  const [redes, setRedes] = useState<RedeAdmin[]>([])
  const [promos, setPromos] = useState<Promo[]>([])
  const [ocupado, setOcupado] = useState(false)
  const avisar = useToast()

  function carregar() {
    api.get('/admin/planos').then(({ data }) => {
      setPlanos(data.planos)
      setPrecos(Object.fromEntries(data.planos.map((p: PlanoAdmin) => [p.plano, String(p.preco)])))
    }).catch((e) => avisar(mensagemDeErro(e), 'erro'))
    api.get('/admin/addons').then(({ data }) => {
      setAddons(data.addons)
      setPrecosAddon(Object.fromEntries(data.addons.map((a: AddonAdmin) => [a.tipo, String(a.preco)])))
    }).catch((e) => avisar(mensagemDeErro(e), 'erro'))
    api.get('/admin/redes').then(({ data }) => setRedes(data.redes)).catch(() => {})
    api.get('/admin/promos').then(({ data }) => setPromos(data.promos)).catch(() => {})
    api.get('/admin/config-assinatura').then(({ data }) => setDescontoAnual(String(data.percentualDescontoAnual))).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function ativarCortesia(r: RedeAdmin) {
    if (!window.confirm(`Ativar ${r.nome} em modo CORTESIA (grátis)? Destrava o acesso e cancela qualquer cobrança pendente no Mercado Pago.`)) return
    const codigoPromo = window.prompt('Foi combinado algum código promocional com o lojista? Deixe vazio se não.')?.trim() || undefined
    setOcupado(true)
    try {
      await api.post(`/admin/redes/${r.id}/ativar-cortesia`, { codigoPromo })
      avisar(`${r.nome} ativada (cortesia).` + (codigoPromo ? ` Uso do cupom ${codigoPromo.toUpperCase()} contabilizado.` : ' O lojista já pode acessar.'))
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  async function excluirRede(r: RedeAdmin) {
    const digitado = window.prompt(
      `Isso apaga a marca "${r.nome}" PERMANENTEMENTE — lojas, usuários, clientes, produtos, vendas, mensagens, mídias e qualquer cobrança futura no Mercado Pago. Não tem volta.\n\nPara confirmar, digite exatamente o nome da marca:`,
    )
    if (digitado === null) return
    if (digitado.trim() !== r.nome) { avisar('Nome não confere. Nada foi excluído.', 'erro'); return }
    setOcupado(true)
    try {
      await api.delete(`/admin/redes/${r.id}`, { data: { confirmarNome: digitado.trim() } })
      avisar(`${r.nome} excluída permanentemente.`)
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  async function salvarPrecos() {
    setOcupado(true)
    try {
      const corpo = Object.fromEntries(Object.entries(precos).map(([k, v]) => [k, Number(v)]))
      await api.put('/admin/planos', { precos: corpo })
      avisar('Preços salvos. Valem para novas assinaturas e trocas de plano.')
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  async function salvarPrecoAddon(tipo: string) {
    setOcupado(true)
    try {
      await api.put(`/admin/addons/${tipo}/preco`, { preco: Number(precosAddon[tipo]) })
      avisar('Preço do add-on salvo. Vale para novas assinaturas.')
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  async function salvarDescontoAnual() {
    setOcupado(true)
    try {
      await api.put('/admin/config-assinatura', { percentualDescontoAnual: Number(descontoAnual) })
      avisar('Desconto do plano anual salvo.')
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  return (
    <>
      <header><h1>🛠️ Painel do Admin</h1><span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Operação do SaaS</span></header>

      {/* ── Pedidos de redefinição de senha (gestores sem WhatsApp cadastrado) ── */}
      <SolicitacoesSenhaSection />

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

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>
            Desconto do <strong>plano anual</strong> (cobrança 1x/ano, à vista) sobre 12x o preço mensal.
          </div>
          <div className="linha-campos" style={{ alignItems: 'end' }}>
            <div className="campo" style={{ maxWidth: 140 }}>
              <label>% de desconto</label>
              <input type="number" min="0" max="90" step="0.01" value={descontoAnual} onChange={(e) => setDescontoAnual(e.target.value)} />
            </div>
            <div><button className="btn secundario" onClick={salvarDescontoAnual} disabled={ocupado}>Salvar %</button></div>
          </div>
        </div>
      </div>

      {/* ── Add-ons (assinaturas à parte de qualquer plano) ── */}
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>🧩 Add-ons & Preços</h2>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
          Recursos vendidos <strong>à parte</strong> de qualquer plano, com assinatura própria. O preço vale para <strong>novas assinaturas</strong>.
        </div>
        {addons.map((a) => (
          <div key={a.tipo} className="linha-campos" style={{ alignItems: 'end' }}>
            <div className="campo" style={{ maxWidth: 220 }}>
              <label>{a.nome} (R$/mês)</label>
              <input type="number" step="0.01" min="0" value={precosAddon[a.tipo] ?? ''} onChange={(e) => setPrecosAddon({ ...precosAddon, [a.tipo]: e.target.value })} />
            </div>
            <div><button className="btn" onClick={() => salvarPrecoAddon(a.tipo)} disabled={ocupado}>Salvar</button></div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', maxWidth: 320 }}>{a.resumo}</div>
          </div>
        ))}
        {addons.length === 0 && <div style={{ color: 'var(--ink-soft)' }}>Nenhum add-on cadastrado.</div>}
      </div>

      {/* ── Reajuste anual por IGP-M (contratos existentes, por aniversário) ── */}
      <IgpmSection />

      {/* ── Códigos promocionais ── */}
      <PromoSection promos={promos} onChange={carregar} />

      {/* ── Programa de Afiliados ── */}
      <AfiliadosSection />
      <ComissoesAfiliadoSection />

      {/* ── Corretores de Moda ── */}
      <AssessoresSection />
      <ComissoesAssessorSection />

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
                  {(!r.ativo || r.assinatura?.status === 'PENDENTE') && (
                    <a href="#" onClick={(e) => { e.preventDefault(); ativarCortesia(r) }} style={{ color: '#16a34a', fontWeight: 600 }}>Ativar (cortesia)</a>
                  )}
                  {(!r.ativo || r.assinatura?.status === 'PENDENTE') && ' · '}
                  <a href="#" onClick={(e) => { e.preventDefault(); excluirRede(r) }} style={{ color: 'var(--danger)', fontWeight: 600 }}>Excluir loja</a>
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

// ── Pedidos de redefinição de senha de GESTORES sem WhatsApp cadastrado ──
interface SolicitacaoSenha { id: string; createdAt: string; usuario: { id: string; nome: string; email: string } }

function SolicitacoesSenhaSection() {
  const [lista, setLista] = useState<SolicitacaoSenha[]>([])
  const [gerada, setGerada] = useState<{ nome: string; senha: string } | null>(null)
  const [erro, setErro] = useState('')

  function carregar() {
    api.get('/admin/solicitacoes-senha').then(({ data }) => setLista(data.solicitacoes)).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function gerar(s: SolicitacaoSenha) {
    setErro('')
    try {
      const { data } = await api.post(`/admin/solicitacoes-senha/${s.id}/gerar`)
      setGerada({ nome: s.usuario.nome, senha: data.senha })
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) }
  }

  if (lista.length === 0) return null

  return (
    <div className="cartao" style={{ borderLeft: '4px solid var(--accent)' }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>🔑 Pedidos de redefinição de senha ({lista.length})</h2>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
        Gestores sem WhatsApp cadastrado que pediram "esqueci minha senha". Gere uma senha provisória e repasse manualmente.
      </p>
      {erro && <div className="alerta">{erro}</div>}
      {gerada && (
        <div className="sucesso" style={{ marginBottom: 10 }}>
          Senha provisória de <strong>{gerada.nome}</strong>: <strong>{gerada.senha}</strong> — copie e envie por WhatsApp.
        </div>
      )}
      <table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Pedido em</th><th></th></tr></thead>
        <tbody>
          {lista.map((s) => (
            <tr key={s.id}>
              <td>{s.usuario.nome}</td>
              <td>{s.usuario.email}</td>
              <td>{new Date(s.createdAt).toLocaleString('pt-BR')}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); gerar(s) }}>gerar senha</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const [aplicaA, setAplicaA] = useState<'REDE' | 'ASSESSOR'>('REDE')
  const [plano, setPlano] = useState('')
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
        codigo, tipo, aplicaA,
        plano: aplicaA === 'REDE' ? (plano || undefined) : undefined,
        dias: tipo === 'DIAS_GRATIS' ? Number(dias) : undefined,
        percentual: tipo === 'PERCENTUAL' ? Number(percentual) : undefined,
        descricao: descricao || undefined,
        validadeAte: validadeAte || undefined,
        maxUsos: maxUsos ? Number(maxUsos) : undefined,
      })
      setCodigo(''); setDescricao(''); setValidadeAte(''); setMaxUsos(''); setPercentual(''); setPlano(''); setAplicaA('REDE')
      onChange()
    } catch (e2) { setErro(mensagemDeErro(e2)) } finally { setOcupado(false) }
  }

  async function alternar(p: Promo) { await api.patch(`/admin/promos/${p.id}`, { ativo: !p.ativo }).catch(() => {}); onChange() }
  async function remover(p: Promo) { if (window.confirm(`Excluir o código ${p.codigo}?`)) { await api.delete(`/admin/promos/${p.id}`).catch(() => {}); onChange() } }
  function copiarLink(p: Promo) {
    // Cupom com plano → link completo (só ?cupom=). Sem plano → checkout abre no plano padrão.
    const url = p.aplicaA === 'ASSESSOR'
      ? `https://zaieze.com/assessor-de-moda/cadastro?cupom=${encodeURIComponent(p.codigo)}`
      : `https://zaieze.com/checkout?cupom=${encodeURIComponent(p.codigo)}`
    navigator.clipboard?.writeText(url).catch(() => {})
    window.alert(`Link do cupom copiado:\n${url}`)
  }

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
        <div className="campo">
          <label>Aplica a</label>
          <select value={aplicaA} onChange={(e) => setAplicaA(e.target.value as 'REDE' | 'ASSESSOR')}>
            <option value="REDE">Lojista (assinatura de plano)</option>
            <option value="ASSESSOR">Corretor(a) de Moda</option>
          </select>
        </div>
        {aplicaA === 'REDE' && (
          <div className="campo">
            <label>Plano (opcional)</label>
            <select value={plano} onChange={(e) => setPlano(e.target.value)}>
              <option value="">Qualquer plano</option>
              <option value="START">Start</option>
              <option value="PRO">Pro</option>
              <option value="ELITE">Elite</option>
            </select>
          </div>
        )}
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
        <thead><tr><th>Código</th><th>Aplica a</th><th>Benefício</th><th>Validade</th><th>Usos</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {promos.map((p) => (
            <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.5 }}>
              <td><strong>{p.codigo}</strong>{p.plano ? <span className="selo ATACADO" style={{ marginLeft: 6 }}>{p.plano}</span> : null}</td>
              <td>{p.aplicaA === 'ASSESSOR' ? 'Corretora' : 'Lojista'}</td>
              <td>{p.tipo === 'DIAS_GRATIS' ? `${p.dias} dias grátis` : `${Number(p.percentual)}% off`}{p.descricao ? ` · ${p.descricao}` : ''}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtData(p.validadeAte)}</td>
              <td>{p.usos}{p.maxUsos ? `/${p.maxUsos}` : ''}</td>
              <td><span className={`selo ${p.ativo ? 'ok' : 'baixo'}`}>{p.ativo ? 'ativo' : 'inativo'}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); copiarLink(p) }}>copiar link</a>
                {' · '}<a href="#" onClick={(e) => { e.preventDefault(); alternar(p) }}>{p.ativo ? 'desativar' : 'ativar'}</a>
                {' · '}<a href="#" onClick={(e) => { e.preventDefault(); remover(p) }}>excluir</a>
              </td>
            </tr>
          ))}
          {promos.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>Nenhum código ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ── Programa de Afiliados ──
interface AfiliadoAdmin {
  id: string; codigo: string; percentualComissao: number | null; cliques: number; redesIndicadas: number
  pendente: number; paga: number
  taxStatus: 'PF' | 'PJ' | 'MEI' | null
  statusFiscal: 'EM_DIA' | 'IRREGULAR' | 'NAO_VERIFICADO'
  statusFiscalVerificadoEm: string | null
  usuario: { id: string; nome: string; email: string; telefone: string | null; ativo: boolean }
}

function AfiliadosSection() {
  const [afiliados, setAfiliados] = useState<AfiliadoAdmin[]>([])
  const [percentualPadrao, setPercentualPadrao] = useState('10')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [percentual, setPercentual] = useState('')
  const [taxStatus, setTaxStatus] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [gerado, setGerado] = useState<{ nome: string; codigo: string; senha: string } | null>(null)

  function carregar() {
    api.get('/admin/afiliados').then(({ data }) => setAfiliados(data.afiliados)).catch(() => {})
    api.get('/admin/afiliados/config').then(({ data }) => setPercentualPadrao(String(data.percentualPadrao))).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function criar(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try {
      const { data } = await api.post('/admin/afiliados', {
        nome, email, telefone: telefone || undefined,
        percentualComissao: percentual ? Number(percentual) : undefined,
        taxStatus: taxStatus || undefined,
      })
      setGerado({ nome, codigo: data.afiliado.codigo, senha: data.senha })
      setNome(''); setEmail(''); setTelefone(''); setPercentual(''); setTaxStatus('')
      carregar()
    } catch (e2) { setErro(mensagemDeErro(e2)) } finally { setOcupado(false) }
  }

  async function alternarAtivo(a: AfiliadoAdmin) {
    await api.patch(`/admin/afiliados/${a.id}`, { ativo: !a.usuario.ativo }).catch(() => {})
    carregar()
  }

  async function definirStatusFiscal(a: AfiliadoAdmin, statusFiscal: string) {
    await api.patch(`/admin/afiliados/${a.id}`, { statusFiscal }).catch(() => {})
    carregar()
  }

  async function salvarPercentualPadrao() {
    setOcupado(true)
    try {
      await api.put('/admin/afiliados/config', { percentualPadrao: Number(percentualPadrao) })
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  function copiarLink(codigo: string) {
    const url = `https://zaieze.com/?ref=${codigo}`
    navigator.clipboard?.writeText(url).catch(() => {})
    window.alert(`Link do afiliado copiado:\n${url}`)
  }

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>🤝 Programa de Afiliados</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Comissão <strong>vitalícia</strong> sobre o valor recorrente das assinaturas vendidas pelo link do afiliado.
        O repasse é <strong>manual</strong> (Pix por fora, marcado como pago aqui) — o Mercado Pago não tem split
        automático para esse tipo de assinatura. O campo <strong>Fiscal</strong> é a verificação manual de saúde
        fiscal do afiliado (Reforma Tributária/LC 214-2025) — a plataforma pode ser corresponsabilizada se um
        parceiro irregular não emitir nota; marque <strong>Irregular</strong> pra ser avisado antes de pagar.
      </div>

      <div className="linha-campos" style={{ alignItems: 'end', marginBottom: 14 }}>
        <div className="campo" style={{ maxWidth: 160 }}>
          <label>% padrão de comissão</label>
          <input type="number" min="0" max="100" step="0.01" value={percentualPadrao} onChange={(e) => setPercentualPadrao(e.target.value)} />
        </div>
        <div><button type="button" className="btn secundario" onClick={salvarPercentualPadrao} disabled={ocupado}>Salvar %</button></div>
      </div>

      <form onSubmit={criar} className="linha-campos" style={{ alignItems: 'end' }}>
        <div className="campo"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
        <div className="campo"><label>E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="campo"><label>Telefone (opcional)</label><input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
        <div className="campo" style={{ maxWidth: 160 }}><label>% (opcional, senão usa o padrão)</label><input type="number" min="0" max="100" step="0.01" value={percentual} onChange={(e) => setPercentual(e.target.value)} /></div>
        <div className="campo" style={{ maxWidth: 140 }}>
          <label>Enquadramento (opcional)</label>
          <select value={taxStatus} onChange={(e) => setTaxStatus(e.target.value)}>
            <option value="">—</option>
            <option value="PF">Pessoa física</option>
            <option value="PJ">PJ</option>
            <option value="MEI">MEI</option>
          </select>
        </div>
        <div><button className="btn" disabled={ocupado}>Criar afiliado</button></div>
      </form>
      {erro && <div className="alerta" style={{ marginTop: 8 }}>{erro}</div>}
      {gerado && (
        <div className="sucesso" style={{ marginTop: 10 }}>
          Afiliado <strong>{gerado.nome}</strong> criado — código <strong>{gerado.codigo}</strong>, senha provisória <strong>{gerado.senha}</strong>. Copie e envie a ele.
        </div>
      )}

      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Nome</th><th>Código</th><th>%</th><th>Cliques</th><th>Redes</th><th>Pendente</th><th>Pago</th><th>Status</th><th>Fiscal</th><th></th></tr></thead>
        <tbody>
          {afiliados.map((a) => (
            <tr key={a.id} style={{ opacity: a.usuario.ativo ? 1 : 0.5 }}>
              <td>{a.usuario.nome}</td>
              <td><strong>{a.codigo}</strong></td>
              <td>{a.percentualComissao != null ? `${a.percentualComissao}%` : <span style={{ color: 'var(--ink-soft)' }}>padrão</span>}</td>
              <td>{a.cliques}</td>
              <td>{a.redesIndicadas}</td>
              <td>{formataReal(a.pendente)}</td>
              <td>{formataReal(a.paga)}</td>
              <td><span className={`selo ${a.usuario.ativo ? 'ok' : 'baixo'}`}>{a.usuario.ativo ? 'ativo' : 'inativo'}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {a.taxStatus ?? <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                {' · '}
                <select
                  value={a.statusFiscal}
                  onChange={(e) => definirStatusFiscal(a, e.target.value)}
                  style={{ fontSize: 11, padding: '2px 4px' }}
                >
                  <option value="NAO_VERIFICADO">não verificado</option>
                  <option value="EM_DIA">em dia</option>
                  <option value="IRREGULAR">irregular</option>
                </select>
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); copiarLink(a.codigo) }}>copiar link</a>
                {' · '}<a href="#" onClick={(e) => { e.preventDefault(); alternarAtivo(a) }}>{a.usuario.ativo ? 'desativar' : 'ativar'}</a>
              </td>
            </tr>
          ))}
          {afiliados.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--ink-soft)' }}>Nenhum afiliado ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

interface ComissaoAdmin {
  id: string; redeNome: string; cicloEm: string; valorBaseAssinatura: number; percentualComissao: number
  valorComissao: number; status: 'PENDENTE' | 'PAGA'; pagoEm: string | null; afiliadoCodigo: string; afiliadoNome: string
  valorRetencaoFiscal: number | null; afiliadoStatusFiscal: 'EM_DIA' | 'IRREGULAR' | 'NAO_VERIFICADO'
}

function ComissoesAfiliadoSection() {
  const [comissoes, setComissoes] = useState<ComissaoAdmin[]>([])
  const [filtro, setFiltro] = useState<'' | 'PENDENTE' | 'PAGA'>('PENDENTE')
  const avisar = useToast()

  function carregar() {
    api.get('/admin/afiliados/comissoes', { params: filtro ? { status: filtro } : {} })
      .then(({ data }) => setComissoes(data.comissoes)).catch(() => {})
  }
  useEffect(() => { carregar() }, [filtro])

  async function marcarPaga(c: ComissaoAdmin) {
    if (c.afiliadoStatusFiscal === 'IRREGULAR') {
      if (!window.confirm(`⚠️ ${c.afiliadoNome} está marcado como IRREGULAR (saúde fiscal). Pagar mesmo assim?`)) return
    }
    const obs = window.prompt(`Marcar a comissão de ${formataReal(c.valorComissao)} (${c.afiliadoNome}) como paga?\nObservação (opcional, ex.: comprovante/data do Pix):`)
    if (obs === null) return
    const retStr = window.prompt('Reteve algum valor de IBS/CBS nesse repasse? Deixe vazio se não.')
    if (retStr === null) return
    try {
      await api.post(`/admin/afiliados/comissoes/${c.id}/pagar`, {
        observacaoPagamento: obs || undefined,
        valorRetencaoFiscal: retStr.trim() ? Number(retStr.replace(',', '.')) : undefined,
      })
      avisar('Comissão marcada como paga.')
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>💸 Comissões de afiliados</h2>
      <div className="linha-campos" style={{ marginBottom: 10 }}>
        <div className="campo" style={{ maxWidth: 200 }}>
          <label>Status</label>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
            <option value="PENDENTE">Pendentes</option>
            <option value="PAGA">Pagas</option>
            <option value="">Todas</option>
          </select>
        </div>
      </div>
      <table>
        <thead><tr><th>Afiliado</th><th>Rede</th><th>Ciclo</th><th>Base</th><th>%</th><th>Comissão</th><th>Retenção fiscal</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {comissoes.map((c) => (
            <tr key={c.id}>
              <td>
                {c.afiliadoNome} <span style={{ color: 'var(--ink-soft)' }}>({c.afiliadoCodigo})</span>
                {c.afiliadoStatusFiscal === 'IRREGULAR' && <span title="Saúde fiscal irregular" style={{ marginLeft: 6 }}>⚠️</span>}
              </td>
              <td>{c.redeNome}</td>
              <td>{fmtData(c.cicloEm)}</td>
              <td>{formataReal(c.valorBaseAssinatura)}</td>
              <td>{c.percentualComissao}%</td>
              <td><strong>{formataReal(c.valorComissao)}</strong></td>
              <td>{c.valorRetencaoFiscal != null ? formataReal(c.valorRetencaoFiscal) : <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
              <td><span className={`selo ${c.status === 'PAGA' ? 'ok' : 'ATACADO'}`}>{c.status}</span></td>
              <td>{c.status === 'PENDENTE' && <a href="#" onClick={(e) => { e.preventDefault(); marcarPaga(c) }}>marcar paga</a>}</td>
            </tr>
          ))}
          {comissoes.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--ink-soft)' }}>Nenhuma comissão aqui.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

interface AssessorAdmin {
  id: string; slug: string; marcas: number; vendas: number
  usuario: { id: string; nome: string; email: string; telefone: string | null; ativo: boolean }
  assinatura: { status: 'PENDENTE' | 'ATIVA' | 'CANCELADA'; simulada: boolean; valor: number } | null
  percentualComissaoIndicacao: number | null
  cliquesIndicacao: number
  redesIndicadas: number
  pendente: number
  paga: number
}

function AssessoresSection() {
  const [assessores, setAssessores] = useState<AssessorAdmin[]>([])
  const [precoMensal, setPrecoMensal] = useState('89.99')
  const [salvandoPreco, setSalvandoPreco] = useState(false)
  const [percentualPadraoIndicacao, setPercentualPadraoIndicacao] = useState('2')
  const [salvandoPercentualPadrao, setSalvandoPercentualPadrao] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [slug, setSlug] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [gerado, setGerado] = useState<{ nome: string; slug: string; senha: string } | null>(null)

  function carregar() {
    api.get('/admin/assessores').then(({ data }) => setAssessores(data.assessores)).catch(() => {})
    api.get('/admin/assessores/config').then(({ data }) => setPrecoMensal(String(data.precoMensal))).catch(() => {})
    api.get('/admin/assessores/indicacao-config').then(({ data }) => setPercentualPadraoIndicacao(String(data.percentualPadrao))).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function salvarPreco() {
    setSalvandoPreco(true)
    try {
      await api.put('/admin/assessores/config', { precoMensal: Number(precoMensal) })
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setSalvandoPreco(false) }
  }

  async function salvarPercentualPadrao() {
    setSalvandoPercentualPadrao(true)
    try {
      await api.put('/admin/assessores/indicacao-config', { percentualPadrao: Number(percentualPadraoIndicacao) })
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setSalvandoPercentualPadrao(false) }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try {
      const { data } = await api.post('/admin/assessores', { nome, email, telefone: telefone || undefined, slug })
      setGerado({ nome, slug: data.assessor.slug, senha: data.senha })
      setNome(''); setEmail(''); setTelefone(''); setSlug('')
      carregar()
    } catch (e2) { setErro(mensagemDeErro(e2)) } finally { setOcupado(false) }
  }

  async function alternarAtivo(a: AssessorAdmin) {
    await api.patch(`/admin/assessores/${a.id}`, { ativo: !a.usuario.ativo }).catch(() => {})
    carregar()
  }

  async function arbitrarPercentual(a: AssessorAdmin) {
    const atual = a.percentualComissaoIndicacao != null ? String(a.percentualComissaoIndicacao) : ''
    const resp = window.prompt(
      `% de comissão sobre lojistas indicados por ${a.usuario.nome} (vazio = usa o % padrão, ${percentualPadraoIndicacao}%):`,
      atual,
    )
    if (resp === null) return
    const valor = resp.trim() ? Number(resp.replace(',', '.')) : null
    await api.patch(`/admin/assessores/${a.id}`, { percentualComissaoIndicacao: valor }).catch(() => {})
    carregar()
  }

  function copiarLinkIndicacao(a: AssessorAdmin) {
    const url = `https://zaieze.com/checkout?refAssessor=${encodeURIComponent(a.slug)}`
    navigator.clipboard?.writeText(url).catch(() => {})
    window.alert(`Link de indicação copiado:\n${url}`)
  }

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>👗 Corretores de Moda</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Papel com <strong>subdomínio próprio</strong> (<code>slug.zaieze.com</code>) que representa marcas de moda
        (do ZAIEZE ou externas) numa vitrine pública. Lança as próprias vendas/comissão manualmente.
        Assinatura mensal própria, vendida na página comercial. Cada corretora também tem um{' '}
        <strong>link próprio para indicar lojistas</strong> — toda assinatura do lojista indicado gera
        comissão <strong>recorrente</strong> (mesma mecânica do Programa de Afiliados), repassada
        manualmente (Pix por fora). Usa o <strong>% padrão</strong> abaixo, a menos que você arbitre um
        percentual individual para alguma corretora.
      </div>

      <div className="linha-campos" style={{ alignItems: 'end', marginBottom: 14 }}>
        <div className="campo" style={{ maxWidth: 160 }}>
          <label>Preço mensal (R$)</label>
          <input type="number" min="0" step="0.01" value={precoMensal} onChange={(e) => setPrecoMensal(e.target.value)} />
        </div>
        <div><button type="button" className="btn secundario" onClick={salvarPreco} disabled={salvandoPreco}>Salvar preço</button></div>
        <div className="campo" style={{ maxWidth: 160 }}>
          <label>% padrão de indicação</label>
          <input type="number" min="0" max="100" step="0.01" value={percentualPadraoIndicacao} onChange={(e) => setPercentualPadraoIndicacao(e.target.value)} />
        </div>
        <div><button type="button" className="btn secundario" onClick={salvarPercentualPadrao} disabled={salvandoPercentualPadrao}>Salvar % padrão</button></div>
      </div>

      <form onSubmit={criar} className="linha-campos" style={{ alignItems: 'end' }}>
        <div className="campo"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
        <div className="campo"><label>E-mail</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="campo"><label>Telefone (opcional)</label><input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
        <div className="campo" style={{ maxWidth: 200 }}>
          <label>Subdomínio (slug)</label>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ex.: joana" required />
        </div>
        <div><button className="btn" disabled={ocupado}>Criar corretor(a)</button></div>
      </form>
      {erro && <div className="alerta" style={{ marginTop: 8 }}>{erro}</div>}
      {gerado && (
        <div className="sucesso" style={{ marginTop: 10 }}>
          Corretor(a) <strong>{gerado.nome}</strong> criado(a) — endereço <strong>{gerado.slug}.zaieze.com</strong>, senha provisória <strong>{gerado.senha}</strong>. Copie e envie a ele(a).
        </div>
      )}

      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Nome</th><th>Endereço</th><th>Marcas</th><th>Vendas lançadas</th><th>Assinatura</th><th>Status</th>
            <th>% indicação</th><th>Cliques</th><th>Lojistas</th><th>Pendente</th><th>Pago</th><th></th>
          </tr>
        </thead>
        <tbody>
          {assessores.map((a) => (
            <tr key={a.id} style={{ opacity: a.usuario.ativo ? 1 : 0.5 }}>
              <td>{a.usuario.nome}</td>
              <td><strong>{a.slug}.zaieze.com</strong></td>
              <td>{a.marcas}</td>
              <td>{a.vendas}</td>
              <td>
                {a.assinatura
                  ? <span className={`selo ${a.assinatura.status === 'ATIVA' ? 'ok' : a.assinatura.status === 'CANCELADA' ? 'baixo' : 'ATACADO'}`}>
                      {a.assinatura.status}{a.assinatura.simulada ? ' (sim)' : ''}
                    </span>
                  : <span style={{ color: 'var(--ink-soft)' }}>sem assinatura</span>}
              </td>
              <td><span className={`selo ${a.usuario.ativo ? 'ok' : 'baixo'}`}>{a.usuario.ativo ? 'ativo' : 'inativo'}</span></td>
              <td>
                {a.percentualComissaoIndicacao != null ? `${a.percentualComissaoIndicacao}%` : <span style={{ color: 'var(--ink-soft)' }}>{percentualPadraoIndicacao}% (padrão)</span>}
                {' '}<a href="#" onClick={(e) => { e.preventDefault(); arbitrarPercentual(a) }}>editar</a>
              </td>
              <td>{a.cliquesIndicacao}</td>
              <td>{a.redesIndicadas}</td>
              <td>{formataReal(a.pendente)}</td>
              <td>{formataReal(a.paga)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <a href="#" onClick={(e) => { e.preventDefault(); copiarLinkIndicacao(a) }}>copiar link</a>
                {' · '}<a href="#" onClick={(e) => { e.preventDefault(); alternarAtivo(a) }}>{a.usuario.ativo ? 'desativar' : 'ativar'}</a>
              </td>
            </tr>
          ))}
          {assessores.length === 0 && <tr><td colSpan={11} style={{ color: 'var(--ink-soft)' }}>Nenhum corretor(a) ainda.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

interface ComissaoAssessorAdmin {
  id: string; redeNome: string; cicloEm: string; valorBaseAssinatura: number; percentualComissao: number
  valorComissao: number; status: 'PENDENTE' | 'PAGA'; pagoEm: string | null
  valorRetencaoFiscal: number | null; assessorSlug: string; assessorNome: string
}

function ComissoesAssessorSection() {
  const [comissoes, setComissoes] = useState<ComissaoAssessorAdmin[]>([])
  const [filtro, setFiltro] = useState<'' | 'PENDENTE' | 'PAGA'>('PENDENTE')
  const avisar = useToast()

  function carregar() {
    api.get('/admin/assessores/comissoes', { params: filtro ? { status: filtro } : {} })
      .then(({ data }) => setComissoes(data.comissoes)).catch(() => {})
  }
  useEffect(() => { carregar() }, [filtro])

  async function marcarPaga(c: ComissaoAssessorAdmin) {
    const obs = window.prompt(`Marcar a comissão de ${formataReal(c.valorComissao)} (${c.assessorNome}) como paga?\nObservação (opcional, ex.: comprovante/data do Pix):`)
    if (obs === null) return
    const retStr = window.prompt('Reteve algum valor de IBS/CBS nesse repasse? Deixe vazio se não.')
    if (retStr === null) return
    try {
      await api.post(`/admin/assessores/comissoes/${c.id}/pagar`, {
        observacaoPagamento: obs || undefined,
        valorRetencaoFiscal: retStr.trim() ? Number(retStr.replace(',', '.')) : undefined,
      })
      avisar('Comissão marcada como paga.')
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>💸 Comissões de indicação (Corretores de Moda)</h2>
      <div className="linha-campos" style={{ marginBottom: 10 }}>
        <div className="campo" style={{ maxWidth: 200 }}>
          <label>Status</label>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
            <option value="PENDENTE">Pendentes</option>
            <option value="PAGA">Pagas</option>
            <option value="">Todas</option>
          </select>
        </div>
      </div>
      <table>
        <thead><tr><th>Corretora</th><th>Lojista indicado</th><th>Ciclo</th><th>Base</th><th>%</th><th>Comissão</th><th>Retenção fiscal</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {comissoes.map((c) => (
            <tr key={c.id}>
              <td>{c.assessorNome} <span style={{ color: 'var(--ink-soft)' }}>({c.assessorSlug}.zaieze.com)</span></td>
              <td>{c.redeNome}</td>
              <td>{fmtData(c.cicloEm)}</td>
              <td>{formataReal(c.valorBaseAssinatura)}</td>
              <td>{c.percentualComissao}%</td>
              <td><strong>{formataReal(c.valorComissao)}</strong></td>
              <td>{c.valorRetencaoFiscal != null ? formataReal(c.valorRetencaoFiscal) : <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
              <td><span className={`selo ${c.status === 'PAGA' ? 'ok' : 'ATACADO'}`}>{c.status}</span></td>
              <td>{c.status === 'PENDENTE' && <a href="#" onClick={(e) => { e.preventDefault(); marcarPaga(c) }}>marcar paga</a>}</td>
            </tr>
          ))}
          {comissoes.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--ink-soft)' }}>Nenhuma comissão aqui.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface Campanha {
  id: string
  nome: string
  segmentoAlvo: string | null
  mensagemTemplate: string
  enviados: number
  simulados: number
  falhas: number
  semConsentimento: number
  createdAt: string
  criadaPor: { nome: string }
}
interface Regua { id: string; dias: number; mensagemTemplate: string; ativa: boolean }
interface ResumoCampanhas {
  campanhas: number; enviadas: number; simuladas: number; falhas: number; semLgpd: number; alcance: number
  porVendedora: { nome: string; campanhas: number; enviadas: number; alcance: number }[]
}
interface Modelo {
  id: string; nome: string; mensagemTemplate: string; segmentoAlvo: string | null; imagemUrl: string | null
  ativa: boolean; criadaPor: string; createdAt: string
  resultado?: { disparos: number; enviadas: number; simuladas: number; falhas: number; semLgpd: number; alcance: number }
}

const SEGMENTOS = ['', 'NOVO', 'FREQUENTE', 'VIP', 'INATIVO', 'ATACADO']

export default function Campanhas() {
  const usuario = usuarioLogado()!
  const gerente = usuario.role !== 'VENDEDORA'
  const ehGestor = usuario.role === 'GESTOR' || usuario.role === 'SUPER_ADMIN'
  const podeDisparar = usuario.role === 'VENDEDORA' || usuario.role === 'GERENTE'
  const escopo = useLojaAtiva()

  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [resumo, setResumo] = useState<ResumoCampanhas | null>(null)
  const [reguas, setReguas] = useState<Regua[]>([])

  // Catálogo de campanhas da marca
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [mNome, setMNome] = useState('')
  const [mMsg, setMMsg] = useState('')
  const [mTemplateId, setMTemplateId] = useState('')
  const [templates, setTemplates] = useState<{ id: string; nome: string; corpo: string; status: string }[]>([])
  const [mSeg, setMSeg] = useState('')
  const [mImg, setMImg] = useState('')
  const [mSalvando, setMSalvando] = useState(false)
  const [dispSeg, setDispSeg] = useState<Record<string, string>>({})
  const [nome, setNome] = useState('Novidades da semana')
  const [segmento, setSegmento] = useState('')
  const [template, setTemplate] = useState('Oi {primeiroNome}! 😍 Chegaram novidades na {loja} pensando em você. Quer ver? — {vendedora}')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [sugerindo, setSugerindo] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [disparoTravado, setDisparoTravado] = useState(false)

  // Texto padrão do disparo definido pelo gestor (marca). Trava a vendedora quando não pode editar.
  useEffect(() => {
    api.get('/marca').then(({ data }) => {
      if (data?.textoDisparoPadrao) setTemplate(data.textoDisparoPadrao)
      setDisparoTravado(!gerente && data?.disparoVendedoraEditavel === false)
    }).catch(() => { /* sem marca/permite editar */ })
  }, [gerente])

  // Templates HSM aprovados (só o gestor monta as campanhas da marca com template).
  useEffect(() => {
    if (!ehGestor) return
    api.get('/whatsapp/templates').then(({ data }) => setTemplates(data.filter((t: { status: string }) => t.status === 'APROVADO'))).catch(() => {})
  }, [ehGestor])

  function escolherTemplate(id: string) {
    setMTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (t) setMMsg(t.corpo)
  }

  // A conexão do WhatsApp passou a ser por MARCA (número oficial da Meta), configurada pelo
  // gestor em "WhatsApp oficial". Não há mais conexão por QR por vendedora.

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const reqs: Promise<unknown>[] = [api.get('/campanhas', { params: escopo.params }).then(({ data }) => setCampanhas(data))]
    if (gerente) reqs.push(api.get('/reguas', { params: escopo.params }).then(({ data }) => setReguas(data)))
    if (gerente) reqs.push(api.get('/campanhas/resumo', { params: escopo.params }).then(({ data }) => setResumo(data)).catch(() => {}))
    reqs.push(api.get('/campanhas/modelos', { params: escopo.params }).then(({ data }) => setModelos(data)).catch(() => {}))
    await Promise.all(reqs)
  }, [escopo.pronto, escopo.params, gerente])

  useEffect(() => { carregar() }, [carregar])

  async function sugerir() {
    setSugerindo(true); setErro('')
    try {
      const { data } = await api.post('/campanhas/sugerir', { segmento: segmento || undefined }, { params: escopo.params })
      setTemplate(data.texto)
      setAviso(data.viaIa ? 'Mensagem gerada pela IA. ✨' : 'Mensagem-modelo (configure ANTHROPIC_API_KEY para usar a IA).')
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSugerindo(false)
    }
  }

  async function enviar() {
    setEnviando(true); setErro(''); setAviso('')
    try {
      const { data } = await api.post('/campanhas', { nome, segmento: segmento || undefined, mensagemTemplate: template }, { params: escopo.params })
      const partes = [`${data.enviados} enviada(s)`, data.simulados ? `${data.simulados} simulada(s)` : '', data.falhas ? `${data.falhas} falha(s)` : '', data.semConsentimento ? `${data.semConsentimento} sem consentimento LGPD` : '']
      setAviso(`Campanha disparada para ${data.alcance} cliente(s): ${partes.filter(Boolean).join(' · ')}.`)
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  // ── Catálogo de campanhas da marca ──
  async function criarModelo(e: React.FormEvent) {
    e.preventDefault()
    setMSalvando(true); setErro(''); setAviso('')
    try {
      await api.post('/campanhas/modelos', { nome: mNome, mensagemTemplate: mMsg, segmento: mSeg || null, imagemUrl: mImg || null, templateId: mTemplateId || null }, { params: escopo.params })
      setMNome(''); setMMsg(''); setMSeg(''); setMImg(''); setMTemplateId('')
      setAviso('Campanha da marca publicada — já disponível para as vendedoras.')
      carregar()
    } catch (e2) { setErro(mensagemDeErro(e2)) } finally { setMSalvando(false) }
  }
  async function enviarImagemModelo(arquivo: File) {
    setErro('')
    try {
      const fd = new FormData(); fd.append('file', arquivo)
      const { data } = await api.post('/midia/imagem', fd, { params: escopo.params })
      setMImg(data.url)
    } catch (e2) { setErro(mensagemDeErro(e2)) }
  }
  async function alternarModelo(m: Modelo) {
    try { await api.patch(`/campanhas/modelos/${m.id}`, { ativa: !m.ativa }, { params: escopo.params }); carregar() }
    catch (e2) { setErro(mensagemDeErro(e2)) }
  }
  async function excluirModelo(id: string) {
    if (!confirm('Excluir esta campanha da marca? Os disparos já feitos são mantidos no histórico.')) return
    try { await api.delete(`/campanhas/modelos/${id}`, { params: escopo.params }); carregar() }
    catch (e2) { setErro(mensagemDeErro(e2)) }
  }
  async function dispararModelo(m: Modelo) {
    setEnviando(true); setErro(''); setAviso('')
    try {
      const seg = dispSeg[m.id] || undefined
      const { data } = await api.post(`/campanhas/modelos/${m.id}/disparar`, { segmento: seg }, { params: escopo.params })
      const partes = [`${data.enviados} enviada(s)`, data.simulados ? `${data.simulados} simulada(s)` : '', data.falhas ? `${data.falhas} falha(s)` : '', data.semConsentimento ? `${data.semConsentimento} sem LGPD` : '']
      setAviso(`"${m.nome}" disparada para ${data.alcance} cliente(s): ${partes.filter(Boolean).join(' · ')}.`)
      carregar()
    } catch (e2) { setErro(mensagemDeErro(e2)) } finally { setEnviando(false) }
  }

  async function processarReguas() {
    setProcessando(true); setErro(''); setAviso('')
    try {
      const { data } = await api.post('/reguas/processar', {}, { params: escopo.params })
      const total = (data.reguas as { enviados: number; simulados: number; alcance: number }[]).reduce(
        (a, r) => ({ alcance: a.alcance + r.alcance, enviados: a.enviados + r.enviados, simulados: a.simulados + r.simulados }),
        { alcance: 0, enviados: 0, simulados: 0 },
      )
      setAviso(`Réguas processadas: ${total.alcance} cliente(s) alcançado(s) (${total.enviados} enviadas, ${total.simulados} simuladas).`)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <>
      <header>
        <h1>WhatsApp & Campanhas</h1>
        <SeletorLoja escopo={escopo} />
      </header>

      {aviso && <div className="sucesso">{aviso}</div>}
      {erro && <div className="alerta">{erro}</div>}

      {/* Conexão agora é por MARCA (WhatsApp oficial da Meta), configurada pelo gestor. */}
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        📱 <strong>WhatsApp oficial da marca:</strong> o envio e o recebimento usam o <strong>número oficial da marca</strong> (WhatsApp Cloud API da Meta).
        {ehGestor
          ? <> Configure em <strong>WhatsApp oficial</strong> no menu.</>
          : <> Peça ao gestor para conectar o número da marca em “WhatsApp oficial”.</>}
      </div>

      {/* Campanhas da marca — o gestor monta e disponibiliza */}
      {ehGestor && (
        <div className="cartao">
          <h2 className="painel-titulo">Campanhas da marca</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
            Monte a campanha uma vez e disponibilize para as vendedoras dispararem na carteira delas. O resultado de todos os disparos aparece consolidado aqui.
          </p>
          <form onSubmit={criarModelo} style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
            <div className="campo"><label>Nome da campanha</label><input value={mNome} onChange={(e) => setMNome(e.target.value)} required placeholder="Ex.: Liquida de inverno" /></div>
            <div className="campo"><label>Segmento sugerido</label>
              <select value={mSeg} onChange={(e) => setMSeg(e.target.value)}>
                {SEGMENTOS.map((s) => <option key={s} value={s}>{s || 'Carteira toda'}</option>)}
              </select>
            </div>
            <div className="campo"><label>Template aprovado</label>
              <select value={mTemplateId} onChange={(e) => escolherTemplate(e.target.value)}>
                <option value="">— sem template (texto livre, só dentro da janela de 24h) —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              <small style={{ color: 'var(--ink-soft)' }}>Crie templates em “WhatsApp oficial”. Fora da janela de 24h a Meta só entrega via template aprovado.</small>
            </div>
            <div className="campo"><label>Mensagem</label><textarea value={mMsg} onChange={(e) => setMMsg(e.target.value)} required rows={4} readOnly={!!mTemplateId} placeholder="Use {primeiroNome}, {loja}, {link}…" /></div>
            <div className="campo"><label>Banner (opcional)</label>
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarImagemModelo(f); e.target.value = '' }} />
              {mImg && <img src={mImg} alt="" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8, display: 'block' }} />}
              <small style={{ color: 'var(--ink-soft)' }}>A imagem aparece para a vendedora; o envio do banner pelo WhatsApp entra na migração oficial.</small>
            </div>
            <div className="acoes"><button className="btn" disabled={mSalvando}>{mSalvando ? 'Publicando…' : '➕ Publicar campanha'}</button></div>
          </form>

          {modelos.length > 0 && (
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>Campanha</th><th>Segmento</th><th>Status</th><th>Resultado</th><th></th></tr></thead>
              <tbody>
                {modelos.map((m) => (
                  <tr key={m.id}>
                    <td>{m.nome}</td>
                    <td>{m.segmentoAlvo ? <span className={`selo ${m.segmentoAlvo}`}>{m.segmentoAlvo}</span> : 'Carteira toda'}</td>
                    <td>{m.ativa ? <span className="selo ok">disponível</span> : <span className="selo baixo">pausada</span>}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{m.resultado ? `${m.resultado.disparos} disparo(s) · ${m.resultado.alcance} alcance · ${m.resultado.enviadas} enviadas` : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn secundario" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => alternarModelo(m)}>{m.ativa ? 'Pausar' : 'Ativar'}</button>{' '}
                      <button className="btn secundario" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => excluirModelo(m.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Campanhas disponíveis — a vendedora/gerente dispara com 1 clique */}
      {podeDisparar && modelos.length > 0 && (
        <div className="cartao">
          <h2 className="painel-titulo">Campanhas disponíveis</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>Campanhas da marca prontas — dispare para a sua carteira com 1 clique.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {modelos.map((m) => (
              <div key={m.id} className="cartao" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {m.imagemUrl && <img src={m.imagemUrl} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8 }} />}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong>{m.nome}</strong>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{m.mensagemTemplate}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={dispSeg[m.id] ?? (m.segmentoAlvo ?? '')} onChange={(e) => setDispSeg((s) => ({ ...s, [m.id]: e.target.value }))}>
                    {SEGMENTOS.map((s) => <option key={s} value={s}>{s || 'Carteira toda'}</option>)}
                  </select>
                  <button className="btn" disabled={enviando} onClick={() => dispararModelo(m)}>📲 Disparar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grade-paineis">
        {/* Disparo de campanha */}
        <div className="cartao">
          <h2 className="painel-titulo">Disparo personalizado</h2>
          <div className="linha-campos">
            <div className="campo">
              <label>Nome da campanha</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="campo">
              <label>Público (classificação)</label>
              <select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
                {SEGMENTOS.map((s) => <option key={s} value={s}>{s || (gerente ? 'Toda a carteira' : 'Minha carteira')}</option>)}
              </select>
            </div>
          </div>
          <div className="campo">
            <label>
              Mensagem{' '}
              {!disparoTravado && (
                <button type="button" className="btn-link" onClick={sugerir} disabled={sugerindo || !escopo.pronto}>
                  {sugerindo ? 'gerando…' : '✨ sugerir com IA'}
                </button>
              )}
            </label>
            <textarea rows={4} value={template} onChange={(e) => setTemplate(e.target.value)} disabled={disparoTravado} />
            {disparoTravado ? (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                🔒 Texto definido pelo gestor — não editável.
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                Variáveis: {'{primeiroNome}'} {'{nome}'} {'{loja}'} {'{vendedora}'} {'{diasSemCompra}'} {'{totalGasto}'} {'{link}'}
                <br />O link do catálogo da vendedora é incluído automaticamente; use {'{link}'} para posicioná-lo no texto.
              </div>
            )}
          </div>
          <button className="btn" onClick={enviar} disabled={enviando || !escopo.pronto}>
            {enviando ? 'Disparando…' : '📲 Enviar campanha'}
          </button>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            Só envia para clientes com consentimento LGPD, roteando pela vendedora dona de cada cliente.
          </p>
        </div>

        {/* Réguas de inatividade */}
        {gerente && (
          <div className="cartao">
            <h2 className="painel-titulo">Réguas de recuperação de inativos</h2>
            <table>
              <thead><tr><th>Janela</th><th>Mensagem</th><th>Status</th></tr></thead>
              <tbody>
                {reguas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.dias} dias</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{r.mensagemTemplate.slice(0, 60)}…</td>
                    <td><span className={`selo ${r.ativa ? 'ok' : 'baixo'}`}>{r.ativa ? 'Ativa' : 'Inativa'}</span></td>
                  </tr>
                ))}
                {reguas.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>Nenhuma régua configurada.</td></tr>}
              </tbody>
            </table>
            <button className="btn secundario" onClick={processarReguas} disabled={processando || !escopo.pronto} style={{ marginTop: 12 }}>
              {processando ? 'Processando…' : '🔁 Processar réguas agora'}
            </button>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
              Dispara automaticamente para clientes na janela de inatividade. (Em produção, roda como job diário.)
            </p>
          </div>
        )}
      </div>

      {/* Painel de resultados (gestor / gerente) */}
      {gerente && resumo && resumo.campanhas > 0 && (
        <div className="cartao cr-banner">
          <h2 className="painel-titulo">📊 Resultados das campanhas</h2>
          <div className="cr-kpis">
            <div className="cr-kpi"><span>Campanhas</span><strong>{resumo.campanhas}</strong></div>
            <div className="cr-kpi destaque"><span>Público alcançado</span><strong>{resumo.alcance}</strong></div>
            <div className="cr-kpi"><span>Enviadas</span><strong>{resumo.enviadas}</strong></div>
            <div className="cr-kpi"><span>Simuladas</span><strong>{resumo.simuladas}</strong></div>
            <div className="cr-kpi"><span>Falhas</span><strong>{resumo.falhas}</strong></div>
            <div className="cr-kpi"><span>Sem LGPD</span><strong>{resumo.semLgpd}</strong></div>
          </div>
          {resumo.porVendedora.length > 0 && (
            <table style={{ marginTop: 14 }}>
              <thead><tr><th>Por vendedora</th><th>Campanhas</th><th>Enviadas</th><th>Alcance</th></tr></thead>
              <tbody>
                {resumo.porVendedora.map((v, i) => (
                  <tr key={i}><td>{v.nome}</td><td>{v.campanhas}</td><td>{v.enviadas}</td><td>{v.alcance}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Histórico de campanhas */}
      <div className="cartao">
        <h2 className="painel-titulo">Campanhas recentes</h2>
        <table>
          <thead><tr><th>Data</th><th>Campanha</th><th>Público</th><th>Por</th><th>Resultado</th></tr></thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                <td>{c.nome}</td>
                <td>{c.segmentoAlvo ? <span className={`selo ${c.segmentoAlvo}`}>{c.segmentoAlvo}</span> : '—'}</td>
                <td>{c.criadaPor.nome}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {c.enviados} enviadas{c.simulados ? ` · ${c.simulados} simuladas` : ''}{c.semConsentimento ? ` · ${c.semConsentimento} s/ LGPD` : ''}
                </td>
              </tr>
            ))}
            {campanhas.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>Nenhuma campanha ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'

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
  const { t } = useIdioma()

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
  const avisar = useToast()
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
    setSugerindo(true)
    try {
      const { data } = await api.post('/campanhas/sugerir', { segmento: segmento || undefined }, { params: escopo.params })
      setTemplate(data.texto)
      avisar(data.viaIa ? t('camp.mensagemGeradaIa') : t('camp.mensagemModeloFallback'))
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro')
    } finally {
      setSugerindo(false)
    }
  }

  async function enviar() {
    setEnviando(true)
    try {
      const { data } = await api.post('/campanhas', { nome, segmento: segmento || undefined, mensagemTemplate: template }, { params: escopo.params })
      const partes = [t('camp.parteEnviadas', { n: data.enviados }), data.simulados ? t('camp.parteSimuladas', { n: data.simulados }) : '', data.falhas ? t('camp.parteFalhas', { n: data.falhas }) : '', data.semConsentimento ? t('camp.parteSemConsentimento', { n: data.semConsentimento }) : '']
      avisar(t('camp.campanhaDisparadaSucesso', { alcance: data.alcance, partes: partes.filter(Boolean).join(' · ') }))
      carregar()
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro')
    } finally {
      setEnviando(false)
    }
  }

  // ── Catálogo de campanhas da marca ──
  async function criarModelo(e: React.FormEvent) {
    e.preventDefault()
    setMSalvando(true)
    try {
      await api.post('/campanhas/modelos', { nome: mNome, mensagemTemplate: mMsg, segmento: mSeg || null, imagemUrl: mImg || null, templateId: mTemplateId || null }, { params: escopo.params })
      setMNome(''); setMMsg(''); setMSeg(''); setMImg(''); setMTemplateId('')
      avisar(t('camp.campanhaPublicadaSucesso'))
      carregar()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setMSalvando(false) }
  }
  async function enviarImagemModelo(arquivo: File) {
    try {
      const fd = new FormData(); fd.append('file', arquivo)
      const { data } = await api.post('/midia/imagem', fd, { params: escopo.params })
      setMImg(data.url)
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') }
  }
  async function alternarModelo(m: Modelo) {
    try { await api.patch(`/campanhas/modelos/${m.id}`, { ativa: !m.ativa }, { params: escopo.params }); carregar() }
    catch (e2) { avisar(mensagemDeErro(e2), 'erro') }
  }
  async function excluirModelo(id: string) {
    if (!confirm(t('camp.confirmExcluirModelo'))) return
    try { await api.delete(`/campanhas/modelos/${id}`, { params: escopo.params }); carregar() }
    catch (e2) { avisar(mensagemDeErro(e2), 'erro') }
  }
  async function dispararModelo(m: Modelo) {
    setEnviando(true)
    try {
      const seg = dispSeg[m.id] || undefined
      const { data } = await api.post(`/campanhas/modelos/${m.id}/disparar`, { segmento: seg }, { params: escopo.params })
      const partes = [t('camp.parteEnviadas', { n: data.enviados }), data.simulados ? t('camp.parteSimuladas', { n: data.simulados }) : '', data.falhas ? t('camp.parteFalhas', { n: data.falhas }) : '', data.semConsentimento ? t('camp.parteSemLgpdModelo', { n: data.semConsentimento }) : '']
      avisar(t('camp.dispararSucesso', { nome: m.nome, alcance: data.alcance, partes: partes.filter(Boolean).join(' · ') }))
      carregar()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setEnviando(false) }
  }

  async function processarReguas() {
    setProcessando(true)
    try {
      const { data } = await api.post('/reguas/processar', {}, { params: escopo.params })
      const total = (data.reguas as { enviados: number; simulados: number; alcance: number }[]).reduce(
        (a, r) => ({ alcance: a.alcance + r.alcance, enviados: a.enviados + r.enviados, simulados: a.simulados + r.simulados }),
        { alcance: 0, enviados: 0, simulados: 0 },
      )
      avisar(t('camp.reguasProcessadasSucesso', { alcance: total.alcance, enviados: total.enviados, simulados: total.simulados }))
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro')
    } finally {
      setProcessando(false)
    }
  }

  return (
    <>
      <header>
        <h1>{t('camp.titulo')}</h1>
        <SeletorLoja escopo={escopo} />
      </header>


      {/* Conexão oficial por MARCA (WhatsApp Cloud API da Meta), configurada pelo gestor. */}
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        📱 <strong>{t('camp.oficialTitulo')}</strong> {t('camp.oficialDescricao')} <strong>{t('camp.numeroOficial')}</strong> {t('camp.oficialCloudApi')}
        {ehGestor
          ? <> {t('camp.oficialGestorTexto1')} <strong>{t('camp.oficialGestorDestaque')}</strong> {t('camp.oficialGestorTexto2')}</>
          : <> {t('camp.oficialVendedoraTexto')}</>}
      </div>

      {/* Conexão alternativa por QR Code, individual — só a própria vendedora conecta o WhatsApp pessoal dela. */}
      {!gerente && <MeuWhatsAppPessoal />}

      {/* Campanhas da marca — o gestor monta e disponibiliza */}
      {ehGestor && (
        <div className="cartao">
          <h2 className="painel-titulo">{t('camp.campanhasMarcaTitulo')}</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
            {t('camp.campanhasMarcaExplicacao')}
          </p>
          <form onSubmit={criarModelo} style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
            <div className="campo"><label>{t('camp.nomeCampanhaLabel')}</label><input value={mNome} onChange={(e) => setMNome(e.target.value)} required placeholder={t('camp.nomeCampanhaPlaceholder')} /></div>
            <div className="campo"><label>{t('camp.segmentoSugeridoLabel')}</label>
              <select value={mSeg} onChange={(e) => setMSeg(e.target.value)}>
                {SEGMENTOS.map((s) => <option key={s} value={s}>{s ? t(`segmento.${s}`) : t('camp.carteiraToda')}</option>)}
              </select>
            </div>
            <div className="campo"><label>{t('camp.templateAprovadoLabel')}</label>
              <select value={mTemplateId} onChange={(e) => escolherTemplate(e.target.value)}>
                <option value="">{t('camp.semTemplateOpt')}</option>
                {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.nome}</option>)}
              </select>
              <small style={{ color: 'var(--ink-soft)' }}>{t('camp.crieTemplatesAviso')}</small>
            </div>
            <div className="campo"><label>{t('camp.mensagemLabel')}</label><textarea value={mMsg} onChange={(e) => setMMsg(e.target.value)} required rows={4} readOnly={!!mTemplateId} placeholder={t('camp.mensagemPlaceholder')} /></div>
            <div className="campo"><label>{t('camp.bannerLabel')}</label>
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarImagemModelo(f); e.target.value = '' }} />
              {mImg && <img src={mImg} alt="" style={{ marginTop: 8, maxHeight: 120, borderRadius: 8, display: 'block' }} />}
              <small style={{ color: 'var(--ink-soft)' }}>{t('camp.bannerAviso')}</small>
            </div>
            <div className="acoes"><button className="btn" disabled={mSalvando}>{mSalvando ? t('camp.publicando') : t('camp.publicarCampanha')}</button></div>
          </form>

          {modelos.length > 0 && (
            <table style={{ marginTop: 16 }}>
              <thead><tr><th>{t('camp.colCampanha')}</th><th>{t('camp.colSegmento')}</th><th>{t('camp.colStatus')}</th><th>{t('camp.colResultado')}</th><th></th></tr></thead>
              <tbody>
                {modelos.map((m) => (
                  <tr key={m.id}>
                    <td>{m.nome}</td>
                    <td>{m.segmentoAlvo ? <span className={`selo ${m.segmentoAlvo}`}>{t(`segmento.${m.segmentoAlvo}`)}</span> : t('camp.carteiraToda')}</td>
                    <td>{m.ativa ? <span className="selo ok">{t('camp.disponivel')}</span> : <span className="selo baixo">{t('camp.pausada')}</span>}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{m.resultado ? t('camp.resultadoResumo', { disparos: m.resultado.disparos, alcance: m.resultado.alcance, enviadas: m.resultado.enviadas }) : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn secundario" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => alternarModelo(m)}>{m.ativa ? t('camp.pausar') : t('camp.ativar')}</button>{' '}
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
          <h2 className="painel-titulo">{t('camp.disponiveisTitulo')}</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>{t('camp.disponiveisExplicacao')}</p>
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
                    {SEGMENTOS.map((s) => <option key={s} value={s}>{s ? t(`segmento.${s}`) : t('camp.carteiraToda')}</option>)}
                  </select>
                  <button className="btn" disabled={enviando} onClick={() => dispararModelo(m)}>{t('camp.disparar')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grade-paineis">
        {/* Disparo de campanha */}
        <div className="cartao">
          <h2 className="painel-titulo">{t('camp.disparoPersonalizadoTitulo')}</h2>
          <div className="linha-campos">
            <div className="campo">
              <label>{t('camp.nomeCampanhaLabel')}</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="campo">
              <label>{t('camp.publicoLabel')}</label>
              <select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
                {SEGMENTOS.map((s) => <option key={s} value={s}>{s ? t(`segmento.${s}`) : (gerente ? t('camp.todaCarteira') : t('camp.minhaCarteira'))}</option>)}
              </select>
            </div>
          </div>
          <div className="campo">
            <label>
              {t('camp.mensagemLabel')}{' '}
              {!disparoTravado && (
                <button type="button" className="btn-link" onClick={sugerir} disabled={sugerindo || !escopo.pronto}>
                  {sugerindo ? t('camp.gerando') : t('camp.sugerirComIa')}
                </button>
              )}
            </label>
            <textarea rows={4} value={template} onChange={(e) => setTemplate(e.target.value)} disabled={disparoTravado} />
            {disparoTravado ? (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                {t('camp.textoTravado')}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                {t('camp.variaveisLabel')} {'{primeiroNome}'} {'{nome}'} {'{loja}'} {'{vendedora}'} {'{diasSemCompra}'} {'{totalGasto}'} {'{link}'}
                <br />{t('camp.linkAutoTexto')}
              </div>
            )}
          </div>
          <button className="btn" onClick={enviar} disabled={enviando || !escopo.pronto}>
            {enviando ? t('camp.disparando') : t('camp.enviarCampanha')}
          </button>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            {t('camp.consentimentoAviso')}
          </p>
        </div>

        {/* Réguas de inatividade */}
        {gerente && (
          <div className="cartao">
            <h2 className="painel-titulo">{t('camp.reguasTitulo')}</h2>
            <table>
              <thead><tr><th>{t('camp.colJanela')}</th><th>{t('camp.colMensagem')}</th><th>{t('camp.colStatus')}</th></tr></thead>
              <tbody>
                {reguas.map((r) => (
                  <tr key={r.id}>
                    <td>{t('camp.diasSufixo', { n: r.dias })}</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{r.mensagemTemplate.slice(0, 60)}…</td>
                    <td><span className={`selo ${r.ativa ? 'ok' : 'baixo'}`}>{r.ativa ? t('camp.ativa') : t('camp.inativa')}</span></td>
                  </tr>
                ))}
                {reguas.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>{t('camp.nenhumaRegua')}</td></tr>}
              </tbody>
            </table>
            <button className="btn secundario" onClick={processarReguas} disabled={processando || !escopo.pronto} style={{ marginTop: 12 }}>
              {processando ? t('camp.processando') : t('camp.processarAgora')}
            </button>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
              {t('camp.reguasExplicacao')}
            </p>
          </div>
        )}
      </div>

      {/* Painel de resultados (gestor / gerente) */}
      {gerente && resumo && resumo.campanhas > 0 && (
        <div className="cartao cr-banner">
          <h2 className="painel-titulo">{t('camp.resultadosTitulo')}</h2>
          <div className="cr-kpis">
            <div className="cr-kpi"><span>{t('camp.kpiCampanhas')}</span><strong>{resumo.campanhas}</strong></div>
            <div className="cr-kpi destaque"><span>{t('camp.kpiPublicoAlcancado')}</span><strong>{resumo.alcance}</strong></div>
            <div className="cr-kpi"><span>{t('camp.kpiEnviadas')}</span><strong>{resumo.enviadas}</strong></div>
            <div className="cr-kpi"><span>{t('camp.kpiSimuladas')}</span><strong>{resumo.simuladas}</strong></div>
            <div className="cr-kpi"><span>{t('camp.kpiFalhas')}</span><strong>{resumo.falhas}</strong></div>
            <div className="cr-kpi"><span>{t('camp.kpiSemLgpd')}</span><strong>{resumo.semLgpd}</strong></div>
          </div>
          {resumo.porVendedora.length > 0 && (
            <table style={{ marginTop: 14 }}>
              <thead><tr><th>{t('camp.porVendedoraTitulo')}</th><th>{t('camp.kpiCampanhas')}</th><th>{t('camp.kpiEnviadas')}</th><th>{t('camp.kpiPublicoAlcancado')}</th></tr></thead>
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
        <h2 className="painel-titulo">{t('camp.recentesTitulo')}</h2>
        <table>
          <thead><tr><th>{t('camp.colData')}</th><th>{t('camp.colCampanha')}</th><th>{t('camp.colPublico')}</th><th>{t('camp.colPor')}</th><th>{t('camp.colResultado')}</th></tr></thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                <td>{c.nome}</td>
                <td>{c.segmentoAlvo ? <span className={`selo ${c.segmentoAlvo}`}>{t(`segmento.${c.segmentoAlvo}`)}</span> : '—'}</td>
                <td>{c.criadaPor.nome}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {t('camp.enviadasSufixo', { n: c.enviados })}{c.simulados ? ` · ${t('camp.simuladasSufixo', { n: c.simulados })}` : ''}{c.semConsentimento ? ` · ${t('camp.semLgpdCurto', { n: c.semConsentimento })}` : ''}
                </td>
              </tr>
            ))}
            {campanhas.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>{t('camp.nenhumaCampanha')}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Meu WhatsApp (QR Code) — conexão pessoal da vendedora, alternativa ao número da marca ──
interface StatusPessoal { conectado: boolean; conectadoEm: string | null; numero: string | null }

function MeuWhatsAppPessoal() {
  const { t } = useIdioma()
  const avisar = useToast()
  const [status, setStatus] = useState<StatusPessoal | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregarStatus = useCallback(() => {
    api.get('/whatsapp/pessoal/status').then(({ data }) => setStatus(data)).catch(() => {})
  }, [])

  useEffect(() => { carregarStatus() }, [carregarStatus])

  // Enquanto o QR está exibido, faz polling do status até a vendedora escanear (ou desistir).
  useEffect(() => {
    if (!qrCode) return
    let tentativas = 0
    const id = setInterval(() => {
      tentativas += 1
      api.get('/whatsapp/pessoal/status').then(({ data }) => {
        setStatus(data)
        if (data.conectado) { setQrCode(null); clearInterval(id) }
        else if (tentativas >= 20) { setQrCode(null); clearInterval(id); avisar(t('camp.pessoalTimeout')) }
      }).catch(() => {})
    }, 3000)
    return () => clearInterval(id)
  }, [qrCode, avisar, t])

  async function conectar() {
    setOcupado(true)
    try {
      const { data } = await api.post('/whatsapp/pessoal/conectar')
      if (data.qrCode) setQrCode(data.qrCode)
      else if (data.conectado) { setQrCode(null); carregarStatus() }
      else avisar(t('camp.pessoalErro'), 'erro')
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
    finally { setOcupado(false) }
  }

  async function desconectar() {
    setOcupado(true)
    try { await api.post('/whatsapp/pessoal/desconectar'); setQrCode(null); await conectar() }
    catch (e) { avisar(mensagemDeErro(e), 'erro') }
    finally { setOcupado(false) }
  }

  return (
    <div className="cartao">
      <h2 className="painel-titulo">
        {t('camp.pessoalTitulo')} {status?.conectado
          ? <span style={{ color: 'var(--ok)', fontSize: 13 }}>{t('camp.pessoalConectado')}{status.numero ? ` · ${status.numero}` : ''}</span>
          : <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('camp.pessoalNaoConectado')}</span>}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>{t('camp.pessoalDescricao')}</p>

      {qrCode && (
        <div style={{ textAlign: 'center', margin: '12px 0' }}>
          <p style={{ fontSize: 13 }}>{t('camp.pessoalEscaneie')}</p>
          <img src={qrCode} alt="QR Code" style={{ width: 220, height: 220 }} />
        </div>
      )}

      {!status?.conectado && !qrCode && (
        <button type="button" className="btn" disabled={ocupado} onClick={conectar}>
          {ocupado ? t('camp.pessoalGerandoQr') : t('camp.pessoalConectarBtn')}
        </button>
      )}
      {status?.conectado && (
        <button type="button" className="btn secundario" disabled={ocupado} onClick={desconectar}>
          {ocupado ? t('camp.pessoalDesconectando') : t('camp.pessoalTrocarNumeroBtn')}
        </button>
      )}
    </div>
  )
}

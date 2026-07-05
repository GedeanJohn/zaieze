import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'

interface Config {
  waPhoneNumberId: string | null
  waWabaId: string | null
  waNumeroExibicao: string | null
  waVerifyToken: string | null
  temToken: boolean
  temAppSecret: boolean
  conectado: boolean
  conectadoEm: string | null
  webhookUrl: string
  servidorPodeCifrar: boolean
}

export default function WhatsApp() {
  const { t } = useIdioma()
  const [cfg, setCfg] = useState<Config | null>(null)
  const avisar = useToast()
  const [salvando, setSalvando] = useState(false)

  // campos editáveis
  const [phoneId, setPhoneId] = useState('')
  const [wabaId, setWabaId] = useState('')
  const [numero, setNumero] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [token, setToken] = useState('') // só enviado quando preenchido
  const [appSecret, setAppSecret] = useState('')
  const [telTeste, setTelTeste] = useState('')
  const [testando, setTestando] = useState(false)

  function aplicar(c: Config) {
    setCfg(c)
    setPhoneId(c.waPhoneNumberId ?? '')
    setWabaId(c.waWabaId ?? '')
    setNumero(c.waNumeroExibicao ?? '')
    setVerifyToken(c.waVerifyToken ?? '')
    setToken('')
    setAppSecret('')
  }

  useEffect(() => { api.get('/whatsapp/config').then(({ data }) => aplicar(data)).catch((e) => avisar(mensagemDeErro(e), 'erro')) }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const { data } = await api.put('/whatsapp/config', {
        waPhoneNumberId: phoneId.trim(),
        waWabaId: wabaId.trim() || undefined,
        waNumeroExibicao: numero.trim() || undefined,
        waVerifyToken: verifyToken.trim(),
        waAppSecret: appSecret.trim() || undefined,
        token: token.trim() || undefined,
      })
      // recarrega para refletir conectado/temToken
      const { data: c } = await api.get('/whatsapp/config')
      aplicar(c)
      avisar(data.conectado ? t('wa.conectadoSucesso', { numero: data.numero ? `· ${data.numero}` : '' }) : t('wa.salvoNaoConfirmado', { erro: data.erro ?? t('wa.verifiqueNumeroToken') }))
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setSalvando(false) }
  }

  async function testar() {
    if (!telTeste.trim()) return
    setTestando(true)
    try {
      const { data } = await api.post('/whatsapp/testar', { telefone: telTeste.trim() })
      avisar(data.status === 'ENVIADA' ? t('wa.testeEnviado') : t('wa.testeStatus', { status: data.status }))
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setTestando(false) }
  }

  function copiar(txt: string) { navigator.clipboard?.writeText(txt).then(() => avisar(t('wa.copiado'))).catch(() => {}) }

  if (!cfg) return <p style={{ color: 'var(--ink-soft)' }}>{t('wa.carregando')}</p>

  return (
    <>
      <header><h1>{t('wa.titulo')}</h1></header>
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        {t('wa.explicacao1')} <strong>{t('wa.numeroOficialDestaque')}</strong> {t('wa.explicacao2')}
      </div>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>
          {t('wa.statusLabel')} {cfg.conectado
            ? <span style={{ color: 'var(--ok)' }}>{t('wa.conectado')}{cfg.waNumeroExibicao ? ` · ${cfg.waNumeroExibicao}` : ''}</span>
            : <span style={{ color: 'var(--ink-soft)' }}>{t('wa.naoConectado')}</span>}
        </h2>
        {!cfg.servidorPodeCifrar && (
          <div className="alerta">{t('wa.avisoSemSecret1')} <code>WA_TOKEN_SECRET</code> {t('wa.avisoSemSecret2')}</div>
        )}
      </div>

      <form className="cartao" onSubmit={salvar}>
        <h2 style={{ marginTop: 0 }}>{t('wa.credenciaisTitulo')}</h2>
        <div className="linha-campos">
          <div className="campo">
            <label>{t('wa.phoneNumberIdLabel')}</label>
            <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder={t('wa.phoneNumberIdPlaceholder')} required />
          </div>
          <div className="campo">
            <label>{t('wa.wabaIdLabel')}</label>
            <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder={t('wa.opcional')} />
          </div>
        </div>
        <div className="linha-campos">
          <div className="campo">
            <label>{t('wa.numeroExibicaoLabel')}</label>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder={t('wa.numeroExibicaoPlaceholder')} />
          </div>
          <div className="campo">
            <label>{t('wa.verifyTokenLabel')}</label>
            <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder={t('wa.verifyTokenPlaceholder')} required minLength={6} />
          </div>
        </div>
        <div className="linha-campos">
          <div className="campo">
            <label>{t('wa.tokenPermanenteLabel')} {cfg.temToken && <small style={{ color: 'var(--ok)' }}>{t('wa.salvoCheck')}</small>}</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.temToken ? t('wa.tokenPlaceholderSalvo') : t('wa.tokenPlaceholderNovo')} autoComplete="off" />
          </div>
          <div className="campo">
            <label>{t('wa.appSecretLabel')} {cfg.temAppSecret && <small style={{ color: 'var(--ok)' }}>{t('wa.salvoCheck')}</small>}</label>
            <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={t('wa.appSecretPlaceholder')} autoComplete="off" />
          </div>
        </div>
        <div className="acoes">
          <button className="btn" disabled={salvando}>{salvando ? t('wa.salvandoTestando') : t('wa.salvarETestar')}</button>
        </div>
      </form>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>{t('wa.webhookTitulo')}</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          {t('wa.webhookExplicacao1')} <strong>{t('wa.messagesDestaque')}</strong>{t('wa.webhookExplicacao2')}
        </p>
        <div className="campo">
          <label>{t('wa.callbackUrlLabel')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={cfg.webhookUrl} style={{ flex: 1 }} />
            <button type="button" className="btn secundario" onClick={() => copiar(cfg.webhookUrl)}>{t('wa.copiar')}</button>
          </div>
        </div>
        <div className="campo">
          <label>{t('wa.verifyTokenLabel2')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={verifyToken} style={{ flex: 1 }} />
            <button type="button" className="btn secundario" onClick={() => copiar(verifyToken)}>{t('wa.copiar')}</button>
          </div>
        </div>
      </div>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>{t('wa.enviarTesteTitulo')}</h2>
        <div className="linha-campos" style={{ alignItems: 'end' }}>
          <div className="campo">
            <label>{t('wa.numeroDdiLabel')}</label>
            <input value={telTeste} onChange={(e) => setTelTeste(e.target.value)} placeholder="5562999990000" />
          </div>
          <div><button type="button" className="btn" onClick={testar} disabled={testando || !cfg.conectado}>{testando ? t('wa.enviando') : t('wa.enviarTesteBtn')}</button></div>
        </div>
        {!cfg.conectado && <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>{t('wa.conecteAntesDeTestar')}</p>}
      </div>

      <TemplatesSection conectado={cfg.conectado} />
    </>
  )
}

// ── Templates HSM (mensagens aprovadas p/ campanhas fora da janela de 24h) ──
const PLACEHOLDERS = ['{primeiroNome}', '{nome}', '{loja}', '{vendedora}', '{link}', '{diasSemCompra}', '{totalGasto}', '{segmento}']
interface Template { id: string; nome: string; metaNome: string; categoria: string; corpo: string; status: string; motivoRejeicao: string | null }
const seloStatus: Record<string, string> = { APROVADO: 'ok', PENDENTE: 'ATACADO', REJEITADO: 'baixo', PAUSADO: 'baixo', RASCUNHO: 'ATACADO' }

function TemplatesSection({ conectado }: { conectado: boolean }) {
  const { t } = useIdioma()
  const [lista, setLista] = useState<Template[]>([])
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState('MARKETING')
  const [corpo, setCorpo] = useState('')
  const avisar = useToast()
  const [ocupado, setOcupado] = useState(false)

  function carregar() { api.get('/whatsapp/templates').then(({ data }) => setLista(data)).catch(() => {}) }
  useEffect(() => { carregar() }, [])

  async function sugerir() {
    try { const { data } = await api.post('/campanhas/sugerir', {}); setCorpo(data.texto) }
    catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }
  async function criar(e: React.FormEvent) {
    e.preventDefault(); setOcupado(true)
    try {
      await api.post('/whatsapp/templates', { nome, categoria, corpo })
      setNome(''); setCorpo(''); carregar()
      avisar(conectado ? t('wa.templateEnviadoMeta') : t('wa.templateCriadoSimulado'))
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setOcupado(false) }
  }
  async function sincronizar() {
    try { const { data } = await api.post('/whatsapp/templates/sync'); avisar(t('wa.sincronizadosMsg', { n: data.sincronizados })); carregar() }
    catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }
  async function remover(tpl: Template) {
    if (!window.confirm(t('wa.confirmExcluirTemplate', { nome: tpl.nome }))) return
    await api.delete(`/whatsapp/templates/${tpl.id}`).catch(() => {}); carregar()
  }

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>{t('wa.templatesTitulo')}</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        {t('wa.templatesExplicacao1')} <strong>{t('wa.foraJanelaDestaque')}</strong> {t('wa.templatesExplicacao2')} <strong>{t('wa.templateAprovadoDestaque')}</strong>
        {' '}{t('wa.templatesExplicacao3')}
        {!conectado && <> <em>{t('wa.semWabaAviso')}</em></>}
      </div>

      <form onSubmit={criar}>
        <div className="linha-campos">
          <div className="campo"><label>{t('wa.nomeTemplateLabel')}</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t('wa.nomeTemplatePlaceholder')} required minLength={2} /></div>
          <div className="campo"><label>{t('wa.categoriaLabel')}</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              <option value="MARKETING">{t('wa.marketing')}</option>
              <option value="UTILITY">{t('wa.utilidade')}</option>
            </select>
          </div>
        </div>
        <div className="campo">
          <label>{t('wa.corpoMensagemLabel')}</label>
          <textarea rows={3} value={corpo} onChange={(e) => setCorpo(e.target.value)} placeholder={t('wa.corpoMensagemPlaceholder')} required minLength={5} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
          {t('wa.placeholdersLabel')} {PLACEHOLDERS.map((p) => <code key={p} style={{ marginRight: 6 }}>{p}</code>)}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn secundario" onClick={sugerir}>{t('wa.sugerirComIa')}</button>
          <button className="btn" disabled={ocupado}>{ocupado ? t('wa.enviando') : t('wa.criarTemplate')}</button>
        </div>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>{t('wa.templatesCount', { n: lista.length })}</h3>
        <button type="button" className="btn secundario" onClick={sincronizar} disabled={!conectado} title={conectado ? '' : t('wa.conecteWaba')}>{t('wa.sincronizarStatus')}</button>
      </div>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>{t('wa.colNome')}</th><th>{t('wa.colCategoria')}</th><th>{t('wa.colStatus')}</th><th>{t('wa.colCorpo')}</th><th></th></tr></thead>
        <tbody>
          {lista.map((tpl) => (
            <tr key={tpl.id}>
              <td>{tpl.nome}<div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{tpl.metaNome}</div></td>
              <td>{tpl.categoria === 'MARKETING' ? t('wa.marketing') : t('wa.utilidade')}</td>
              <td><span className={`selo ${seloStatus[tpl.status] ?? 'ATACADO'}`}>{tpl.status}</span>{tpl.motivoRejeicao ? <div style={{ fontSize: 11, color: 'var(--erro, #c62828)' }}>{tpl.motivoRejeicao}</div> : null}</td>
              <td style={{ fontSize: 12, color: 'var(--ink-soft)', maxWidth: 320 }}>{tpl.corpo}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); remover(tpl) }}>{t('wa.excluir')}</a></td>
            </tr>
          ))}
          {lista.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>{t('wa.nenhumTemplate')}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

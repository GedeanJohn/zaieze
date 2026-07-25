import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'
import { carregarSdkMeta } from '../lib/metaSdk'
import ConectarMetaTudo from '../componentes/ConectarMetaTudo'

interface Config {
  igBusinessAccountId: string | null
  igPageId: string | null
  igUsername: string | null
  igVerifyToken: string | null
  temToken: boolean
  temAppSecret: boolean
  conectado: boolean
  conectadoEm: string | null
  webhookUrl: string
  servidorPodeCifrar: boolean
  conexaoAutomaticaDisponivel: boolean
  metaAppId: string | null
  metaConfigId: string | null
}

interface Candidato { pageId: string; pageNome: string; igBusinessAccountId: string; username?: string; pageToken: string }

// Conexão automática: FB.login comum (sem wizard/config_id — isso é específico do WhatsApp).
// Na maioria dos casos (1 Página com Instagram vinculado) conecta direto; se houver mais de uma,
// mostra a lista pra o gestor escolher.
function ConexaoAutomaticaSection({ appId, aoConectar }: { appId: string; aoConectar: () => Promise<void> }) {
  const { t } = useIdioma()
  const avisar = useToast()
  const [conectando, setConectando] = useState(false)
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null)

  useEffect(() => { carregarSdkMeta(appId) }, [appId])

  async function processarResposta(body: Record<string, unknown>) {
    const { data } = await api.post('/instagram/embedded-signup/callback', body)
    if (data.escolhaNecessaria) { setCandidatos(data.candidatos); return }
    setCandidatos(null)
    await aoConectar()
    avisar(data.conectado ? t('ig.conectadoSucesso', { username: data.username ? `· @${data.username}` : '' }) : t('ig.erroConexaoAutomatica'))
  }

  function conectar() {
    if (!window.FB) return
    setConectando(true)
    window.FB.login(
      async (resposta) => {
        const code = resposta?.authResponse?.code as string | undefined
        if (!code) { setConectando(false); return }
        try { await processarResposta({ code }) }
        catch (e) { avisar(mensagemDeErro(e), 'erro') }
        finally { setConectando(false) }
      },
      { scope: 'instagram_basic,instagram_manage_messages,pages_show_list', response_type: 'code', override_default_response_type: true },
    )
  }

  async function escolher(c: Candidato) {
    setConectando(true)
    try { await processarResposta({ escolha: { pageId: c.pageId, igBusinessAccountId: c.igBusinessAccountId, pageToken: c.pageToken } }) }
    catch (e) { avisar(mensagemDeErro(e), 'erro') }
    finally { setConectando(false) }
  }

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>{t('ig.conexaoAutomaticaTitulo')}</h2>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t('ig.conexaoAutomaticaExplicacao')}</p>
      {candidatos ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 13 }}>{t('ig.escolherPaginaExplicacao')}</p>
          {candidatos.map((c) => (
            <button key={c.pageId} type="button" className="btn secundario" disabled={conectando} onClick={() => escolher(c)}>
              {c.pageNome} {c.username ? `· @${c.username}` : ''}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="btn" disabled={conectando} onClick={conectar}>
          {conectando ? t('ig.conectandoAutomatico') : t('ig.conectarComFacebookBtn')}
        </button>
      )}
    </div>
  )
}

export default function Instagram() {
  const { t } = useIdioma()
  const [cfg, setCfg] = useState<Config | null>(null)
  const avisar = useToast()
  const [salvando, setSalvando] = useState(false)
  const [testando, setTestando] = useState(false)

  // campos editáveis
  const [businessId, setBusinessId] = useState('')
  const [pageId, setPageId] = useState('')
  const [verifyToken, setVerifyToken] = useState('')
  const [token, setToken] = useState('') // só enviado quando preenchido
  const [appSecret, setAppSecret] = useState('')

  function aplicar(c: Config) {
    setCfg(c)
    setBusinessId(c.igBusinessAccountId ?? '')
    setPageId(c.igPageId ?? '')
    setVerifyToken(c.igVerifyToken ?? '')
    setToken('')
    setAppSecret('')
  }

  useEffect(() => { api.get('/instagram/config').then(({ data }) => aplicar(data)).catch((e) => avisar(mensagemDeErro(e), 'erro')) }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const { data } = await api.put('/instagram/config', {
        igBusinessAccountId: businessId.trim(),
        igPageId: pageId.trim() || undefined,
        igVerifyToken: verifyToken.trim(),
        igAppSecret: appSecret.trim() || undefined,
        token: token.trim() || undefined,
      })
      const { data: c } = await api.get('/instagram/config')
      aplicar(c)
      avisar(data.conectado ? t('ig.conectadoSucesso', { username: data.username ? `· @${data.username}` : '' }) : t('ig.salvoNaoConfirmado', { erro: data.erro ?? t('ig.verifiqueContaToken') }))
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setSalvando(false) }
  }

  async function testar() {
    setTestando(true)
    try {
      const { data } = await api.post('/instagram/testar')
      avisar(t('ig.credenciaisValidas', { username: data.username ? `· @${data.username}` : '' }))
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setTestando(false) }
  }

  function copiar(txt: string) { navigator.clipboard?.writeText(txt).then(() => avisar(t('wa.copiado'))).catch(() => {}) }

  if (!cfg) return <p style={{ color: 'var(--ink-soft)' }}>{t('wa.carregando')}</p>

  return (
    <>
      <header><h1>{t('ig.titulo')}</h1></header>
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        {t('ig.explicacao1')} <strong>{t('ig.contaProfissionalDestaque')}</strong> {t('ig.explicacao2')}
      </div>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>
          {t('wa.statusLabel')} {cfg.conectado
            ? <span style={{ color: 'var(--ok)' }}>{t('wa.conectado')}{cfg.igUsername ? ` · @${cfg.igUsername}` : ''}</span>
            : <span style={{ color: 'var(--ink-soft)' }}>{t('wa.naoConectado')}</span>}
        </h2>
        {!cfg.servidorPodeCifrar && (
          <div className="alerta">{t('wa.avisoSemSecret1')} <code>WA_TOKEN_SECRET</code> {t('wa.avisoSemSecret2')}</div>
        )}
      </div>

      {cfg.conexaoAutomaticaDisponivel && cfg.metaAppId && (
        <ConexaoAutomaticaSection appId={cfg.metaAppId} aoConectar={async () => { const { data } = await api.get('/instagram/config'); aplicar(data) }} />
      )}

      {cfg.conexaoAutomaticaDisponivel && cfg.metaAppId && cfg.metaConfigId && (
        <ConectarMetaTudo
          appId={cfg.metaAppId} configId={cfg.metaConfigId}
          aoConectarInstagram={async () => { const { data } = await api.get('/instagram/config'); aplicar(data) }}
        />
      )}

      <form className="cartao" onSubmit={salvar}>
        <h2 style={{ marginTop: 0 }}>{t('ig.credenciaisTitulo')}</h2>
        {cfg.conexaoAutomaticaDisponivel && <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: -8 }}>{t('wa.ouConfigureManual')}</p>}
        <div className="linha-campos">
          <div className="campo">
            <label>{t('ig.businessAccountIdLabel')}</label>
            <input value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder={t('ig.businessAccountIdPlaceholder')} required />
          </div>
          <div className="campo">
            <label>{t('ig.paginaVinculadaLabel')}</label>
            <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder={t('ig.paginaVinculadaPlaceholder')} />
          </div>
        </div>
        <div className="linha-campos">
          <div className="campo">
            <label>{t('wa.verifyTokenLabel')}</label>
            <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder={t('wa.verifyTokenPlaceholder')} required minLength={6} />
          </div>
          <div className="campo">
            <label>{t('wa.tokenPermanenteLabel')} {cfg.temToken && <small style={{ color: 'var(--ok)' }}>{t('wa.salvoCheck')}</small>}</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.temToken ? t('wa.tokenPlaceholderSalvo') : t('ig.tokenPlaceholderNovo')} autoComplete="off" />
          </div>
        </div>
        <div className="campo">
          <label>{t('wa.appSecretLabel')} {cfg.temAppSecret && <small style={{ color: 'var(--ok)' }}>{t('wa.salvoCheck')}</small>}</label>
          <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={t('wa.appSecretPlaceholder')} autoComplete="off" style={{ maxWidth: 360 }} />
        </div>
        <div className="acoes">
          <button className="btn" disabled={salvando}>{salvando ? t('ig.salvandoValidando') : t('ig.salvarEValidar')}</button>
        </div>
      </form>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>{t('wa.webhookTitulo')}</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          {t('ig.webhookExplicacao1')} <strong>{t('wa.messagesDestaque')}</strong>{t('wa.webhookExplicacao2')}
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
        <h2 style={{ marginTop: 0 }}>{t('ig.revalidarTitulo')}</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          {t('ig.revalidarExplicacao')}
        </p>
        <button type="button" className="btn" onClick={testar} disabled={testando || !cfg.conectado}>{testando ? t('ig.validando') : t('ig.revalidarBtn')}</button>
        {!cfg.conectado && <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>{t('ig.conecteContaAntes')}</p>}
      </div>
    </>
  )
}

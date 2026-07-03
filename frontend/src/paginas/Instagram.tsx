import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'

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
}

export default function Instagram() {
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
      avisar(data.conectado ? `Conectado ✅ ${data.username ? `· @${data.username}` : ''}` : `Salvo. Conexão não confirmada: ${data.erro ?? 'verifique a conta/token.'}`)
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setSalvando(false) }
  }

  async function testar() {
    setTestando(true)
    try {
      const { data } = await api.post('/instagram/testar')
      avisar(`Credenciais válidas ✅ ${data.username ? `· @${data.username}` : ''}`)
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setTestando(false) }
  }

  function copiar(txt: string) { navigator.clipboard?.writeText(txt).then(() => avisar('Copiado.')).catch(() => {}) }

  if (!cfg) return <p style={{ color: 'var(--ink-soft)' }}>Carregando…</p>

  return (
    <>
      <header><h1>Instagram oficial</h1></header>
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Conecte a <strong>conta profissional do Instagram da sua marca</strong> (Meta Graph API). As DMs recebidas caem
        no Chat Zaieze junto com o WhatsApp, roteadas pela carteira. Diferente do WhatsApp, só dá pra responder depois
        que a pessoa mandar mensagem primeiro, e só dentro de 24h — não existe template pra reabrir a conversa.
      </div>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>
          Status: {cfg.conectado
            ? <span style={{ color: 'var(--ok)' }}>✅ Conectado{cfg.igUsername ? ` · @${cfg.igUsername}` : ''}</span>
            : <span style={{ color: 'var(--ink-soft)' }}>⚪ Não conectado</span>}
        </h2>
        {!cfg.servidorPodeCifrar && (
          <div className="alerta">O servidor está sem <code>WA_TOKEN_SECRET</code> — defina-o no ambiente para guardar o token com segurança.</div>
        )}
      </div>

      <form className="cartao" onSubmit={salvar}>
        <h2 style={{ marginTop: 0 }}>Credenciais (Meta Business Manager / App Dashboard)</h2>
        <div className="linha-campos">
          <div className="campo">
            <label>Instagram Business Account ID</label>
            <input value={businessId} onChange={(e) => setBusinessId(e.target.value)} placeholder="ex.: 1789..." required />
          </div>
          <div className="campo">
            <label>Página do Facebook vinculada (ID)</label>
            <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="opcional — não exigido no login direto do Instagram" />
          </div>
        </div>
        <div className="linha-campos">
          <div className="campo">
            <label>Verify token (webhook)</label>
            <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="crie um texto secreto (mín. 6)" required minLength={6} />
          </div>
          <div className="campo">
            <label>Token permanente {cfg.temToken && <small style={{ color: 'var(--ok)' }}>· salvo ✓</small>}</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.temToken ? 'deixe em branco para manter' : 'cole o access token'} autoComplete="off" />
          </div>
        </div>
        <div className="campo">
          <label>App Secret {cfg.temAppSecret && <small style={{ color: 'var(--ok)' }}>· salvo ✓</small>}</label>
          <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="opcional (valida assinatura do webhook)" autoComplete="off" style={{ maxWidth: 360 }} />
        </div>
        <div className="acoes">
          <button className="btn" disabled={salvando}>{salvando ? 'Salvando e validando…' : 'Salvar e validar conexão'}</button>
        </div>
      </form>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Webhook (configure na Meta)</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          No App Dashboard da Meta (Instagram → Webhooks), use a URL de callback e o verify token abaixo, e assine o campo <strong>messages</strong>.
        </p>
        <div className="campo">
          <label>Callback URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={cfg.webhookUrl} style={{ flex: 1 }} />
            <button type="button" className="btn secundario" onClick={() => copiar(cfg.webhookUrl)}>Copiar</button>
          </div>
        </div>
        <div className="campo">
          <label>Verify token</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={verifyToken} style={{ flex: 1 }} />
            <button type="button" className="btn secundario" onClick={() => copiar(verifyToken)}>Copiar</button>
          </div>
        </div>
      </div>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Revalidar credenciais</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          O Instagram não permite mandar uma mensagem de teste pra qualquer pessoa — só confirmamos que a conta e o
          token salvos ainda são válidos.
        </p>
        <button type="button" className="btn" onClick={testar} disabled={testando || !cfg.conectado}>{testando ? 'Validando…' : 'Revalidar'}</button>
        {!cfg.conectado && <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>Conecte a conta antes de revalidar.</p>}
      </div>
    </>
  )
}

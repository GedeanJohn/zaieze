import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'

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
  const [cfg, setCfg] = useState<Config | null>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
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

  useEffect(() => { api.get('/whatsapp/config').then(({ data }) => aplicar(data)).catch((e) => setErro(mensagemDeErro(e))) }, [])

  function aviso(msg: string) { setOk(msg); setTimeout(() => setOk(''), 3500) }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setSalvando(true)
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
      aviso(data.conectado ? `Conectado ✅ ${data.numero ? `· ${data.numero}` : ''}` : `Salvo. Conexão não confirmada: ${data.erro ?? 'verifique número/token.'}`)
    } catch (err) { setErro(mensagemDeErro(err)) }
    finally { setSalvando(false) }
  }

  async function testar() {
    if (!telTeste.trim()) return
    setErro(''); setTestando(true)
    try {
      const { data } = await api.post('/whatsapp/testar', { telefone: telTeste.trim() })
      aviso(`Teste ${data.status === 'ENVIADA' ? 'enviado ✅' : data.status}.`)
    } catch (err) { setErro(mensagemDeErro(err)) }
    finally { setTestando(false) }
  }

  function copiar(txt: string) { navigator.clipboard?.writeText(txt).then(() => aviso('Copiado.')).catch(() => {}) }

  if (!cfg) return <p style={{ color: 'var(--ink-soft)' }}>Carregando…</p>

  return (
    <>
      <header><h1>WhatsApp oficial</h1></header>
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Conecte o <strong>número oficial da sua marca</strong> (WhatsApp Cloud API da Meta). Todas as vendedoras atendem por
        este número; a identidade da vendedora vai no conteúdo. As mensagens recebidas continuam roteadas pela carteira.
      </div>

      {erro && <div className="alerta">{erro}</div>}
      {ok && <div className="cartao" style={{ background: '#1f3d2b', color: '#b9f5cf' }}>{ok}</div>}

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>
          Status: {cfg.conectado
            ? <span style={{ color: 'var(--ok)' }}>✅ Conectado{cfg.waNumeroExibicao ? ` · ${cfg.waNumeroExibicao}` : ''}</span>
            : <span style={{ color: 'var(--ink-soft)' }}>⚪ Não conectado</span>}
        </h2>
        {!cfg.servidorPodeCifrar && (
          <div className="alerta">O servidor está sem <code>WA_TOKEN_SECRET</code> — defina-o no ambiente para guardar o token com segurança.</div>
        )}
      </div>

      <form className="cartao" onSubmit={salvar}>
        <h2 style={{ marginTop: 0 }}>Credenciais (Meta Business Manager)</h2>
        <div className="linha-campos">
          <div className="campo">
            <label>Phone Number ID</label>
            <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder="ex.: 1029384756..." required />
          </div>
          <div className="campo">
            <label>WhatsApp Business Account ID (WABA)</label>
            <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="opcional" />
          </div>
        </div>
        <div className="linha-campos">
          <div className="campo">
            <label>Número de exibição</label>
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="+55 62 9xxxx-xxxx (auto se conectar)" />
          </div>
          <div className="campo">
            <label>Verify token (webhook)</label>
            <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="crie um texto secreto (mín. 6)" required minLength={6} />
          </div>
        </div>
        <div className="linha-campos">
          <div className="campo">
            <label>Token permanente {cfg.temToken && <small style={{ color: 'var(--ok)' }}>· salvo ✓</small>}</label>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.temToken ? 'deixe em branco para manter' : 'cole o token do System User'} autoComplete="off" />
          </div>
          <div className="campo">
            <label>App Secret {cfg.temAppSecret && <small style={{ color: 'var(--ok)' }}>· salvo ✓</small>}</label>
            <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="opcional (valida assinatura do webhook)" autoComplete="off" />
          </div>
        </div>
        <div className="acoes">
          <button className="btn" disabled={salvando}>{salvando ? 'Salvando e testando…' : 'Salvar e testar conexão'}</button>
        </div>
      </form>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Webhook (configure na Meta)</h2>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          No painel da Meta (WhatsApp → Configuration → Webhook), use a URL de callback e o verify token abaixo, e assine os campos <strong>messages</strong>.
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
        <h2 style={{ marginTop: 0 }}>Enviar mensagem de teste</h2>
        <div className="linha-campos" style={{ alignItems: 'end' }}>
          <div className="campo">
            <label>Número (com DDI/DDD)</label>
            <input value={telTeste} onChange={(e) => setTelTeste(e.target.value)} placeholder="5562999990000" />
          </div>
          <div><button type="button" className="btn" onClick={testar} disabled={testando || !cfg.conectado}>{testando ? 'Enviando…' : 'Enviar teste'}</button></div>
        </div>
        {!cfg.conectado && <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>Conecte o número antes de testar.</p>}
      </div>
    </>
  )
}

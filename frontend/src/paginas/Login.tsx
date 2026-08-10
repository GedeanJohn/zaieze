import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { HOST } from '../host'
import { useIdioma, ehIdiomaValido } from '../lib/i18n'
import CampoSenha from '../componentes/CampoSenha'

interface RedePublica { nome: string; logoUrl: string | null }

/** Cabeçalho comum: marca Zaieze + (quando o subdomínio resolve pra uma loja) nome/logo dela —
 *  crucial pra quem tem o app instalado como PWA, onde não dá pra ver a URL/subdomínio. */
function CabecalhoLoja({ loja }: { loja: RedePublica | null }) {
  const { t } = useIdioma()
  return (
    <>
      <h1><a href="https://zaieze.com" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Zaieze</a></h1>
      <p className="login-lema">{t('footer.tagline')}</p>
      {loja && (
        <div className="login-loja">
          {loja.logoUrl && <img src={loja.logoUrl} alt="" />}
          <span>{t('login.loja', { nome: loja.nome })}</span>
        </div>
      )}
    </>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [esqueci, setEsqueci] = useState(false)
  const [loja, setLoja] = useState<RedePublica | null>(null)
  // Sessão de uma conta ainda guardada neste aparelho/PWA pra este mesmo tenant — comum em app
  // instalado, onde não fica óbvio "em qual loja/conta eu estou" nem como trocar.
  const [sessaoExistente, setSessaoExistente] = useState(() => usuarioLogado())
  const navigate = useNavigate()
  const { t, setIdioma } = useIdioma()

  useEffect(() => {
    if (!HOST.slug) return
    api.get(`/redes/publico/${HOST.slug}`).then(({ data }) => setLoja(data)).catch(() => setLoja(null))
  }, [])

  function sairDaSessaoExistente() {
    localStorage.removeItem('modacrm_token')
    localStorage.removeItem('modacrm_usuario')
    setSessaoExistente(null)
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const { data } = await api.post('/auth/login', { email, senha, redeSlug: HOST.slug ?? undefined })
      localStorage.setItem('modacrm_token', data.token)
      localStorage.setItem('modacrm_usuario', JSON.stringify(data.usuario))
      // Aplica na hora o idioma salvo no perfil de quem acabou de logar.
      if (ehIdiomaValido(data.usuario?.idioma)) setIdioma(data.usuario.idioma)
      navigate('/')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setCarregando(false)
    }
  }

  if (esqueci) return <EsqueciSenha onVoltar={() => setEsqueci(false)} />

  if (sessaoExistente) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <CabecalhoLoja loja={loja} />
          <p style={{ marginTop: 8 }}>{t('login.jaLogadoComo', { nome: sessaoExistente.nome })}</p>
          <button className="btn" style={{ width: '100%' }} onClick={() => navigate('/')}>{t('login.continuar')}</button>
          <button type="button" className="btn-link" style={{ display: 'block', margin: '14px auto 0' }} onClick={sairDaSessaoExistente}>
            {t('login.trocarConta')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={entrar}>
        <CabecalhoLoja loja={loja} />
        {erro && <div className="alerta">{erro}</div>}
        <div className="campo">
          <label>{t('login.email')}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="campo">
          <label>{t('login.senha')}</label>
          <CampoSenha value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        <button className="btn" style={{ width: '100%' }} disabled={carregando}>
          {carregando ? t('login.entrando') : t('login.entrar')}
        </button>
        <button type="button" className="btn-link" style={{ display: 'block', margin: '14px auto 0' }} onClick={() => setEsqueci(true)}>
          {t('login.esqueciSenha')}
        </button>
      </form>
    </div>
  )
}

function EsqueciSenha({ onVoltar }: { onVoltar: () => void }) {
  const [modo, setModo] = useState<'telefone' | 'email'>('telefone')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<'whatsapp' | 'pendente' | 'nao-encontrado' | null>(null)
  const { t } = useIdioma()

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    try {
      const { data } = await api.post('/auth/esqueci-senha', modo === 'telefone' ? { telefone } : { email })
      setResultado(data.via)
    } catch {
      setResultado('nao-encontrado')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1><a href="https://zaieze.com" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Zaieze</a></h1>
        {!resultado ? (
          <form onSubmit={enviar}>
            {modo === 'telefone' ? (
              <>
                <p>{t('login.esqueci.textoTelefone')}</p>
                <div className="campo">
                  <label>{t('login.esqueci.whatsapp')}</label>
                  <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="5562999990011" inputMode="tel" required autoFocus />
                </div>
              </>
            ) : (
              <>
                <p>{t('login.esqueci.textoEmail')}</p>
                <div className="campo">
                  <label>{t('login.email')}</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </div>
              </>
            )}
            <button className="btn" style={{ width: '100%' }} disabled={enviando}>
              {enviando ? t('login.esqueci.enviando') : t('login.esqueci.redefinir')}
            </button>
            <button type="button" className="btn-link" style={{ display: 'block', margin: '14px auto 0' }} onClick={() => setModo(modo === 'telefone' ? 'email' : 'telefone')}>
              {modo === 'telefone' ? t('login.esqueci.trocarParaEmail') : t('login.esqueci.trocarParaTelefone')}
            </button>
            <button type="button" className="btn-link" style={{ display: 'block', margin: '6px auto 0' }} onClick={onVoltar}>
              {t('login.esqueci.voltar')}
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center' }}>
            {resultado === 'whatsapp' && <p>✅ {t('login.esqueci.resultadoWhatsapp')}</p>}
            {resultado === 'pendente' && <p>{t('login.esqueci.resultadoPendente')}</p>}
            {resultado === 'nao-encontrado' && <p>{t('login.esqueci.resultadoNaoEncontrado')} {modo === 'telefone' ? t('login.esqueci.esseWhatsapp') : t('login.esqueci.esseEmail')}.</p>}
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onVoltar}>{t('login.esqueci.voltar')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

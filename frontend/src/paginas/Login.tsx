import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, mensagemDeErro } from '../api'
import { HOST } from '../host'
import { useIdioma, ehIdiomaValido } from '../lib/i18n'
import CampoSenha from '../componentes/CampoSenha'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [esqueci, setEsqueci] = useState(false)
  const navigate = useNavigate()
  const { t, setIdioma } = useIdioma()

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

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={entrar}>
        <h1>Zaieze</h1>
        <p className="login-lema">{t('footer.tagline')}</p>
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
        <h1>Zaieze</h1>
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

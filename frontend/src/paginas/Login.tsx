import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, mensagemDeErro } from '../api'
import { HOST } from '../host'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [esqueci, setEsqueci] = useState(false)
  const navigate = useNavigate()

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const { data } = await api.post('/auth/login', { email, senha, redeSlug: HOST.slug ?? undefined })
      localStorage.setItem('modacrm_token', data.token)
      localStorage.setItem('modacrm_usuario', JSON.stringify(data.usuario))
      navigate('/')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setCarregando(false)
    }
  }

  if (esqueci) return <EsqueciSenha email={email} onVoltar={() => setEsqueci(false)} />

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={entrar}>
        <h1>Zaieze</h1>
        <p className="login-lema">Sistemas Inteligentes para a Moda</p>
        {erro && <div className="alerta">{erro}</div>}
        <div className="campo">
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="campo">
          <label>Senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        <button className="btn" style={{ width: '100%' }} disabled={carregando}>
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
        <button type="button" className="btn-link" style={{ display: 'block', margin: '14px auto 0' }} onClick={() => setEsqueci(true)}>
          Esqueci minha senha
        </button>
      </form>
    </div>
  )
}

function EsqueciSenha({ email: emailInicial, onVoltar }: { email: string; onVoltar: () => void }) {
  const [email, setEmail] = useState(emailInicial)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<'whatsapp' | 'pendente' | 'nao-encontrado' | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    try {
      const { data } = await api.post('/auth/esqueci-senha', { email })
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
            <p>Informe seu e-mail de acesso. Se você tiver WhatsApp cadastrado, mandamos uma senha provisória por lá na hora.</p>
            <div className="campo">
              <label>E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={enviando}>
              {enviando ? 'Enviando…' : 'Redefinir senha'}
            </button>
            <button type="button" className="btn-link" style={{ display: 'block', margin: '14px auto 0' }} onClick={onVoltar}>
              Voltar para o login
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center' }}>
            {resultado === 'whatsapp' && <p>✅ Mandamos uma senha provisória para o seu WhatsApp cadastrado. Troque assim que entrar.</p>}
            {resultado === 'pendente' && <p>Você ainda não tem WhatsApp cadastrado. Avisamos quem pode redefinir sua senha (o gestor da sua loja, ou o suporte Zaieze) — você será contatado(a) em breve.</p>}
            {resultado === 'nao-encontrado' && <p>Não encontramos uma conta ativa com esse e-mail.</p>}
            <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={onVoltar}>Voltar para o login</button>
          </div>
        )}
      </div>
    </div>
  )
}

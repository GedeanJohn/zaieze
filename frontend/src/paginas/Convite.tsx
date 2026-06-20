import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, mensagemDeErro, rotuloPapel } from '../api'

interface InfoConvite {
  valido: boolean
  usado?: boolean
  expirado?: boolean
  nome?: string
  email?: string
  role?: string
  redeNome?: string | null
}

export default function Convite() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [info, setInfo] = useState<InfoConvite | null>(null)
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    if (!token) return
    api.get(`/convites/${token}`)
      .then(({ data }) => setInfo(data))
      .catch(() => setInfo({ valido: false }))
  }, [token])

  async function aceitar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirma) { setErro('As senhas não conferem.'); return }
    setSalvando(true)
    try {
      await api.post(`/convites/${token}/aceitar`, { senha })
      setPronto(true)
      setTimeout(() => navigate('/login'), 2200)
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  if (!info) return <div className="login-wrap"><div className="login-card">Carregando…</div></div>

  if (pronto) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <h1>Tudo certo! ✅</h1>
          <p>Sua conta foi criada. Redirecionando para o login…</p>
        </div>
      </div>
    )
  }

  if (!info.valido) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <h1>Convite indisponível</h1>
          <p>
            {info.usado ? 'Este convite já foi utilizado.' : info.expirado ? 'Este convite expirou.' : 'Convite inválido.'}
            {' '}Peça um novo link a quem te convidou.
          </p>
          <button className="btn" style={{ width: '100%' }} onClick={() => navigate('/login')}>Ir para o login</button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={aceitar}>
        <h1>Bem-vindo(a)!</h1>
        <p>
          {info.redeNome ? <>Você foi convidado(a) para <strong>{info.redeNome}</strong></> : 'Você foi convidado(a)'}
          {info.role ? <> como <strong>{rotuloPapel[info.role as keyof typeof rotuloPapel] ?? info.role}</strong></> : ''}.
          {' '}Crie sua senha para acessar.
        </p>
        {erro && <div className="alerta">{erro}</div>}
        <div className="campo">
          <label>Nome</label>
          <input value={info.nome ?? ''} disabled />
        </div>
        <div className="campo">
          <label>E-mail (seu login)</label>
          <input value={info.email ?? ''} disabled />
        </div>
        <div className="campo">
          <label>Crie sua senha</label>
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoFocus placeholder="mínimo 6 caracteres" />
        </div>
        <div className="campo">
          <label>Confirme a senha</label>
          <input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
        </div>
        <button className="btn" style={{ width: '100%' }} disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar acesso e entrar'}
        </button>
      </form>
    </div>
  )
}

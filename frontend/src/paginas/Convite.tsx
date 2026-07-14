import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, mensagemDeErro } from '../api'
import CampoSenha from '../componentes/CampoSenha'
import { useIdioma } from '../lib/i18n'

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
  const { t } = useIdioma()
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
    if (senha.length < 6) { setErro(t('convite.senhaMinima')); return }
    if (senha !== confirma) { setErro(t('convite.senhasNaoConferem')); return }
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

  if (!info) return <div className="login-wrap"><div className="login-card">{t('convite.carregando')}</div></div>

  if (pronto) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <h1>{t('convite.tudoCerto')}</h1>
          <p>{t('convite.contaCriada')}</p>
        </div>
      </div>
    )
  }

  if (!info.valido) {
    return (
      <div className="login-wrap">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <h1>{t('convite.indisponivel')}</h1>
          <p>
            {info.usado ? t('convite.jaUtilizado') : info.expirado ? t('convite.expirado') : t('convite.invalido')}
            {' '}{t('convite.pecaNovoLink')}
          </p>
          <button className="btn" style={{ width: '100%' }} onClick={() => navigate('/login')}>{t('convite.irParaLogin')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={aceitar}>
        <h1>{t('convite.bemVindo')}</h1>
        <p>
          {info.redeNome ? <>{t('convite.convidadoPara')} <strong>{info.redeNome}</strong></> : t('convite.convidado')}
          {info.role ? <> {t('convite.comoPapel')} <strong>{t(`papel.${info.role}`)}</strong></> : ''}.
          {' '}{t('convite.crieSenhaTexto')}
        </p>
        {erro && <div className="alerta">{erro}</div>}
        <div className="campo">
          <label>{t('convite.nomeLabel')}</label>
          <input value={info.nome ?? ''} disabled />
        </div>
        <div className="campo">
          <label>{t('convite.emailLoginLabel')}</label>
          <input value={info.email ?? ''} disabled />
        </div>
        <div className="campo">
          <label>{t('convite.crieSenhaLabel')}</label>
          <CampoSenha value={senha} onChange={(e) => setSenha(e.target.value)} required autoFocus placeholder={t('convite.senhaMinPlaceholder')} />
        </div>
        <div className="campo">
          <label>{t('convite.confirmeSenhaLabel')}</label>
          <CampoSenha value={confirma} onChange={(e) => setConfirma(e.target.value)} required />
        </div>
        <button className="btn" style={{ width: '100%' }} disabled={salvando}>
          {salvando ? t('convite.criando') : t('convite.criarAcesso')}
        </button>
      </form>
    </div>
  )
}

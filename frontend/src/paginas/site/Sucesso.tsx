import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import { urlTenantLogin } from '../../host'

export default function Sucesso() {
  const [params] = useSearchParams()
  const slug = params.get('slug') ?? ''
  const [dominio, setDominio] = useState('zaieze.com')

  useEffect(() => {
    api.get('/assinaturas/planos').then(({ data }) => setDominio(data.dominioBase)).catch(() => {})
  }, [])

  const loginUrl = slug ? urlTenantLogin(slug, dominio) : '#'

  return (
    <div className="site sucesso-wrap">
      <div className="sucesso-card">
        <div className="check">✓</div>
        <h2>Sua conta já está no ar!</h2>
        <p>
          Seu painel <strong>{slug}.{dominio}</strong> está pronto. Agora é só entrar e cadastrar sua equipe de
          vendedoras — você só paga quando ativar a conta de cada uma.
        </p>
        <a className="btn grande" href={loginUrl}>Acessar meu painel</a>
        <small className="dica" style={{ marginTop: 14, display: 'block' }}>
          Endereço do seu painel: <strong>{slug}.{dominio}</strong>
        </small>
      </div>
    </div>
  )
}

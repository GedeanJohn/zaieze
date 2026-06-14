import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../api'
import { urlTenantLogin } from '../../host'

export default function Sucesso() {
  const [params] = useSearchParams()
  const slug = params.get('slug') ?? ''
  const plano = params.get('plano') ?? ''
  const simulado = params.get('simulado') === '1'
  const [dominio, setDominio] = useState('zaieze.com')

  useEffect(() => {
    api.get('/assinaturas/planos').then(({ data }) => setDominio(data.dominioBase)).catch(() => {})
  }, [])

  const loginUrl = slug ? urlTenantLogin(slug, dominio) : '#'

  return (
    <div className="site sucesso-wrap">
      <div className="sucesso-card">
        <div className="check">✓</div>
        <h2>{simulado ? 'Assinatura ativada (modo simulado)' : 'Quase lá!'}</h2>
        {simulado ? (
          <p>Seu painel <strong>{slug}.{dominio}</strong> já está no ar com o plano <strong>{plano}</strong>.</p>
        ) : (
          <p>
            Assim que o Mercado Pago confirmar o pagamento, seu painel <strong>{slug}.{dominio}</strong> será
            liberado. Você receberá a confirmação por e-mail.
          </p>
        )}
        <a className="btn grande" href={loginUrl}>Acessar meu painel</a>
        <small className="dica" style={{ marginTop: 14, display: 'block' }}>
          Endereço do seu painel: <strong>{slug}.{dominio}</strong>
        </small>
      </div>
    </div>
  )
}

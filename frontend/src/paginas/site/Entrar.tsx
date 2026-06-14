import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { urlTenantLogin } from '../../host'

export default function Entrar() {
  const [slug, setSlug] = useState('')
  const [dominio, setDominio] = useState('zaieze.com')

  useEffect(() => {
    api.get('/assinaturas/planos').then(({ data }) => setDominio(data.dominioBase)).catch(() => {})
  }, [])

  function ir(e: React.FormEvent) {
    e.preventDefault()
    if (slug) window.location.href = urlTenantLogin(slug.toLowerCase(), dominio)
  }

  return (
    <div className="site entrar-wrap">
      <Link to="/" className="voltar">← Voltar</Link>
      <form className="entrar-card" onSubmit={ir}>
        <h2>Acessar meu painel</h2>
        <p>Informe o endereço da sua loja para entrar.</p>
        <div className="slug-input">
          <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="sualoja" autoFocus />
          <span>.{dominio}</span>
        </div>
        <button className="btn grande" style={{ width: '100%', marginTop: 16 }} disabled={!slug}>Entrar</button>
        <small className="dica" style={{ marginTop: 12, display: 'block', textAlign: 'center' }}>
          Ainda não tem conta? <Link to="/">Ver planos</Link>
        </small>
      </form>
    </div>
  )
}

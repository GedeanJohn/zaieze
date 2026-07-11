import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, formataReal } from '../../api'
import { useMetaTags } from '../../lib/useMetaTags'
import { useIdioma } from '../../lib/i18n'

export default function AssessorDeModa() {
  const { t } = useIdioma()
  const navigate = useNavigate()
  const [preco, setPreco] = useState<number | null>(null)

  useMetaTags({
    titulo: t('assessorPlano.metaTitulo'),
    descricao: t('assessorPlano.metaDescricao'),
    url: 'https://zaieze.com/assessor-de-moda',
  })

  useEffect(() => {
    api.get('/assessores/plano').then(({ data }) => setPreco(data.precoMensal)).catch(() => {})
  }, [])

  const funcionalidades = [
    t('assessorPlano.func1'), t('assessorPlano.func2'), t('assessorPlano.func3'),
    t('assessorPlano.func4'), t('assessorPlano.func5'), t('assessorPlano.func6'),
  ]

  return (
    <div className="site">
      <header className="site-top">
        <Link to="/"><img className="site-logo-img" src="/zaieze-branco.png" alt="ZAIEZE" /></Link>
        <nav>
          <a href="/#planos">{t('nav.planos')}</a>
          <a href="/#como">{t('nav.como')}</a>
          <Link className="btn secundario" to="/entrar">{t('nav.entrar')}</Link>
        </nav>
      </header>

      <section className="pagina-texto" style={{ textAlign: 'center', maxWidth: 640 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--zz-mut)', marginBottom: 8 }}>
          {t('assessorPlano.selo')}
        </div>
        <h1 style={{ marginBottom: 6 }}>{t('assessorPlano.titulo')}</h1>
        <p>{t('assessorPlano.texto')}</p>
      </section>

      <section className="recursos" style={{ marginTop: 20 }}>
        <div className="recursos-grid">
          {funcionalidades.map((f) => (
            <div className="recurso-card" key={f}><p style={{ margin: 0 }}>{f}</p></div>
          ))}
        </div>
      </section>

      <section className="planos-site">
        <div className="planos-grid" style={{ maxWidth: 340, margin: '0 auto' }}>
          <div className="plano-card destaque">
            <h3>{t('assessorPlano.tituloPlano')}</h3>
            {preco != null && (
              <div className="preco">{formataReal(preco)}<span>/{t('unidade.mes')}</span></div>
            )}
            <div className="limite">{t('assessorPlano.subPlano')}</div>
            <button className="btn grande" onClick={() => navigate('/assessor-de-moda/cadastro')}>{t('assessorPlano.cta')}</button>
          </div>
        </div>
      </section>

      <footer className="site-rodape">
        <div>CNPJ: 43.391.734/0001-51 · ZAIEZE · {t('footer.tagline')} © {new Date().getFullYear()}</div>
        <div><Link to="/quem-somos">{t('footer.quemSomos')}</Link> · <Link to="/lgpd">{t('footer.lgpd')}</Link> · <Link to="/privacidade">{t('footer.privacidade')}</Link></div>
      </footer>
    </div>
  )
}

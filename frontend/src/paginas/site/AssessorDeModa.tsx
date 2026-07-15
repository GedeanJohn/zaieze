import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, formataReal } from '../../api'
import { useMetaTags } from '../../lib/useMetaTags'
import { useIdioma } from '../../lib/i18n'

export default function AssessorDeModa() {
  const { t } = useIdioma()
  const navigate = useNavigate()
  const [precos, setPrecos] = useState<{ precoMensalBasico: number; precoMensalAvancado: number } | null>(null)

  useMetaTags({
    titulo: t('assessorPlano.metaTitulo'),
    descricao: t('assessorPlano.metaDescricao'),
    url: 'https://zaieze.com/assessor-de-moda',
  })

  useEffect(() => {
    api.get('/assessores/plano').then(({ data }) => setPrecos(data)).catch(() => {})
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
        <div className="planos-grid" style={{ maxWidth: 680, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <div className="plano-card">
            <h3>Básico</h3>
            {precos != null && <div className="preco">{formataReal(precos.precoMensalBasico)}<span>/{t('unidade.mes')}</span></div>}
            <div className="limite">Até 3 fotos de destaque por marca</div>
            <button className="btn grande" onClick={() => navigate('/assessor-de-moda/cadastro?plano=BASICO')}>{t('assessorPlano.cta')}</button>
          </div>
          <div className="plano-card destaque">
            <h3>Avançado</h3>
            {precos != null && <div className="preco">{formataReal(precos.precoMensalAvancado)}<span>/{t('unidade.mes')}</span></div>}
            <div className="limite">Até 10 fotos + 5 vídeos (30s) por marca</div>
            <button className="btn grande" onClick={() => navigate('/assessor-de-moda/cadastro?plano=AVANCADO')}>{t('assessorPlano.cta')}</button>
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

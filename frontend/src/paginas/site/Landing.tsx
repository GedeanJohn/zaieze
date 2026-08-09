import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, formataReal, formataUsd } from '../../api'
import AgenteZaieze from './AgenteZaieze'
import { useMetaTags } from '../../lib/useMetaTags'
import { capturarRefAfiliado } from '../../lib/afiliado'
import SeletorIdioma from '../../componentes/SeletorIdioma'
import { useIdioma } from '../../lib/i18n'

/** Glifo oficial do WhatsApp (herda a cor via currentColor — fica no estilo da marca). */
function IconeWhatsApp({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

/** Ícones de linha simples (currentColor), mesma técnica do IconeWhatsApp. */
function IconeVendas({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M6 8h12l-1 12H7L6 8Z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
  )
}
function IconeEstoque({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" strokeLinejoin="round" />
      <path d="M3 7.5V16l9 5 9-5V7.5" strokeLinejoin="round" />
      <path d="M12 12v9" />
    </svg>
  )
}
function IconeCrm({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
      <circle cx="17" cy="8" r="2.4" />
      <path d="M15.5 12.3A4.7 4.7 0 0 1 20.5 17" strokeLinecap="round" />
    </svg>
  )
}
function IconeCatalogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  )
}
function IconeNuvem({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M6.5 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 15.9 8.3 4.5 4.5 0 0 1 17.5 18H6.5Z" strokeLinejoin="round" />
    </svg>
  )
}
function IconeRaio({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
function IconeCarteira({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  )
}

interface AddonCatalogo { tipo: string; nome: string; preco: number }

export default function Landing() {
  const [precoAssento, setPrecoAssento] = useState(0)
  // Guardado como string pra permitir o campo ficar vazio ENQUANTO o usuário apaga pra digitar
  // um número novo — se forçássemos um mínimo a cada tecla, apagar até vazio voltava pro valor
  // anterior na hora (parecia que o backspace não funcionava). Só valida o mínimo no blur.
  const [qtdVendedorasInput, setQtdVendedorasInput] = useState('3')
  const qtdVendedoras = Math.max(1, Number(qtdVendedorasInput) || 0)
  // Valor TOTAL real da faixa pra essa quantidade (vem do backend — nunca precoAssento × qtd,
  // que ignora o desconto por volume cadastrado no Admin). null enquanto carrega.
  const [precoTotalFaixa, setPrecoTotalFaixa] = useState<number | null>(null)
  const [addons, setAddons] = useState<AddonCatalogo[]>([])
  const [cambio, setCambio] = useState<{ usdPorBrl: number | null }>({ usdPorBrl: null })
  const [chatAberto, setChatAberto] = useState(false)
  const navigate = useNavigate()
  const { t, idioma } = useIdioma()

  useMetaTags({
    titulo: t('meta.titulo'),
    descricao: t('meta.descricao'),
    url: 'https://zaieze.com/',
  })

  useEffect(() => {
    api.get('/assinaturas/planos').then(({ data }) => {
      setCambio(data.cambio ?? { usdPorBrl: null })
    }).catch(() => {})
    api.get('/vendedora-billing/preco').then(({ data }) => setPrecoAssento(data.preco)).catch(() => {})
    api.get('/addons').then(({ data }) => setAddons(data.addons)).catch(() => {})
    api.get('/chat-atendimento/preco').then(({ data }) => {
      setAddons((atuais) => [...atuais, { tipo: 'CHAT_ATENDIMENTO', nome: 'Chat de Atendimento', preco: data.preco }])
    }).catch(() => {})
  }, [])

  useEffect(() => { capturarRefAfiliado() }, [])

  // Valor real da faixa pra quantidade digitada na calculadora (debounce pra não bater a API a
  // cada tecla). precoAssento × qtd NÃO serve aqui — ignora o desconto por volume.
  useEffect(() => {
    const t = setTimeout(() => {
      api.get('/vendedora-billing/preco', { params: { qtd: qtdVendedoras } })
        .then(({ data }) => setPrecoTotalFaixa(data.preco))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [qtdVendedoras])

  return (
    <div className="site">
      <header className="site-top">
        <img className="site-logo-img" src="/zaieze-branco.png" alt="ZAIEZE" />
        <nav>
          <a href="#planos">{t('nav.planos')}</a>
          <a href="#como">{t('nav.como')}</a>
          <Link className="btn secundario" to="/entrar">{t('nav.entrar')}</Link>
          <SeletorIdioma />
        </nav>
      </header>

      <section className="hero">
        <img className="hero-logo" src="/zaieze-branco.png" alt="ZAIEZE" />
        <h1>{t('hero.titulo')}</h1>
        <p>{t('hero.texto')}</p>
        <div className="hero-acoes">
          <a className="btn grande" href="#planos">{t('hero.verPlanos')}</a>
          <Link className="btn secundario grande" to="/entrar">{t('hero.jaSouCliente')}</Link>
        </div>
        <div className="hero-nota">{t('hero.nota')}</div>
        <div className="selos-hero">
          <span>⚡ {t('selos.implantacao')}</span>
          <span>🎧 {t('selos.suporte')}</span>
          <span>☁️ {t('selos.nuvem')}</span>
          <span>🔒 {t('selos.seguranca')}</span>
        </div>
      </section>

      <section className="assessor-banner">
        <span className="tag">{t('assessorPromo.tag')}</span>
        <div className="assessor-banner-corpo">
          <div>
            <strong>{t('assessorPromo.titulo')}</strong>
            <p>{t('assessorPromo.texto')}</p>
          </div>
          <Link className="btn secundario grande" to="/assessor-de-moda">{t('assessorPromo.cta')}</Link>
        </div>
      </section>

      <section className="recursos">
        <h2>{t('recursos.titulo')}</h2>
        <div className="recursos-grid">
          <div className="recurso-card"><IconeVendas /><strong>{t('recursos.1.titulo')}</strong><p>{t('recursos.1.texto')}</p></div>
          <div className="recurso-card"><IconeEstoque /><strong>{t('recursos.2.titulo')}</strong><p>{t('recursos.2.texto')}</p></div>
          <div className="recurso-card"><IconeWhatsApp /><strong>{t('recursos.3.titulo')}</strong><p>{t('recursos.3.texto')}</p></div>
          <div className="recurso-card"><IconeCrm /><strong>{t('recursos.4.titulo')}</strong><p>{t('recursos.4.texto')}</p></div>
          <div className="recurso-card"><IconeCatalogo /><strong>{t('recursos.5.titulo')}</strong><p>{t('recursos.5.texto')}</p></div>
          <div className="recurso-card"><IconeNuvem /><strong>{t('recursos.6.titulo')}</strong><p>{t('recursos.6.texto')}</p></div>
        </div>
      </section>

      <section className="faixa" id="como">
        <div><strong>{t('faixa.1.titulo')}</strong><span>{t('faixa.1.texto')}</span></div>
        <div><strong>{t('faixa.2.titulo')}</strong><span>{t('faixa.2.texto')}</span></div>
        <div><strong>{t('faixa.3.titulo')}</strong><span>{t('faixa.3.texto')}</span></div>
      </section>

      <section className="confianca">
        <div className="confianca-colagem">
          <img className="foto-principal" src="https://unsplash.com/photos/5fdhWc1Vm1s/download?w=700" alt="" loading="lazy" />
          <img src="https://unsplash.com/photos/IlHemAQpJ-U/download?w=500" alt="" loading="lazy" />
          <img src="https://unsplash.com/photos/E8OLZnK3kVg/download?w=500" alt="" loading="lazy" />
        </div>
        <div className="confianca-texto">
          <h2>{t('confianca.titulo')}<strong>{t('confianca.tituloDestaque')}</strong></h2>
          <p>{t('confianca.texto')}</p>
          <ul className="moda-lista">
            <li>{t('moda.item1')}</li>
            <li>{t('moda.item2')}</li>
            <li>{t('moda.item3')}</li>
            <li>{t('moda.item4')}</li>
          </ul>
        </div>
      </section>

      <section className="diferenciais-faixa">
        <h2>{t('diferenciais.titulo')}</h2>
        <div className="diferenciais-grid">
          <div><IconeRaio /><p>{t('diferenciais.1')}</p></div>
          <div><IconeCarteira /><p>{t('diferenciais.2')}</p></div>
          <div><IconeNuvem size={32} /><p>{t('diferenciais.3')}</p></div>
        </div>
      </section>

      <section className="planos-site" id="planos">
        <h2>{t('planos.titulo')}</h2>
        <p className="sub">{t('planos.sub')}</p>

        <div className="plano-card destaque" style={{ maxWidth: 420, margin: '0 auto 32px' }}>
          {(() => {
            const emUsd = idioma !== 'pt' && cambio.usdPorBrl != null
            const formata = (v: number) => emUsd ? formataUsd(v * cambio.usdPorBrl!) : formataReal(v)
            return (
              <>
                <div className="preco">{formata(precoAssento)}<span>/{t('unidade.mes')} {t('planos.porVendedora')}</span></div>
                {idioma !== 'pt' && cambio.usdPorBrl != null && <div className="cambio-aprox">{t('cambio.aprox')}</div>}
                <div className="limite">{t('planos.cadastroGratis')}</div>
                <div style={{ margin: '16px 0', padding: '14px', background: 'rgba(255,255,255,.06)', borderRadius: 10 }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>{t('planos.calculadoraLabel')}</label>
                  <input
                    type="number" min={1} value={qtdVendedorasInput}
                    onChange={(e) => setQtdVendedorasInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onBlur={() => setQtdVendedorasInput(String(qtdVendedoras))}
                    style={{ width: 80, textAlign: 'center', fontSize: 16, padding: '6px 8px', borderRadius: 6 }}
                  />
                  <div style={{ marginTop: 10, fontSize: 15 }}>
                    {qtdVendedorasInput.trim() === ''
                      ? t('planos.definirPosteriormente')
                      : <>{t('planos.totalEstimado')} <strong>{formata(precoTotalFaixa ?? precoAssento * qtdVendedoras)}/{t('unidade.mes')}</strong></>}
                  </div>
                  {qtdVendedorasInput.trim() !== '' && qtdVendedoras > 1 && precoTotalFaixa != null && (() => {
                    const precoLinear = precoAssento * qtdVendedoras
                    const economia = precoLinear - precoTotalFaixa
                    if (economia <= 0) return null
                    const percentual = Math.round((economia / precoLinear) * 100)
                    return (
                      <div style={{ marginTop: 6, fontSize: 13, color: '#4ade80' }}>
                        {t('planos.economiaFaixa', { valor: formata(economia), percentual })}
                      </div>
                    )
                  })()}
                </div>
              </>
            )
          })()}
          <button className="btn grande" onClick={() => navigate('/checkout')}>
            {t('planos.comecarGratis')}
          </button>
        </div>

        <div className="ia-banner">
          <div className="ia-banner-corpo">
            <div>
              <strong>{t('iaAvancada.titulo')}</strong>
              <p>{t('iaAvancada.texto')}</p>
            </div>
            <span className="tag-addon">{t('iaAvancada.selo')}</span>
          </div>
          {addons.length > 0 && (
            <div className="ia-banner-produtos">
              {addons.map((a) => {
                const emUsd = idioma !== 'pt' && cambio.usdPorBrl != null
                const preco = emUsd ? formataUsd(a.preco * cambio.usdPorBrl!) : formataReal(a.preco)
                return (
                  <div key={a.tipo} className="ia-banner-produto">
                    <span className="nome">{a.nome}</span>
                    <span className="preco">{preco}<small>/{t('unidade.mes')}</small></span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="fale-conosco">
          <span>{t('planos.duvida')}</span>
          <button className="btn grande zap-btn" onClick={() => setChatAberto(true)}>
            <IconeWhatsApp size={20} /> {t('planos.faleConosco')}
          </button>
        </div>
      </section>

      <section className="cta-final">
        <h2>{t('ctaFinal.titulo')}</h2>
        <a className="btn grande" href="#planos">{t('ctaFinal.botao')}</a>
      </section>

      {/* Botão flutuante — abre o atendimento da ZAIEZE (estilo da marca) */}
      <button className="zap-flutuante" onClick={() => setChatAberto(true)} aria-label="Fale conosco">
        <IconeWhatsApp size={28} />
      </button>

      {chatAberto && <AgenteZaieze onClose={() => setChatAberto(false)} />}

      <footer className="site-rodape">
        <div>CNPJ: 43.391.734/0001-51 · ZAIEZE · {t('footer.tagline')} © {new Date().getFullYear()}</div>
        <div><Link to="/quem-somos">{t('footer.quemSomos')}</Link> · <Link to="/lgpd">{t('footer.lgpd')}</Link> · <Link to="/privacidade">{t('footer.privacidade')}</Link> · {t('footer.pagamento')}</div>
      </footer>
    </div>
  )
}

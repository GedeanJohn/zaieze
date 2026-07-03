import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, formataReal, rotuloFeature, FEATURE_MIN, type Plano } from '../../api'
import AgenteZaieze from './AgenteZaieze'

interface PlanoCatalogo {
  plano: Plano
  nome: string
  preco: number
  limite: string
  resumo: string
}

const ORDEM: Record<Plano, number> = { START: 0, PRO: 1, ELITE: 2 }

/** Glifo oficial do WhatsApp (herda a cor via currentColor — fica no estilo da marca). */
function IconeWhatsApp({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function featuresAte(plano: Plano): string[] {
  return Object.entries(FEATURE_MIN)
    .filter(([, min]) => ORDEM[min] <= ORDEM[plano])
    .map(([f]) => rotuloFeature[f] ?? f)
}

export default function Landing() {
  const [planos, setPlanos] = useState<PlanoCatalogo[]>([])
  const [chatAberto, setChatAberto] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/assinaturas/planos').then(({ data }) => setPlanos(data.planos)).catch(() => {})
  }, [])

  return (
    <div className="site">
      <header className="site-top">
        <img className="site-logo-img" src="/zaieze-branco.png" alt="ZAIEZE" />
        <nav>
          <a href="#planos">Planos</a>
          <a href="#como">Como funciona</a>
          <Link className="btn secundario" to="/entrar">Entrar</Link>
        </nav>
      </header>

      <section className="hero">
        <img className="hero-logo" src="/zaieze-branco.png" alt="ZAIEZE" />
        <h1>Sistemas Inteligentes para a Moda</h1>
        <p>
          Organize a venda online da sua equipe pelo WhatsApp: carteira por vendedora, estoque em grade
          e IA que recupera clientes e gira o que está parado. Seu painel no ar em minutos, no seu próprio endereço.
        </p>
        <div className="hero-acoes">
          <a className="btn grande" href="#planos">Ver planos</a>
          <Link className="btn secundario grande" to="/entrar">Já sou cliente</Link>
        </div>
        <div className="hero-nota">Lojas e vendedoras ilimitadas em todos os planos · 7 dias para testar</div>
      </section>

      <section className="faixa" id="como">
        <div><strong>1. Escolha o plano</strong><span>Start, Pro ou Elite — todos sem limite de lojas ou vendedoras.</span></div>
        <div><strong>2. Crie seu endereço</strong><span>sualoja.zaieze.com fica pronto na hora do pagamento.</span></div>
        <div><strong>3. Comece a vender</strong><span>Cadastre produtos, equipe e dispare no WhatsApp.</span></div>
      </section>

      <section className="planos-site" id="planos">
        <h2>Escolha seu plano</h2>
        <p className="sub">Pague por funcionalidade, não por tamanho. Cancele quando quiser.</p>
        <div className="planos-grid">
          {planos.map((p) => (
            <div key={p.plano} className={`plano-card ${p.plano === 'PRO' ? 'destaque' : ''}`}>
              {p.plano === 'PRO' && <div className="tag">Mais popular</div>}
              <h3>{p.nome}</h3>
              <div className="preco">{formataReal(p.preco)}<span>/mês</span></div>
              <div className="limite">{p.limite}</div>
              <ul>
                {featuresAte(p.plano).map((f) => <li key={f}>{f}</li>)}
              </ul>
              <button className="btn grande" onClick={() => navigate(`/checkout?plano=${p.plano}`)}>
                Assinar {p.nome}
              </button>
            </div>
          ))}
        </div>

        <div className="fale-conosco">
          <span>Ficou com alguma dúvida sobre os planos?</span>
          <button className="btn grande zap-btn" onClick={() => setChatAberto(true)}>
            <IconeWhatsApp size={20} /> Fale Conosco!
          </button>
        </div>
      </section>

      {/* Botão flutuante — abre o atendimento da ZAIEZE (estilo da marca) */}
      <button className="zap-flutuante" onClick={() => setChatAberto(true)} aria-label="Fale conosco">
        <IconeWhatsApp size={28} />
      </button>

      {chatAberto && <AgenteZaieze onClose={() => setChatAberto(false)} />}

      <footer className="site-rodape">
        <div>CNPJ: 43.391.734/0001-51 · ZAIEZE · Sistemas Inteligentes para a Moda © {new Date().getFullYear()}</div>
        <div><Link to="/quem-somos">Quem Somos</Link> · Pagamento seguro via Mercado Pago</div>
      </footer>
    </div>
  )
}

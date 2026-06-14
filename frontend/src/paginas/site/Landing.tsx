import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, formataReal, rotuloFeature, FEATURE_MIN, type Plano } from '../../api'

interface PlanoCatalogo {
  plano: Plano
  nome: string
  preco: number
  limite: string
  resumo: string
}

const ORDEM: Record<Plano, number> = { START: 0, PRO: 1, ELITE: 2 }

function featuresAte(plano: Plano): string[] {
  return Object.entries(FEATURE_MIN)
    .filter(([, min]) => ORDEM[min] <= ORDEM[plano])
    .map(([f]) => rotuloFeature[f] ?? f)
}

export default function Landing() {
  const [planos, setPlanos] = useState<PlanoCatalogo[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/assinaturas/planos').then(({ data }) => setPlanos(data.planos)).catch(() => {})
  }, [])

  return (
    <div className="site">
      <header className="site-top">
        <div className="site-logo">zaieze<span>.</span></div>
        <nav>
          <a href="#planos">Planos</a>
          <a href="#como">Como funciona</a>
          <Link className="btn secundario" to="/entrar">Entrar</Link>
        </nav>
      </header>

      <section className="hero">
        <h1>O sistema de vendas, relacionamento e estoque<br /> feito para <em>lojas de moda</em></h1>
        <p>
          CRM com carteira por vendedora, WhatsApp integrado, estoque em grade e IA que recupera clientes
          e gira o que está parado. Seu painel no ar em minutos, no seu próprio endereço.
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
      </section>

      <footer className="site-rodape">
        <div>zaieze · ModaCRM AI © {new Date().getFullYear()}</div>
        <div>Pagamento seguro via Mercado Pago</div>
      </footer>
    </div>
  )
}

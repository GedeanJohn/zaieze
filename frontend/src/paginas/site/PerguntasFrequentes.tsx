import { useState } from 'react'
import { Link } from 'react-router-dom'

interface FaqEntrada {
  pergunta: string
  resposta: string
}

const FAQ: FaqEntrada[] = [
  {
    pergunta: 'O que é a ZAIEZE?',
    resposta:
      'Um sistema de gestão, estoque e CRM para lojas de moda (varejo e atacado), com atendimento organizado por WhatsApp — cada vendedora com a própria carteira de clientes — e IA que recupera clientes inativos e ajuda a girar o estoque parado.',
  },
  {
    pergunta: 'Como funciona a cobrança?',
    resposta:
      'Preço simples, por vendedora ativa — sem planos em camadas. O cadastro da marca é grátis (lojas, coleções e vendedoras ilimitadas) e você só paga pelas contas de vendedora que ativar, sem contrato de fidelidade. Quanto mais vendedoras, maior o desconto por volume — a calculadora na página de planos mostra o valor exato pra sua equipe.',
  },
  {
    pergunta: 'Como eu começo?',
    resposta:
      'Três passos: crie sua conta grátis (sem cartão, sem limite de lojas), seu endereço próprio (sualoja.zaieze.com) fica pronto no pagamento, e você já cadastra produtos, equipe e começa a disparar no WhatsApp.',
  },
  {
    pergunta: 'O que está incluso no sistema?',
    resposta:
      'Vendas online e físico numa operação só (WhatsApp + balcão), estoque por grade (cor/tamanho) com alerta de ruptura, WhatsApp com carteira própria por vendedora, CRM que classifica clientes automaticamente (novo, frequente, VIP, inativo), catálogo/portal do cliente com link próprio por vendedora, e tudo 100% em nuvem.',
  },
  {
    pergunta: 'Quais são os add-ons de Inteligência Artificial?',
    resposta:
      'Automações avançadas com IA são vendidas à parte, como add-on, disponíveis em qualquer plano — cobradas separadamente da assinatura por vendedora.',
  },
  {
    pergunta: 'O que é o Brand Partner?',
    resposta: 'É para quem representa marcas de moda: uma vitrine própria, com endereço só seu, para indicar lojistas e conectá-los à marca.',
  },
  {
    pergunta: 'Existe fidelidade? Posso cancelar quando quiser?',
    resposta:
      'Não há contrato de fidelidade — o cadastro da marca é grátis, sem taxa de adesão, e você só paga pelas contas de vendedora que mantiver ativas.',
  },
  {
    pergunta: 'Meus dados estão seguros?',
    resposta:
      'Sim — o ambiente é seguro e seguimos a LGPD. Os detalhes completos estão na nossa página de LGPD, linkada no rodapé.',
  },
  {
    pergunta: 'Preciso instalar algum programa?',
    resposta:
      'Não — é 100% em nuvem. Seu painel fica no ar em minutos, no seu próprio endereço (sualoja.zaieze.com), acessível de qualquer lugar.',
  },
  {
    pergunta: 'Como falo com a ZAIEZE se tiver dúvida?',
    resposta: 'Clique em "Fale Conosco" na página de planos — o atendimento abre direto pelo chat do site.',
  },
]

export default function PerguntasFrequentes() {
  const [busca, setBusca] = useState('')

  const termo = busca.trim().toLowerCase()
  const faqFiltrada = termo
    ? FAQ.filter((f) => f.pergunta.toLowerCase().includes(termo) || f.resposta.toLowerCase().includes(termo))
    : FAQ

  return (
    <div className="site">
      <header className="site-top">
        <Link to="/"><img className="site-logo-img" src="/zaieze-branco.png" alt="ZAIEZE" /></Link>
        <nav>
          <a href="/#planos">Planos</a>
          <a href="/#como">Como funciona</a>
          <Link className="btn secundario" to="/entrar">Entrar</Link>
        </nav>
      </header>

      <section className="pagina-texto">
        <h1>Perguntas Frequentes</h1>
        <p style={{ textAlign: 'center' }}>Dúvidas sobre planos, cobrança e como a ZAIEZE funciona na prática.</p>

        <div className="faq-busca">
          <input placeholder="Buscar uma pergunta..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        <div className="faq-lista">
          {faqFiltrada.length === 0 && <p className="faq-vazio">Nada encontrado — tente outro termo, ou fale com a gente pelo chat do site.</p>}
          {faqFiltrada.map((item) => (
            <details className="faq-item" key={item.pergunta}>
              <summary>{item.pergunta}</summary>
              <p>{item.resposta}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="site-rodape">
        <div>CNPJ: 43.391.734/0001-51 · ZAIEZE · Sistemas Inteligentes para a Moda © {new Date().getFullYear()}</div>
        <div>
          <Link to="/quem-somos">Quem Somos</Link> · <Link to="/lgpd">LGPD</Link> · <Link to="/privacidade">Política de Privacidade</Link> ·{' '}
          <Link to="/perguntas-frequentes">Perguntas Frequentes</Link>
        </div>
      </footer>
    </div>
  )
}

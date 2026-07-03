import { Link } from 'react-router-dom'

export default function QuemSomos() {
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
        <h1>Quem Somos</h1>
        <p>
          O mercado da moda mudou. O consumidor espera respostas imediatas, atendimento personalizado e uma
          experiência de compra cada vez mais inteligente. Foi para atender essa nova realidade que nasceu a Zaieze.
        </p>
        <p>
          Somos uma empresa de tecnologia especializada no setor da moda, construída sobre mais de 7 anos de
          estudos, pesquisas e experiência prática acompanhando de perto fabricantes, atacadistas, distribuidores e
          lojistas. Conhecemos cada etapa da operação comercial e entendemos onde as empresas perdem tempo, vendas
          e oportunidades de crescimento.
        </p>
        <p>
          Mais do que um sistema, desenvolvemos um ecossistema inteligente que conecta pessoas, processos e
          tecnologia. Unimos Inteligência Artificial, WhatsApp, CRM, automação de vendas, gestão de clientes e
          comunicação em uma única plataforma, tornando as operações mais rápidas, organizadas e eficientes.
        </p>
        <p>
          Enquanto o mercado é inundado por inúmeras ferramentas de IA, a Zaieze faz o que realmente importa:
          seleciona e integra apenas as tecnologias que geram resultados concretos para o lojista. Nosso objetivo
          não é adicionar complexidade, mas simplificar a gestão, acelerar o atendimento e aumentar as vendas.
        </p>
        <p>
          Acreditamos que a tecnologia deve trabalhar para as pessoas. Por isso, cada recurso da Zaieze foi
          desenvolvido para ajudar sua equipe a vender mais, atender melhor, fidelizar clientes e manter sua
          empresa sempre à frente da concorrência.
        </p>

        <h2>Nossa Missão</h2>
        <p>
          Transformar a forma como empresas de moda vendem, conectando inteligência, automação e relacionamento
          para criar experiências que aumentam as vendas e fortalecem as marcas.
        </p>

        <h2>Nossa Visão</h2>
        <p>
          Ser a principal plataforma inteligente para o varejo e atacado de moda da América Latina, liderando a
          transformação digital do setor.
        </p>

        <h2>Nossos Valores</h2>
        <ul>
          <li>Inovação com propósito.</li>
          <li>Simplicidade que gera resultados.</li>
          <li>Foco no sucesso do cliente.</li>
          <li>Tecnologia a serviço das pessoas.</li>
          <li>Evolução contínua.</li>
          <li>Transparência e confiança.</li>
        </ul>

        <div className="pagina-texto-lema">
          <strong>Zaieze</strong>
          <span>Conectando sua marca ao futuro. Transformando tecnologia em vendas.</span>
        </div>
      </section>

      <footer className="site-rodape">
        <div>CNPJ: 43.391.734/0001-51 · ZAIEZE · Sistemas Inteligentes para a Moda © {new Date().getFullYear()}</div>
        <div><Link to="/quem-somos">Quem Somos</Link> · <Link to="/lgpd">LGPD</Link> · <Link to="/privacidade">Política de Privacidade</Link></div>
      </footer>
    </div>
  )
}

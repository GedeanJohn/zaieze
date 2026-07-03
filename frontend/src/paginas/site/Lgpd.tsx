import { Link } from 'react-router-dom'

export default function Lgpd() {
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
        <h1>LGPD</h1>
        <p>
          A Zaieze leva a sério a proteção dos dados pessoais de quem usa a nossa plataforma — lojistas, suas
          equipes e os clientes finais atendidos por eles. Esta política explica, em linguagem simples, quais
          dados tratamos, para quê e quais direitos você tem, em conformidade com a Lei Geral de Proteção de
          Dados (Lei nº 13.709/2018 — LGPD).
        </p>

        <h2>Quem é o controlador dos dados</h2>
        <p>
          A controladora dos dados tratados na plataforma Zaieze é <strong>GEDEAN JOHN ASSESSORIA E CONSULTORIA
          EMPRESARIAL LTDA</strong>, CNPJ 43.391.734/0001-51, responsável pelo produto Zaieze — Sistemas
          Inteligentes para a Moda.
        </p>

        <h2>Quais dados coletamos</h2>
        <ul>
          <li>Dados de cadastro do lojista e da sua equipe: nome, e-mail, telefone/WhatsApp e senha (armazenada de forma criptografada).</li>
          <li>Dados da marca/loja: nome, CNPJ, endereço, logotipo e identidade visual, quando informados.</li>
          <li>Dados de clientes finais, inseridos pelo próprio lojista na carteira de vendas: nome, telefone, histórico de compras e preferências de atendimento.</li>
          <li>Conteúdo das conversas de atendimento via WhatsApp, quando a integração oficial está ativa.</li>
          <li>Dados de uso e navegação na plataforma (registros técnicos de acesso), para segurança e melhoria do serviço.</li>
          <li>Dados de pagamento da assinatura, processados diretamente pelo Mercado Pago — a Zaieze não armazena números de cartão.</li>
        </ul>

        <h2>Para que usamos esses dados</h2>
        <p>
          Usamos os dados para operar a plataforma: autenticar o acesso, viabilizar o atendimento e a gestão de
          clientes pelo WhatsApp, gerar relatórios e recomendações para o lojista, processar a cobrança recorrente
          da assinatura, enviar comunicações essenciais (como a senha provisória em caso de "esqueci minha senha")
          e cumprir obrigações legais e contratuais.
        </p>

        <h2>Com quem compartilhamos dados</h2>
        <p>
          Compartilhamos dados apenas com prestadores de serviço estritamente necessários para o funcionamento da
          plataforma: <strong>Mercado Pago</strong> (processamento de pagamentos), <strong>Meta/WhatsApp Business
          Platform</strong> (envio e recebimento de mensagens pelo número oficial) e provedores de infraestrutura e
          armazenamento em nuvem. Não vendemos nem alugamos dados pessoais a terceiros.
        </p>

        <h2>Seus direitos como titular</h2>
        <p>Conforme o art. 18 da LGPD, você pode solicitar, a qualquer momento:</p>
        <ul>
          <li>Confirmação da existência de tratamento dos seus dados.</li>
          <li>Acesso, correção ou atualização dos seus dados.</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade.</li>
          <li>Portabilidade dos dados a outro fornecedor de serviço.</li>
          <li>Eliminação dos dados tratados com consentimento, quando aplicável.</li>
          <li>Informação sobre com quem seus dados são compartilhados.</li>
          <li>Revogação do consentimento, quando o tratamento se basear nele.</li>
        </ul>

        <h2>Segurança e retenção</h2>
        <p>
          Adotamos controles de acesso por papel (cada pessoa só vê o que precisa), senhas armazenadas com hash
          criptográfico, conexões criptografadas (HTTPS) e segredos de integração cifrados em repouso. Os dados
          são mantidos enquanto a conta estiver ativa e pelo prazo necessário ao cumprimento de obrigações legais
          após o encerramento. Dados sensíveis de finalidade específica e temporária são expurgados automaticamente
          assim que cumprem seu propósito.
        </p>

        <h2>Fale conosco</h2>
        <p>
          Para exercer qualquer um dos direitos acima ou tirar dúvidas sobre esta política, entre em contato pelo
          botão "Fale Conosco" (WhatsApp) disponível na página inicial do site.
        </p>

        <div className="pagina-texto-lema">
          <span>
            Leia o texto completo da lei: <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" target="_blank" rel="noreferrer">
              Lei nº 13.709/2018 — Lei Geral de Proteção de Dados (LGPD)
            </a>
          </span>
        </div>
      </section>

      <footer className="site-rodape">
        <div>CNPJ: 43.391.734/0001-51 · ZAIEZE · Sistemas Inteligentes para a Moda © {new Date().getFullYear()}</div>
        <div><Link to="/quem-somos">Quem Somos</Link> · <Link to="/lgpd">LGPD</Link> · <Link to="/privacidade">Política de Privacidade</Link></div>
      </footer>
    </div>
  )
}

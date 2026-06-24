/**
 * Manual do Gestor — documentação in-app das funcionalidades do Portal do Cliente:
 * coleções, catálogo/link, funil de vendas, SLA por etapa e identidade da marca.
 * Marca d'água ZAIEZE no fundo das páginas (inclui impressão).
 */
export default function Manual() {
  return (
    <div className="manual-root">
      <ManualEstilos />
      <header className="manual-cabecalho">
        <div>
          <h1>Manual do Gestor</h1>
          <p>Portal do Cliente · catálogo, funil de vendas e identidade da marca</p>
        </div>
        <button className="btn" onClick={() => window.print()}>🖨️ Imprimir / PDF</button>
      </header>

      <section className="manual-secao">
        <h2>1. Coleções e liberação</h2>
        <p>A coleção é a unidade onde as peças (modelo, estampa, tamanho) ficam agrupadas. Ela tem dois estados:</p>
        <ul>
          <li><strong>Em preparação</strong> — o gestor de estoque está cadastrando as peças. Ficam <strong>invisíveis</strong> para as vendedoras (não aparecem no PDV nem no catálogo).</li>
          <li><strong>Liberada</strong> — o gestor de estoque clica em <em>liberar</em> e a coleção passa a aparecer para <strong>todas as vendedoras ao mesmo tempo</strong>.</li>
        </ul>
        <p className="manual-nota">Por que simultâneo? As vendedoras disputam o mesmo estoque. Liberar para todas no mesmo instante garante competição justa — ninguém larga na frente.</p>
        <p><strong>Onde:</strong> menu <em>Coleções</em>. O gestor de estoque cria, cadastra as peças em <em>Produtos</em> e depois libera.</p>
      </section>

      <section className="manual-secao">
        <h2>2. Catálogo e link da vendedora</h2>
        <p>Cada vendedora tem um link próprio do catálogo, no formato:</p>
        <p className="manual-url">suamarca.zaieze.com/nome-da-vendedora</p>
        <ul>
          <li>A vendedora compartilha o link com a carteira de clientes dela.</li>
          <li>Quem abre vê as coleções liberadas (estética de loja) e, ao tocar em <strong>“Falar com a vendedora”</strong>, é direcionado para o <strong>WhatsApp dela</strong>.</li>
          <li>Esse contato vira o <strong>ponto de entrada no CRM</strong>: o cliente entra na carteira da vendedora e abre uma oportunidade no funil.</li>
        </ul>
        <p><strong>Onde:</strong> menu <em>Funil de vendas</em> → “Links das vendedoras” (copiar e distribuir).</p>
      </section>

      <section className="manual-secao">
        <h2>3. Funil de atendimento &amp; vendas</h2>
        <p>Cada ciclo de contato é uma <strong>oportunidade</strong> independente. Um mesmo cliente pode ter várias ao longo do tempo (perdeu hoje, volta depois = nova oportunidade). As etapas:</p>
        <ol>
          <li><strong>Entrou</strong> — chegou pelo catálogo; aguardando a 1ª resposta.</li>
          <li><strong>Atendido</strong> — a vendedora respondeu (atender = responder).</li>
          <li><strong>Negociando</strong> — atendimento ativo em andamento.</li>
          <li><strong>Convertido</strong> — virou venda (automático ao registrar a venda do cliente) ou marcado à mão.</li>
          <li><strong>Perdido</strong> — encerrado sem compra. O cliente pode reentrar e abrir um novo ciclo.</li>
        </ol>
        <p className="manual-nota">Reentrada: se já existe um ciclo aberto, ele é reaproveitado; se todos estão fechados, abre-se um novo ciclo.</p>
        <p><strong>Onde:</strong> menu <em>Funil de vendas</em> — quadro Kanban com métricas (abertos, atrasados, convertidos, taxa de conversão e tempo médio de 1ª resposta).</p>
      </section>

      <section className="manual-secao">
        <h2>4. SLA por etapa e redistribuição</h2>
        <p>Você define o <strong>tempo máximo</strong> que uma oportunidade pode ficar em cada etapa. Estourou o prazo, o card aparece como <strong>atrasado</strong>.</p>
        <ul>
          <li><strong>Entrou:</strong> prazo para a 1ª resposta. Ao estourar, o gestor pode redistribuir (ou o sistema redistribui sozinho, se a opção estiver ligada) para a vendedora mais ociosa.</li>
          <li><strong>Atendido / Negociando:</strong> prazos para avançar; sinalizam oportunidades paradas.</li>
        </ul>
        <p>Redistribuir move a oportunidade e a carteira do cliente para outra vendedora e reinicia o prazo. Use o botão <em>↪</em> no card ou <em>Redistribuir atrasados</em>.</p>
        <p><strong>Onde:</strong> menu <em>Marca</em> (configura os prazos e a redistribuição automática).</p>
      </section>

      <section className="manual-secao">
        <h2>5. Identidade da marca</h2>
        <p>A logo e as cores definidas aqui aparecem no catálogo público que as vendedoras compartilham.</p>
        <ul>
          <li><strong>Logo:</strong> envie um arquivo (PNG, JPG, WEBP ou SVG, até 5&nbsp;MB).</li>
          <li><strong>Cores:</strong> cor primária (botões/CTA) e cor de fundo.</li>
        </ul>
        <p><strong>Onde:</strong> menu <em>Marca</em>.</p>
      </section>

      <footer className="manual-rodape">ZAIEZE · Sistemas Inteligentes para a Moda</footer>
    </div>
  )
}

function ManualEstilos() {
  return (
    <style>{`
      .manual-root { position: relative; max-width: 880px; }
      /* Marca d'água ZAIEZE repetida no fundo (tela e impressão) */
      .manual-root::before {
        content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
        background-image: url('/zaieze-branco.png');
        background-repeat: repeat; background-size: 200px; background-position: center;
        opacity: 0.04;
      }
      .manual-root > * { position: relative; z-index: 1; }
      .manual-cabecalho { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
      .manual-cabecalho h1 { margin: 0; }
      .manual-cabecalho p { margin: 4px 0 0; color: var(--ink-soft); font-size: 13px; }
      .manual-secao { background: var(--cartao, #ffffff0a); border-radius: 12px; padding: 18px 22px; margin: 14px 0; }
      .manual-secao h2 { margin-top: 0; font-size: 18px; }
      .manual-secao ul, .manual-secao ol { margin: 8px 0; padding-left: 20px; line-height: 1.7; }
      .manual-secao p { line-height: 1.6; }
      .manual-nota { background: #ffffff10; border-left: 3px solid #e8a87c; padding: 8px 12px; border-radius: 6px; font-size: 13px; color: var(--ink-soft); }
      .manual-url { font-family: monospace; background: #0003; display: inline-block; padding: 6px 12px; border-radius: 8px; }
      .manual-rodape { text-align: center; color: var(--ink-soft); font-size: 12px; padding: 24px 0; }
      @media print {
        .sidebar, .aviso-encerramento, .manual-cabecalho .btn { display: none !important; }
        .manual-root::before { opacity: 0.08; background-image: url('/zaieze-preto.png'); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .manual-secao { break-inside: avoid; background: none; border: 1px solid #ddd; }
        body, .conteudo { background: #fff !important; color: #000 !important; }
      }
    `}</style>
  )
}

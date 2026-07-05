import { useIdioma } from '../lib/i18n'

/**
 * Manual do Gestor — documentação in-app das funcionalidades do Portal do Cliente:
 * coleções, catálogo/link, funil de vendas, SLA por etapa e identidade da marca.
 * Marca d'água ZAIEZE no fundo das páginas (inclui impressão).
 */
export default function Manual() {
  const { t } = useIdioma()
  return (
    <div className="manual-root">
      <ManualEstilos />
      <header className="manual-cabecalho">
        <div>
          <h1>{t('manual.titulo')}</h1>
          <p>{t('manual.subtitulo')}</p>
        </div>
        <button className="btn" onClick={() => window.print()}>{t('manual.imprimir')}</button>
      </header>

      <section className="manual-secao">
        <h2>{t('manual.s1.titulo')}</h2>
        <p>{t('manual.s1.p1')}</p>
        <ul>
          <li><strong>{t('manual.s1.li1a')}</strong> {t('manual.s1.li1b')} <strong>{t('manual.s1.li1c')}</strong> {t('manual.s1.li1d')}</li>
          <li><strong>{t('manual.s1.li2a')}</strong> {t('manual.s1.li2b')} <em>{t('manual.s1.li2c')}</em> {t('manual.s1.li2d')} <strong>{t('manual.s1.li2e')}</strong>{t('manual.s1.li2f')}</li>
        </ul>
        <p className="manual-nota">{t('manual.s1.nota')}</p>
        <p><strong>{t('manual.s1.onde1')}</strong> {t('manual.s1.onde2')} <em>{t('manual.s1.onde3')}</em>{t('manual.s1.onde4')} <em>{t('manual.s1.onde5')}</em> {t('manual.s1.onde6')}</p>
      </section>

      <section className="manual-secao">
        <h2>{t('manual.s2.titulo')}</h2>
        <p>{t('manual.s2.p1')}</p>
        <p className="manual-url">suamarca.zaieze.com/nome-da-vendedora</p>
        <ul>
          <li>{t('manual.s2.li1')}</li>
          <li>{t('manual.s2.li2a')} <strong>{t('manual.s2.li2b')}</strong>{t('manual.s2.li2c')} <strong>{t('manual.s2.li2d')}</strong>{t('manual.s2.li2e')}</li>
          <li>{t('manual.s2.li3a')} <strong>{t('manual.s2.li3b')}</strong>{t('manual.s2.li3c')}</li>
        </ul>
        <p><strong>{t('manual.s2.onde1')}</strong> {t('manual.s2.onde2')} <em>{t('manual.s2.onde3')}</em> {t('manual.s2.onde4')}</p>
      </section>

      <section className="manual-secao">
        <h2>{t('manual.s3.titulo')}</h2>
        <p>{t('manual.s3.p1a')} <strong>{t('manual.s3.p1b')}</strong> {t('manual.s3.p1c')}</p>
        <ol>
          <li><strong>{t('manual.s3.li1a')}</strong> {t('manual.s3.li1b')}</li>
          <li><strong>{t('manual.s3.li2a')}</strong> {t('manual.s3.li2b')}</li>
          <li><strong>{t('manual.s3.li3a')}</strong> {t('manual.s3.li3b')}</li>
          <li><strong>{t('manual.s3.li4a')}</strong> {t('manual.s3.li4b')}</li>
          <li><strong>{t('manual.s3.li5a')}</strong> {t('manual.s3.li5b')}</li>
        </ol>
        <p className="manual-nota">{t('manual.s3.nota')}</p>
        <p><strong>{t('manual.s3.onde1')}</strong> {t('manual.s3.onde2')} <em>{t('manual.s3.onde3')}</em> {t('manual.s3.onde4')}</p>
      </section>

      <section className="manual-secao">
        <h2>{t('manual.s4.titulo')}</h2>
        <p>{t('manual.s4.p1a')} <strong>{t('manual.s4.p1b')}</strong> {t('manual.s4.p1c')} <strong>{t('manual.s4.p1d')}</strong>{t('manual.s4.p1e')}</p>
        <ul>
          <li><strong>{t('manual.s4.li1a')}</strong> {t('manual.s4.li1b')}</li>
          <li><strong>{t('manual.s4.li2a')}</strong> {t('manual.s4.li2b')}</li>
        </ul>
        <p>{t('manual.s4.p2a')} <em>{t('manual.s4.p2b')}</em> {t('manual.s4.p2c')} <em>{t('manual.s4.p2d')}</em>{t('manual.s4.p2e')}</p>
        <p><strong>{t('manual.s4.onde1')}</strong> {t('manual.s4.onde2')} <em>{t('manual.s4.onde3')}</em> {t('manual.s4.onde4')}</p>
      </section>

      <section className="manual-secao">
        <h2>{t('manual.s5.titulo')}</h2>
        <p>{t('manual.s5.p1')}</p>
        <ul>
          <li><strong>{t('manual.s5.li1a')}</strong> {t('manual.s5.li1b')}</li>
          <li><strong>{t('manual.s5.li2a')}</strong> {t('manual.s5.li2b')}</li>
        </ul>
        <p><strong>{t('manual.s5.onde1')}</strong> {t('manual.s5.onde2')} <em>{t('manual.s5.onde3')}</em>{t('manual.s5.onde4')}</p>
      </section>

      <section className="manual-secao">
        <h2>{t('manual.s6.titulo')}</h2>
        <p>{t('manual.s6.p1a')} <strong>{t('manual.s6.p1b')}</strong> {t('manual.s6.p1c')} <strong>{t('manual.s6.p1d')}</strong> {t('manual.s6.p1e')}</p>
        <ul>
          <li>{t('manual.s6.li1a')} <strong>{t('manual.s6.li1b')}</strong>{t('manual.s6.li1c')} <strong>{t('manual.s6.li1d')}</strong>{t('manual.s6.li1e')} <strong>{t('manual.s6.li1f')}</strong> {t('manual.s6.li1g')} <strong>{t('manual.s6.li1h')}</strong> {t('manual.s6.li1i')}</li>
          <li><strong>{t('manual.s6.li2a')}</strong> {t('manual.s6.li2b')} <em>{t('manual.s6.li2c')}</em>{t('manual.s6.li2d')}<em>{t('manual.s6.li2e')}</em> {t('manual.s6.li2f')}</li>
          <li>{t('manual.s6.li3a')} <strong>{t('manual.s6.li3b')}</strong> {t('manual.s6.li3c')}</li>
        </ul>
        <p className="manual-nota">{t('manual.s6.nota1')} <em>{t('manual.s6.nota2')}</em>{t('manual.s6.nota3')}</p>
        <p><strong>{t('manual.s6.onde1')}</strong> {t('manual.s6.onde2')} <em>{t('manual.s6.onde3')}</em> {t('manual.s6.onde4')}</p>
      </section>

      <section className="manual-secao">
        <h2>{t('manual.s7.titulo')}</h2>
        <p>{t('manual.s7.p1a')} <strong>{t('manual.s7.p1b')}</strong> {t('manual.s7.p1c')}</p>
        <ul>
          <li>{t('manual.s7.li1a')} <strong>{t('manual.s7.li1b')}</strong> {t('manual.s7.li1c')} <strong>{t('manual.s7.li1d')}</strong>{t('manual.s7.li1e')}</li>
          <li>{t('manual.s7.li2a')} <strong>{t('manual.s7.li2b')}</strong> {t('manual.s7.li2c')}</li>
          <li>{t('manual.s7.li3a')} <strong>{t('manual.s7.li3b')}</strong> {t('manual.s7.li3c')}</li>
        </ul>
        <p><strong>{t('manual.s7.onde1')}</strong> {t('manual.s7.onde2')} <em>{t('manual.s7.onde3')}</em>{t('manual.s7.onde4')}</p>
      </section>

      <section className="manual-secao">
        <h2>{t('manual.s8.titulo')}</h2>
        <p>{t('manual.s8.p1')}</p>
        <ul>
          <li><strong>{t('manual.s8.li1a')}</strong> {t('manual.s8.li1b')}</li>
          <li><strong>{t('manual.s8.li2a')}</strong> {t('manual.s8.li2b')}</li>
          <li>{t('manual.s8.li3a')} <strong>{t('manual.s8.li3b')}</strong> {t('manual.s8.li3c')}</li>
        </ul>
      </section>

      <footer className="manual-rodape">ZAIEZE · {t('footer.tagline')}</footer>
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

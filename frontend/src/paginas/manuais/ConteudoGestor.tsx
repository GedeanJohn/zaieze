import { useIdioma } from '../../lib/i18n'

/** Seções do manual do Gestor — mesmo conteúdo (chaves `manual.s*`) usado pela página impressa /manual. */
export default function ConteudoGestor() {
  const { t } = useIdioma()
  return (
    <>
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
    </>
  )
}

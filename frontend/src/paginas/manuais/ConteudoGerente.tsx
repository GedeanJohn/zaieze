import { useIdioma } from '../../lib/i18n'

interface Secao { chave: string; itens: string[]; nota?: boolean; onde?: boolean }

const SECOES: Secao[] = [
  { chave: 's1', itens: ['li1', 'li2'], nota: true },
  { chave: 's2', itens: ['li1', 'li2'], onde: true },
  { chave: 's3', itens: ['li1', 'li2'] },
  { chave: 's4', itens: ['li1', 'li2'], onde: true },
  { chave: 's5', itens: ['li1', 'li2'] },
  { chave: 's6', itens: ['li1', 'li2'] },
]

/** Manual do Gerente de Loja — papel duplo: vende e acompanha a equipe da loja. */
export default function ConteudoGerente() {
  const { t } = useIdioma()
  return (
    <>
      {SECOES.map((s) => (
        <section className="manual-secao" key={s.chave}>
          <h2>{t(`manual.ger.${s.chave}.titulo`)}</h2>
          <ul>
            {s.itens.map((i) => <li key={i}>{t(`manual.ger.${s.chave}.${i}`)}</li>)}
          </ul>
          {s.nota && <p className="manual-nota">{t(`manual.ger.${s.chave}.nota`)}</p>}
          {s.onde && <p>{t(`manual.ger.${s.chave}.onde`)}</p>}
        </section>
      ))}
    </>
  )
}

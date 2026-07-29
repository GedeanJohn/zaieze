import { useIdioma } from '../../lib/i18n'

interface Secao { chave: string; itens: string[]; nota?: boolean; onde?: boolean }

const SECOES: Secao[] = [
  { chave: 's1', itens: ['li1', 'li2', 'li3'], nota: true },
  { chave: 's2', itens: ['li1', 'li2', 'li3'] },
  { chave: 's3', itens: ['li1', 'li2', 'li3'], nota: true },
  { chave: 's4', itens: ['li1', 'li2', 'li3'], onde: true },
  { chave: 's5', itens: ['li1', 'li2', 'li3'] },
  { chave: 's6', itens: ['li1', 'li2', 'li3'], nota: true },
  { chave: 's7', itens: ['li1', 'li2', 'li3'] },
]

/** Manual da Vendedora — link do catálogo, funil e Chat Zaieze. */
export default function ConteudoVendedora() {
  const { t } = useIdioma()
  return (
    <>
      {SECOES.map((s) => (
        <section className="manual-secao" key={s.chave}>
          <h2>{t(`manual.vend.${s.chave}.titulo`)}</h2>
          <ul>
            {s.itens.map((i) => <li key={i}>{t(`manual.vend.${s.chave}.${i}`)}</li>)}
          </ul>
          {s.nota && <p className="manual-nota">{t(`manual.vend.${s.chave}.nota`)}</p>}
          {s.onde && <p>{t(`manual.vend.${s.chave}.onde`)}</p>}
        </section>
      ))}
    </>
  )
}

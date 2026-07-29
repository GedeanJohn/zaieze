import { useIdioma } from '../../lib/i18n'

interface Secao { chave: string; itens: string[]; nota?: boolean; onde?: boolean }

const SECOES: Secao[] = [
  { chave: 's1', itens: ['li1', 'li2', 'li3'] },
  { chave: 's2', itens: ['li1', 'li2', 'li3'] },
  { chave: 's3', itens: ['li1', 'li2'], nota: true },
  { chave: 's4', itens: ['li1', 'li2', 'li3'] },
  { chave: 's5', itens: ['li1', 'li2'] },
  { chave: 's6', itens: ['li1', 'li2', 'li3'], onde: true },
]

/** Manual do Gestor de Estoque — coleções: do cadastro à liberação. */
export default function ConteudoEstoquista() {
  const { t } = useIdioma()
  return (
    <>
      {SECOES.map((s) => (
        <section className="manual-secao" key={s.chave}>
          <h2>{t(`manual.estq.${s.chave}.titulo`)}</h2>
          <ul>
            {s.itens.map((i) => <li key={i}>{t(`manual.estq.${s.chave}.${i}`)}</li>)}
          </ul>
          {s.nota && <p className="manual-nota">{t(`manual.estq.${s.chave}.nota`)}</p>}
          {s.onde && <p>{t(`manual.estq.${s.chave}.onde`)}</p>}
        </section>
      ))}
    </>
  )
}

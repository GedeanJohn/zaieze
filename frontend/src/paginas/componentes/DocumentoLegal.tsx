import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../../api'
import { useIdioma } from '../../lib/i18n'

interface SecaoDocumento { n: number; titulo: string; itens: (string | string[])[] }
interface ItemHistorico { versao: string; publicadoEm: string; mudancas: string[] }
interface DocumentoMontado {
  versao: string
  titulo: string
  atualizadoEm: string
  secoes: SecaoDocumento[]
  aceite: { aceitoEm: string; ip: string | null; versao: string } | null
  historico: ItemHistorico[]
}
interface RespostaDocumento {
  aceito: boolean
  pendente: boolean
  versao: string
  [campo: string]: unknown
}

/**
 * Página de leitura de um documento legal (Política de Privacidade / Termos de Uso).
 * Diferente do Contrato SaaS (aceite por clique em /contrato), aqui não há botão: o
 * aceite de uma nova versão é registrado automaticamente pelo Layout no 1º uso do
 * painel após a publicação — esta tela só exibe o texto e o changelog ("o que mudou").
 */
export default function DocumentoLegal({ apiBase, campo, prefixoI18n }: { apiBase: string; campo: string; prefixoI18n: string }) {
  const { t, idioma } = useIdioma()
  const [dados, setDados] = useState<RespostaDocumento | null>(null)
  const [erro, setErro] = useState('')
  const [historicoAberto, setHistoricoAberto] = useState(false)

  useEffect(() => {
    api.get(`${apiBase}/meu`, { params: { idioma } }).then(({ data }) => setDados(data)).catch((e) => setErro(mensagemDeErro(e)))
  }, [apiBase, idioma])

  if (erro && !dados) return <div className="cartao alerta">{erro}</div>
  if (!dados) return <div className="cartao">{t(`${prefixoI18n}.carregando`)}</div>

  const doc = dados[campo] as DocumentoMontado

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1>{t(`${prefixoI18n}.titulo`)}</h1>
        <span className={`selo ${dados.aceito ? 'ok' : 'ATACADO'}`}>
          {dados.aceito ? t(`${prefixoI18n}.aceito`) : t(`${prefixoI18n}.aceitandoAutomaticamente`)}
        </span>
      </header>

      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        {t(`${prefixoI18n}.usoImplicaAceite`)}
      </div>

      {doc.historico.length > 0 && (
        <div className="cartao">
          <button type="button" className="btn-link" onClick={() => setHistoricoAberto((v) => !v)}>
            {historicoAberto ? t(`${prefixoI18n}.ocultarMudancas`) : t(`${prefixoI18n}.verMudancas`)}
          </button>
          {historicoAberto && (
            <div style={{ marginTop: 10 }}>
              {doc.historico.map((h) => (
                <div key={h.versao} style={{ marginBottom: 10 }}>
                  <strong>{t(`${prefixoI18n}.versaoLabel`)} {h.versao}</strong>{' '}
                  <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>· {h.publicadoEm}</span>
                  <ul style={{ margin: '4px 0 0 18px' }}>
                    {h.mudancas.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="cartao" style={{ maxHeight: '58vh', overflowY: 'auto', lineHeight: 1.65, fontSize: 14 }}>
        <h2 style={{ marginTop: 0 }}>{doc.titulo}</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
          {t(`${prefixoI18n}.atualizadoEmLabel`)} {doc.atualizadoEm} · {t(`${prefixoI18n}.versaoLabel`)} {doc.versao}
          {doc.aceite && <> · {t(`${prefixoI18n}.aceitoEmSufixo`)} {new Date(doc.aceite.aceitoEm).toLocaleString('pt-BR')}{doc.aceite.ip ? ` · ${t(`${prefixoI18n}.ipSufixo`)} ${doc.aceite.ip}` : ''}</>}
        </div>

        {doc.secoes.map((sec) => (
          <div key={sec.n} style={{ marginTop: 14 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{sec.n}. {sec.titulo}</h3>
            {sec.itens.map((item, i) => (
              Array.isArray(item)
                ? <ul key={i} style={{ margin: '4px 0 8px 18px' }}>{item.map((li, j) => <li key={j} style={{ margin: '2px 0' }}>{li}</li>)}</ul>
                : <p key={i} style={{ textAlign: 'justify', margin: '4px 0' }}>{item}</p>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

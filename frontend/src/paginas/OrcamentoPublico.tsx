import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, formataReal, mensagemDeErro } from '../api'
import SeletorIdioma from '../componentes/SeletorIdioma'
import { useIdioma } from '../lib/i18n'

interface ItemPub {
  quantidade: number
  precoUnitario: string
  variacao: { cor: string; estampa: string; tamanho: string; produto: { nome: string; referencia: string | null; fotos: string[] } }
}
interface OrcPublico {
  id: string
  status: string
  atacado: boolean
  descontoPct: string
  total: string
  observacao?: string | null
  cliente: { nome: string }
  vendedora: { nome: string }
  loja: { nome: string; rede: { nome: string; logoUrl: string | null } }
  itens: ItemPub[]
}

const real = (v: number | string) => formataReal(Number(v))

export default function OrcamentoPublico() {
  const { token } = useParams<{ token: string }>()
  const { t } = useIdioma()
  const [o, setO] = useState<OrcPublico | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<'aprovado' | 'alteracao' | null>(null)
  const [vendaLink, setVendaLink] = useState('')
  const [mostrarAlteracao, setMostrarAlteracao] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api.get(`/orcamentos/publico/${token}`)
      .then(({ data }) => setO(data))
      .catch(() => setErro(t('orcPub.naoEncontrado')))
      .finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function aprovar() {
    setEnviando(true); setErro('')
    try {
      const { data } = await api.post(`/orcamentos/publico/${token}/aprovar`, {})
      if (data.venda?.tokenPublico) setVendaLink(`${window.location.origin}/pedido/publico/${data.venda.tokenPublico}`)
      setResultado('aprovado')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }

  async function enviarAlteracao(e: React.FormEvent) {
    e.preventDefault()
    if (!mensagem.trim()) return
    setEnviando(true); setErro('')
    try {
      await api.post(`/orcamentos/publico/${token}/solicitar-alteracao`, { mensagem: mensagem.trim() })
      setResultado('alteracao')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="orc-root">
      <OrcamentoEstilos />
      <div className="orc-acoes orc-noprint"><SeletorIdioma /></div>

      {carregando && <div className="orc-vazio">{t('orcPub.carregando')}</div>}
      {!carregando && erro && !o && <div className="orc-vazio">{erro}</div>}

      {o && (
        <div className="orc-folha">
          <header className="orc-cab">
            <div>
              {o.loja.rede.logoUrl
                ? <img className="orc-logo" src={o.loja.rede.logoUrl} alt={o.loja.rede.nome} />
                : <div className="orc-marca">{o.loja.rede.nome}</div>}
              <div className="orc-loja">{o.loja.nome}</div>
            </div>
            <div className="orc-num">
              <div><strong>{t('orcPub.orcamentoLabel')}</strong></div>
              <span className={`orc-tag ${o.atacado ? 'ata' : ''}`}>{o.atacado ? t('ped.atacado') : t('ped.varejo')}</span>
            </div>
          </header>

          <section className="orc-partes">
            <div>
              <div className="orc-rot">{t('ped.clienteLabel')}</div>
              <div>{o.cliente.nome}</div>
            </div>
            <div>
              <div className="orc-rot">{t('ped.vendedoraLabel')}</div>
              <div>{o.vendedora.nome}</div>
            </div>
          </section>

          <table className="orc-tab">
            <thead>
              <tr><th></th><th>{t('ped.colProduto')}</th><th>{t('ped.colVariacao')}</th><th className="r">{t('ped.colQtd')}</th><th className="r">{t('ped.colPreco')}</th><th className="r">{t('ped.colSubtotal')}</th></tr>
            </thead>
            <tbody>
              {o.itens.map((i, idx) => (
                <tr key={idx}>
                  <td>{i.variacao.produto.fotos?.[0] ? <img className="orc-mini" src={i.variacao.produto.fotos[0]} alt="" /> : <div className="orc-mini vazio" />}</td>
                  <td>{i.variacao.produto.nome}</td>
                  <td>{[i.variacao.cor, i.variacao.estampa, i.variacao.tamanho].filter(Boolean).join(' / ')}</td>
                  <td className="r">{i.quantidade}</td>
                  <td className="r">{real(i.precoUnitario)}</td>
                  <td className="r">{real(Number(i.precoUnitario) * i.quantidade)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="orc-totais">
            {Number(o.descontoPct) > 0 && <div className="d"><span>{t('ped.descontoLabel', { pct: o.descontoPct })}</span></div>}
            <div className="t"><span>{t('ped.totalLabel')}</span><span>{real(o.total)}</span></div>
          </div>
          {o.observacao && <div className="orc-obs"><strong>{t('ped.observacoesLabel')}</strong> {o.observacao}</div>}

          {o.status !== 'ENVIADO' ? (
            <div className="orc-status-fechado">
              {o.status === 'CONVERTIDO' ? `✅ ${t('orcPub.jaAprovado')}` : o.status === 'ALTERACAO_SOLICITADA' ? t('orcPub.aguardandoVendedora') : t('orcPub.indisponivel')}
            </div>
          ) : resultado === 'aprovado' ? (
            <div className="orc-confirmado">
              <div className="orc-confirmado-icone">✅</div>
              <strong>{t('orcPub.aprovadoTitulo')}</strong>
              <p>{t('orcPub.aprovadoTexto')}</p>
              {vendaLink && <a className="orc-btn" href={vendaLink} target="_blank" rel="noreferrer">{t('orcPub.verPedido')}</a>}
            </div>
          ) : resultado === 'alteracao' ? (
            <div className="orc-confirmado">
              <div className="orc-confirmado-icone">💬</div>
              <strong>{t('orcPub.alteracaoTitulo')}</strong>
              <p>{t('orcPub.alteracaoTexto')}</p>
            </div>
          ) : mostrarAlteracao ? (
            <form className="orc-form-alteracao" onSubmit={enviarAlteracao}>
              {erro && <div className="orc-alerta">{erro}</div>}
              <label>{t('orcPub.oQueMudar')}</label>
              <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} autoFocus required />
              <div className="orc-acoes-form">
                <button type="button" className="orc-btn cinza" onClick={() => setMostrarAlteracao(false)}>{t('comum.cancelar')}</button>
                <button className="orc-btn" disabled={enviando || !mensagem.trim()}>{enviando ? '…' : t('orcPub.enviarPedido')}</button>
              </div>
            </form>
          ) : (
            <>
              {erro && <div className="orc-alerta">{erro}</div>}
              <div className="orc-acoes-principais">
                <button className="orc-btn cinza" onClick={() => setMostrarAlteracao(true)} disabled={enviando}>{t('orcPub.solicitarAlteracoes')}</button>
                <button className="orc-btn verde" onClick={aprovar} disabled={enviando}>{enviando ? '…' : t('orcPub.aprovarOrcamento')}</button>
              </div>
            </>
          )}

          <footer className="orc-pe">{o.loja.rede.nome} · {t('ped.poweredBy')}</footer>
        </div>
      )}
    </div>
  )
}

function OrcamentoEstilos() {
  return (
    <style>{`
      .orc-root { background: #f3f3f3; min-height: 100vh; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; }
      .orc-acoes { max-width: 760px; margin: 0 auto 14px; display: flex; justify-content: flex-end; }
      .orc-vazio { max-width: 760px; margin: 60px auto; text-align: center; color: #777; }
      .orc-folha { max-width: 760px; margin: 0 auto; background: #fff; padding: 34px; border-radius: 8px; box-shadow: 0 4px 20px #00000014; }
      .orc-cab { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 14px; }
      .orc-logo { max-height: 56px; max-width: 200px; object-fit: contain; }
      .orc-marca { font-size: 24px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
      .orc-loja { font-size: 13px; color: #666; margin-top: 4px; }
      .orc-num { text-align: right; font-size: 14px; }
      .orc-tag { font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 99px; background: #eee; color: #555; }
      .orc-tag.ata { background: #111; color: #fff; }
      .orc-partes { display: flex; gap: 40px; margin: 18px 0; font-size: 14px; }
      .orc-rot { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #999; margin-bottom: 2px; }
      .orc-tab { width: 100%; border-collapse: collapse; font-size: 13px; }
      .orc-tab th { text-align: left; border-bottom: 1px solid #ddd; padding: 8px 6px; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
      .orc-tab td { padding: 8px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
      .orc-tab .r { text-align: right; }
      .orc-mini { width: 40px; height: 52px; object-fit: cover; border-radius: 4px; }
      .orc-mini.vazio { background: #eee; }
      .orc-totais { margin-top: 16px; text-align: right; font-size: 14px; }
      .orc-totais .d { color: #c62828; }
      .orc-totais .t { font-size: 22px; font-weight: 800; border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; display: flex; justify-content: space-between; }
      .orc-obs { margin-top: 18px; font-size: 13px; background: #faf7f2; border-radius: 6px; padding: 10px 12px; }
      .orc-status-fechado { margin-top: 26px; text-align: center; color: #777; font-size: 15px; padding: 20px; background: #fafafa; border-radius: 8px; }
      .orc-acoes-principais { display: flex; gap: 12px; margin-top: 26px; }
      .orc-btn { flex: 1; text-align: center; background: #111; color: #fff; border: none; padding: 14px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 15px; text-decoration: none; display: inline-block; }
      .orc-btn.verde { background: #1f9d55; }
      .orc-btn.cinza { background: #e9e9e9; color: #333; }
      .orc-alerta { margin: 12px 0; background: #fdeaea; color: #b3261e; border-radius: 8px; padding: 10px 14px; font-size: 13px; }
      .orc-form-alteracao { margin-top: 24px; display: flex; flex-direction: column; gap: 8px; }
      .orc-form-alteracao label { font-size: 13px; font-weight: 600; color: #444; }
      .orc-form-alteracao textarea { font-family: inherit; font-size: 14px; padding: 10px 12px; border-radius: 8px; border: 1px solid #ddd; resize: vertical; }
      .orc-acoes-form { display: flex; gap: 10px; justify-content: flex-end; }
      .orc-confirmado { margin-top: 26px; text-align: center; padding: 28px 16px; background: #f7faf7; border-radius: 10px; }
      .orc-confirmado-icone { font-size: 40px; margin-bottom: 8px; }
      .orc-confirmado p { color: #666; font-size: 14px; margin: 8px 0 16px; }
      .orc-pe { text-align: center; color: #bbb; font-size: 11px; margin-top: 24px; }
      @media (max-width: 640px) {
        .orc-folha { padding: 20px 16px; }
        .orc-acoes-principais { flex-direction: column; }
      }
    `}</style>
  )
}

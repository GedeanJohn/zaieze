import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { api, formataReal, mensagemDeErro, usuarioLogado, type FormaRecebimento } from '../api'
import SeletorIdioma from '../componentes/SeletorIdioma'
import { useIdioma } from '../lib/i18n'
import { EtapasEntrega, type StatusEntrega } from '../componentes/EtapasEntrega'

interface ItemPedido {
  quantidade: number
  precoUnitario: string
  variacao: { cor: string; estampa: string; tamanho: string; produto: { nome: string; referencia: string | null; fotos: string[] } }
}
interface Pedido {
  id: string
  tokenPublico?: string
  createdAt: string
  total: string
  desconto: string
  descontoPct: string
  atacado: boolean
  formaRecebimento: FormaRecebimento
  observacao?: string | null
  statusEntrega: StatusEntrega
  comprovantePagamentoUrl?: string | null
  comprovanteEnviadoEm?: string | null
  cliente?: { nome: string; telefone: string } | null
  vendedora: { nome: string }
  loja: { nome: string; rede: { nome: string; logoUrl: string | null; chavePixTipo?: string | null; chavePix?: string | null; linkPagamentoCartao?: string | null } }
  itens: ItemPedido[]
}

const real = (v: number | string) => formataReal(Number(v))
const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Pedido() {
  const { id, token } = useParams<{ id?: string; token?: string }>()
  const { t } = useIdioma()
  const [p, setP] = useState<Pedido | null>(null)
  const [erro, setErro] = useState('')
  const [qr, setQr] = useState('')
  const [enviandoComprovante, setEnviandoComprovante] = useState(false)
  const [erroComprovante, setErroComprovante] = useState('')
  const comprovanteRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const url = token ? `/vendas/publico/${token}` : `/vendas/${id}`
    api.get(url).then(({ data }) => setP(data)).catch(() => setErro(t('ped.naoEncontrado')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token])

  async function enviarComprovante(arquivo: File) {
    if (!token) return
    setEnviandoComprovante(true); setErroComprovante('')
    try {
      const fd = new FormData()
      fd.append('file', arquivo)
      const { data } = await api.post(`/vendas/publico/${token}/comprovante`, fd)
      setP((atual) => atual && { ...atual, comprovantePagamentoUrl: data.comprovantePagamentoUrl, comprovanteEnviadoEm: new Date().toISOString() })
    } catch (err) { setErroComprovante(mensagemDeErro(err)) }
    finally { setEnviandoComprovante(false) }
  }

  const [marcandoEntregue, setMarcandoEntregue] = useState(false)
  const [erroEntrega, setErroEntrega] = useState('')
  async function marcarEntregue() {
    if (!id) return
    setMarcandoEntregue(true); setErroEntrega('')
    try {
      await api.patch(`/vendas/${id}/status-entrega`, { statusEntrega: 'ENTREGUE' })
      setP((atual) => atual && { ...atual, statusEntrega: 'ENTREGUE' })
    } catch (err) { setErroEntrega(mensagemDeErro(err)) }
    finally { setMarcandoEntregue(false) }
  }

  // Link público do comprovante (sem login) + link do PDF gerado no backend.
  // É o link público que vai no QR e no envio ao cliente.
  const tk = token ?? p?.tokenPublico ?? ''
  const linkPublico = tk ? `${window.location.origin}/pedido/publico/${tk}` : ''
  const linkPdf = tk ? `${window.location.origin}/api/vendas/publico/${tk}/pdf` : ''

  useEffect(() => {
    if (linkPublico) QRCode.toDataURL(linkPublico, { margin: 1, width: 160 }).then(setQr).catch(() => {})
  }, [linkPublico])

  if (erro) return <div style={{ padding: 40, textAlign: 'center', color: '#777' }}>{erro}</div>
  if (!p) return <div style={{ padding: 40, textAlign: 'center', color: '#777' }}>{t('ped.carregando')}</div>

  const bruto = p.itens.reduce((s, i) => s + Number(i.precoUnitario) * i.quantidade, 0)
  const pecas = p.itens.reduce((s, i) => s + i.quantidade, 0)
  const numero = p.id.slice(-6).toUpperCase()

  function enviarWhatsapp() {
    if (!p) return
    const linhas = p.itens.map((i) =>
      `• ${i.quantidade}x ${i.variacao.produto.nome} (${[i.variacao.cor, i.variacao.estampa, i.variacao.tamanho].filter(Boolean).join('/')}) — ${real(i.precoUnitario)}`)
    const txt = [
      `*${t('ped.pedidoLabel')} ${numero} — ${p.loja.rede.nome}*`,
      ...linhas, '',
      Number(p.desconto) > 0 ? `${t('ped.waDescontoLabel')}: ${p.descontoPct}% (− ${real(p.desconto)})` : '',
      `*${t('ped.waTotalLabel')}: ${real(p.total)}*`,
      `${t('ped.waPagamentoLabel')}: ${t(`forma.${p.formaRecebimento}`)}`,
      '', linkPublico ? `${t('ped.waVerPedido')}: ${linkPublico}` : '',
    ].filter(Boolean).join('\n')
    const tel = (p.cliente?.telefone ?? '').replace(/\D/g, '')
    const base = tel ? `https://wa.me/55${tel}` : 'https://wa.me/'
    window.open(`${base}?text=${encodeURIComponent(txt)}`, '_blank')
  }

  return (
    <div className="ped-root">
      <PedidoEstilos />
      <div className="ped-acoes ped-noprint">
        <SeletorIdioma />
        <button className="ped-btn cinza" onClick={() => window.print()}>{t('ped.imprimir')}</button>
        <button className="ped-btn" onClick={() => linkPdf && window.open(linkPdf, '_blank')}>{t('ped.salvarPdf')}</button>
        <button className="ped-btn alt" onClick={enviarWhatsapp}>{t('ped.enviarCliente')}</button>
      </div>

      <div className="ped-folha">
        <header className="ped-cab">
          <div>
            {p.loja.rede.logoUrl
              ? <img className="ped-logo" src={p.loja.rede.logoUrl} alt={p.loja.rede.nome} />
              : <div className="ped-marca">{p.loja.rede.nome}</div>}
            <div className="ped-loja">{p.loja.nome}</div>
          </div>
          <div className="ped-num">
            <div><strong>{t('ped.pedidoLabel')} {numero}</strong></div>
            <div className="ped-data">{dataBR(p.createdAt)}</div>
            <span className={`ped-tag ${p.atacado ? 'ata' : ''}`}>{p.atacado ? t('ped.atacado') : t('ped.varejo')}</span>
          </div>
        </header>

        <section className="ped-partes">
          <div>
            <div className="ped-rot">{t('ped.clienteLabel')}</div>
            <div>{p.cliente?.nome ?? t('ped.consumidorAvulso')}</div>
            {p.cliente?.telefone && <div className="ped-sub">{p.cliente.telefone}</div>}
          </div>
          <div>
            <div className="ped-rot">{t('ped.vendedoraLabel')}</div>
            <div>{p.vendedora.nome}</div>
          </div>
        </section>

        <section className="ped-entrega">
          <EtapasEntrega atual={p.statusEntrega} cor="#111" />
          {id && usuarioLogado()?.role === 'VENDEDORA' && p.statusEntrega !== 'ENTREGUE' && (
            <div className="ped-noprint" style={{ marginTop: 10 }}>
              {erroEntrega && <div className="ped-alerta">{erroEntrega}</div>}
              <button type="button" className="ped-btn" disabled={marcandoEntregue} onClick={marcarEntregue}>
                {marcandoEntregue ? t('ped.marcandoEntregue') : `✓ ${t('ped.marcarEntregue')}`}
              </button>
            </div>
          )}
        </section>

        <table className="ped-tab">
          <thead>
            <tr><th></th><th>{t('ped.colProduto')}</th><th>{t('ped.colVariacao')}</th><th className="r">{t('ped.colQtd')}</th><th className="r">{t('ped.colPreco')}</th><th className="r">{t('ped.colSubtotal')}</th></tr>
          </thead>
          <tbody>
            {p.itens.map((i, idx) => (
              <tr key={idx}>
                <td>{i.variacao.produto.fotos?.[0] ? <img className="ped-mini" src={i.variacao.produto.fotos[0]} alt="" /> : <div className="ped-mini vazio" />}</td>
                <td>{i.variacao.produto.nome}{i.variacao.produto.referencia ? <div className="ped-sub">{t('ped.refSufixo', { ref: i.variacao.produto.referencia })}</div> : null}</td>
                <td>{[i.variacao.cor, i.variacao.estampa, i.variacao.tamanho].filter(Boolean).join(' / ')}</td>
                <td className="r">{i.quantidade}</td>
                <td className="r">{real(i.precoUnitario)}</td>
                <td className="r">{real(Number(i.precoUnitario) * i.quantidade)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ped-rodape">
          <div className="ped-qr">
            {qr && <img src={qr} alt="QR do pedido" />}
            <span>{t('ped.escaneiePara')}</span>
          </div>
          <div className="ped-totais">
            <div><span>{t('ped.pecasLabel')}</span><span>{pecas}</span></div>
            <div><span>{t('ped.subtotalLabel')}</span><span>{real(bruto)}</span></div>
            {Number(p.desconto) > 0 && <div className="d"><span>{t('ped.descontoLabel', { pct: p.descontoPct })}</span><span>− {real(p.desconto)}</span></div>}
            <div className="t"><span>{t('ped.totalLabel')}</span><span>{real(p.total)}</span></div>
            <div className="pag"><span>{t('ped.pagamentoLabel')}</span><span>{t(`forma.${p.formaRecebimento}`)}</span></div>
          </div>
        </div>

        {(p.comprovantePagamentoUrl || (token && (p.loja.rede.chavePix || p.loja.rede.linkPagamentoCartao))) && (
          <div className="ped-pagamento">
            <h3>{t('ped.pagamentoTitulo')}</h3>
            {p.comprovantePagamentoUrl ? (
              <div className="ped-comprovante-ok">
                ✅ {t('ped.comprovanteEnviadoTexto')} <a href={p.comprovantePagamentoUrl} target="_blank" rel="noreferrer">{t('ped.verComprovante')}</a>
              </div>
            ) : token && (
              <>
                {p.loja.rede.chavePix && (
                  <div className="ped-pix">
                    <span className="ped-rot">{t('ped.chavePixLabel')} ({p.loja.rede.chavePixTipo})</span>
                    <div className="ped-pix-linha">
                      <code>{p.loja.rede.chavePix}</code>
                      <button type="button" className="ped-btn cinza" onClick={() => navigator.clipboard?.writeText(p.loja!.rede.chavePix!)}>{t('ped.copiarChave')}</button>
                    </div>
                  </div>
                )}
                {p.loja.rede.linkPagamentoCartao && (
                  <a className="ped-btn" style={{ marginTop: 10, display: 'inline-block' }} href={p.loja.rede.linkPagamentoCartao} target="_blank" rel="noreferrer">{t('ped.pagarComCartao')}</a>
                )}
                <div className="ped-upload">
                  <div className="ped-rot" style={{ marginTop: 14 }}>{t('ped.enviarComprovanteLabel')}</div>
                  {erroComprovante && <div className="ped-alerta">{erroComprovante}</div>}
                  <button type="button" className="ped-btn alt" disabled={enviandoComprovante} onClick={() => comprovanteRef.current?.click()}>
                    {enviandoComprovante ? t('ped.enviando') : `📎 ${t('ped.anexarComprovante')}`}
                  </button>
                  <input ref={comprovanteRef} type="file" accept="image/*,application/pdf" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarComprovante(f); e.target.value = '' }} />
                </div>
              </>
            )}
          </div>
        )}

        {p.observacao && <div className="ped-obs"><strong>{t('ped.observacoesLabel')}</strong> {p.observacao}</div>}
        <footer className="ped-pe">{p.loja.rede.nome} · {t('ped.poweredBy')}</footer>
      </div>
    </div>
  )
}

/** Exportado pra ser reaproveitado pelo PrePedido.tsx (mesmo visual de comprovante, carrinho
 *  ainda não fechado — sem QR/pagamento). */
export function PedidoEstilos() {
  return (
    <style>{`
      .ped-root { background: #f3f3f3; min-height: 100vh; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; }
      .ped-acoes { max-width: 760px; margin: 0 auto 14px; display: flex; gap: 10px; justify-content: flex-end; }
      .ped-btn { background: #111; color: #fff; border: none; padding: 11px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px; }
      .ped-btn.alt { background: #25d366; }
      .ped-btn.cinza { background: #e9e9e9; color: #333; }
      .ped-folha { max-width: 760px; margin: 0 auto; background: #fff; padding: 34px; border-radius: 8px; box-shadow: 0 4px 20px #00000014; }
      .ped-cab { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 14px; }
      .ped-logo { max-height: 56px; max-width: 200px; object-fit: contain; }
      .ped-marca { font-size: 24px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
      .ped-loja { font-size: 13px; color: #666; margin-top: 4px; }
      .ped-num { text-align: right; font-size: 14px; }
      .ped-data { color: #666; font-size: 12px; margin: 2px 0 6px; }
      .ped-tag { font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 99px; background: #eee; color: #555; }
      .ped-tag.ata { background: #111; color: #fff; }
      .ped-partes { display: flex; gap: 40px; margin: 18px 0; font-size: 14px; }
      .ped-entrega { margin: 18px 0; padding: 14px 16px; background: #faf7f2; border-radius: 8px; }
      .ped-rot { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #999; margin-bottom: 2px; }
      .ped-sub { font-size: 12px; color: #888; }
      .ped-tab { width: 100%; border-collapse: collapse; font-size: 13px; }
      .ped-tab th { text-align: left; border-bottom: 1px solid #ddd; padding: 8px 6px; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
      .ped-tab td { padding: 8px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
      .ped-tab .r { text-align: right; }
      .ped-mini { width: 40px; height: 52px; object-fit: cover; border-radius: 4px; }
      .ped-mini.vazio { background: #eee; }
      .ped-rodape { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 22px; gap: 20px; flex-wrap: wrap; }
      .ped-qr { text-align: center; font-size: 10px; color: #999; flex-shrink: 0; }
      .ped-qr img { width: 110px; height: 110px; display: block; flex-shrink: 0; }
      .ped-totais { min-width: 260px; font-size: 14px; flex: 1 1 260px; }
      .ped-totais > div { display: flex; justify-content: space-between; padding: 3px 0; }
      .ped-totais .d { color: #c62828; }
      .ped-totais .t { font-size: 20px; font-weight: 800; border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; }
      .ped-totais .pag { color: #666; font-size: 12px; margin-top: 4px; }
      .ped-obs { margin-top: 18px; font-size: 13px; background: #faf7f2; border-radius: 6px; padding: 10px 12px; }
      .ped-pagamento { margin-top: 22px; padding: 16px 18px; background: #f7f7f7; border-radius: 8px; }
      .ped-pagamento h3 { margin: 0 0 10px; font-size: 15px; }
      .ped-comprovante-ok { color: #1f9d55; font-weight: 600; font-size: 14px; }
      .ped-comprovante-ok a { color: inherit; margin-left: 8px; }
      .ped-pix-linha { display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
      .ped-pix-linha code { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px; font-size: 13px; word-break: break-all; }
      .ped-upload { margin-top: 4px; }
      .ped-alerta { margin: 6px 0; background: #fdeaea; color: #b3261e; border-radius: 6px; padding: 8px 12px; font-size: 13px; }
      .ped-pe { text-align: center; color: #bbb; font-size: 11px; margin-top: 24px; }
      @media print {
        .ped-noprint { display: none !important; }
        .ped-root { background: #fff; padding: 0; }
        .ped-folha { box-shadow: none; max-width: 100%; padding: 12px; border-radius: 0; }
      }
      @media (max-width: 480px) {
        .ped-root { padding: 8px; }
        .ped-folha { padding: 16px; }
        .ped-marca { font-size: 19px; }
        .ped-num { font-size: 12px; }
        /* Tabela rola só dentro da própria caixa — a página nunca fica mais larga que a tela. */
        .ped-tab { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
        .ped-tab td, .ped-tab th { white-space: nowrap; }
        .ped-tab td:nth-child(2), .ped-tab th:nth-child(2) { white-space: normal; min-width: 110px; }
      }
    `}</style>
  )
}

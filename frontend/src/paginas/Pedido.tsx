import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { api, formataReal, rotuloForma, type FormaRecebimento } from '../api'

interface ItemPedido {
  quantidade: number
  precoUnitario: string
  variacao: { cor: string; estampa: string; tamanho: string; produto: { nome: string; referencia: string | null; fotos: string[] } }
}
interface Pedido {
  id: string
  createdAt: string
  total: string
  desconto: string
  descontoPct: string
  atacado: boolean
  formaRecebimento: FormaRecebimento
  observacao?: string | null
  cliente?: { nome: string; telefone: string } | null
  vendedora: { nome: string }
  loja: { nome: string; rede: { nome: string; logoUrl: string | null } }
  itens: ItemPedido[]
}

const real = (v: number | string) => formataReal(Number(v))
const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Pedido() {
  const { id } = useParams<{ id: string }>()
  const [p, setP] = useState<Pedido | null>(null)
  const [erro, setErro] = useState('')
  const [qr, setQr] = useState('')

  useEffect(() => {
    api.get(`/vendas/${id}`).then(({ data }) => setP(data)).catch(() => setErro('Pedido não encontrado.'))
    QRCode.toDataURL(window.location.href, { margin: 1, width: 160 }).then(setQr).catch(() => {})
  }, [id])

  if (erro) return <div style={{ padding: 40, textAlign: 'center', color: '#777' }}>{erro}</div>
  if (!p) return <div style={{ padding: 40, textAlign: 'center', color: '#777' }}>Carregando…</div>

  const bruto = p.itens.reduce((s, i) => s + Number(i.precoUnitario) * i.quantidade, 0)
  const pecas = p.itens.reduce((s, i) => s + i.quantidade, 0)
  const numero = p.id.slice(-6).toUpperCase()

  function enviarWhatsapp() {
    if (!p) return
    const linhas = p.itens.map((i) =>
      `• ${i.quantidade}x ${i.variacao.produto.nome} (${[i.variacao.cor, i.variacao.estampa, i.variacao.tamanho].filter(Boolean).join('/')}) — ${real(i.precoUnitario)}`)
    const txt = [
      `*Pedido ${numero} — ${p.loja.rede.nome}*`,
      ...linhas, '',
      Number(p.desconto) > 0 ? `Desconto: ${p.descontoPct}% (− ${real(p.desconto)})` : '',
      `*Total: ${real(p.total)}*`,
      `Pagamento: ${rotuloForma[p.formaRecebimento]}`,
      '', `Ver pedido: ${window.location.href}`,
    ].filter(Boolean).join('\n')
    const tel = (p.cliente?.telefone ?? '').replace(/\D/g, '')
    const base = tel ? `https://wa.me/55${tel}` : 'https://wa.me/'
    window.open(`${base}?text=${encodeURIComponent(txt)}`, '_blank')
  }

  return (
    <div className="ped-root">
      <PedidoEstilos />
      <div className="ped-acoes ped-noprint">
        <button className="ped-btn" onClick={() => window.print()}>🖨️ Imprimir / Salvar PDF</button>
        <button className="ped-btn alt" onClick={enviarWhatsapp}>💬 Enviar para o cliente</button>
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
            <div><strong>Pedido {numero}</strong></div>
            <div className="ped-data">{dataBR(p.createdAt)}</div>
            <span className={`ped-tag ${p.atacado ? 'ata' : ''}`}>{p.atacado ? 'ATACADO' : 'VAREJO'}</span>
          </div>
        </header>

        <section className="ped-partes">
          <div>
            <div className="ped-rot">Cliente</div>
            <div>{p.cliente?.nome ?? 'Consumidor avulso'}</div>
            {p.cliente?.telefone && <div className="ped-sub">{p.cliente.telefone}</div>}
          </div>
          <div>
            <div className="ped-rot">Vendedora</div>
            <div>{p.vendedora.nome}</div>
          </div>
        </section>

        <table className="ped-tab">
          <thead>
            <tr><th></th><th>Produto</th><th>Variação</th><th className="r">Qtd</th><th className="r">Preço</th><th className="r">Subtotal</th></tr>
          </thead>
          <tbody>
            {p.itens.map((i, idx) => (
              <tr key={idx}>
                <td>{i.variacao.produto.fotos?.[0] ? <img className="ped-mini" src={i.variacao.produto.fotos[0]} alt="" /> : <div className="ped-mini vazio" />}</td>
                <td>{i.variacao.produto.nome}{i.variacao.produto.referencia ? <div className="ped-sub">Ref. {i.variacao.produto.referencia}</div> : null}</td>
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
            <span>Escaneie para ver o pedido</span>
          </div>
          <div className="ped-totais">
            <div><span>Peças</span><span>{pecas}</span></div>
            <div><span>Subtotal</span><span>{real(bruto)}</span></div>
            {Number(p.desconto) > 0 && <div className="d"><span>Desconto ({p.descontoPct}%)</span><span>− {real(p.desconto)}</span></div>}
            <div className="t"><span>Total</span><span>{real(p.total)}</span></div>
            <div className="pag"><span>Pagamento</span><span>{rotuloForma[p.formaRecebimento]}</span></div>
          </div>
        </div>

        {p.observacao && <div className="ped-obs"><strong>Observações:</strong> {p.observacao}</div>}
        <footer className="ped-pe">{p.loja.rede.nome} · powered by ZAIEZE</footer>
      </div>
    </div>
  )
}

function PedidoEstilos() {
  return (
    <style>{`
      .ped-root { background: #f3f3f3; min-height: 100vh; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; }
      .ped-acoes { max-width: 760px; margin: 0 auto 14px; display: flex; gap: 10px; justify-content: flex-end; }
      .ped-btn { background: #111; color: #fff; border: none; padding: 11px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 14px; }
      .ped-btn.alt { background: #25d366; }
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
      .ped-rot { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #999; margin-bottom: 2px; }
      .ped-sub { font-size: 12px; color: #888; }
      .ped-tab { width: 100%; border-collapse: collapse; font-size: 13px; }
      .ped-tab th { text-align: left; border-bottom: 1px solid #ddd; padding: 8px 6px; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
      .ped-tab td { padding: 8px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
      .ped-tab .r { text-align: right; }
      .ped-mini { width: 40px; height: 52px; object-fit: cover; border-radius: 4px; }
      .ped-mini.vazio { background: #eee; }
      .ped-rodape { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 22px; gap: 20px; }
      .ped-qr { text-align: center; font-size: 10px; color: #999; }
      .ped-qr img { width: 110px; height: 110px; display: block; }
      .ped-totais { min-width: 260px; font-size: 14px; }
      .ped-totais > div { display: flex; justify-content: space-between; padding: 3px 0; }
      .ped-totais .d { color: #c62828; }
      .ped-totais .t { font-size: 20px; font-weight: 800; border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; }
      .ped-totais .pag { color: #666; font-size: 12px; margin-top: 4px; }
      .ped-obs { margin-top: 18px; font-size: 13px; background: #faf7f2; border-radius: 6px; padding: 10px 12px; }
      .ped-pe { text-align: center; color: #bbb; font-size: 11px; margin-top: 24px; }
      @media print {
        .ped-noprint { display: none !important; }
        .ped-root { background: #fff; padding: 0; }
        .ped-folha { box-shadow: none; max-width: 100%; padding: 12px; border-radius: 0; }
      }
    `}</style>
  )
}

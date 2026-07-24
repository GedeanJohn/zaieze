import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, formataReal } from '../api'
import { PedidoEstilos } from './Pedido'

interface ItemPrePedido {
  produtoId: string; nome: string; fotoUrl?: string | null
  cor?: string; estampa?: string; tamanho?: string; modo: 'ATACADO' | 'VAREJO'; precoUnit: number; qtd: number
}
interface PrePedido {
  id: string; itens: ItemPrePedido[]; pecas: number; subtotal: string; createdAt: string; convertido: boolean
  vendedora: { nome: string }
  cliente: { nome: string; telefone: string } | null
  loja: { nome: string }
  marca: { nome: string; logoUrl: string | null }
}

const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Pré-pedido público (sem login): link enviado à vendedora no WhatsApp assim que o cliente monta
 *  o carrinho na vitrine — mesmo formato visual do comprovante (Pedido.tsx), mas sem QR code nem
 *  seção de pagamento, já que ainda não virou Orçamento/Venda de verdade (a vendedora ainda vai
 *  abrir/editar isso pra fechar como Orçamento — fluxo já existente no Funil). */
export default function PrePedido() {
  const { token } = useParams<{ token: string }>()
  const [p, setP] = useState<PrePedido | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get(`/catalogo/publico/pre-pedido/${token}`).then(({ data }) => setP(data)).catch(() => setErro('Este pedido não está disponível.'))
  }, [token])

  if (erro) return <div style={{ padding: 40, textAlign: 'center', color: '#777' }}>{erro}</div>
  if (!p) return <div style={{ padding: 40, textAlign: 'center', color: '#777' }}>Carregando…</div>

  const numero = p.id.slice(-6).toUpperCase()

  return (
    <div className="ped-root">
      <PedidoEstilos />
      <div className="ped-folha">
        <header className="ped-cab">
          <div>
            {p.marca.logoUrl ? <img className="ped-logo" src={p.marca.logoUrl} alt={p.marca.nome} /> : <div className="ped-marca">{p.marca.nome}</div>}
            <div className="ped-loja">{p.loja.nome}</div>
          </div>
          <div className="ped-num">
            <div><strong>Pré-pedido {numero}</strong></div>
            <div className="ped-data">{dataBR(p.createdAt)}</div>
            <span className="ped-tag">Ainda não fechado</span>
          </div>
        </header>

        <section className="ped-partes">
          <div>
            <div className="ped-rot">Cliente</div>
            <div>{p.cliente?.nome ?? 'Cliente do catálogo'}</div>
            {p.cliente?.telefone && <div className="ped-sub">{p.cliente.telefone}</div>}
          </div>
          <div>
            <div className="ped-rot">Vendedora</div>
            <div>{p.vendedora.nome}</div>
          </div>
        </section>

        <table className="ped-tab">
          <thead>
            <tr><th></th><th>Produto</th><th>Variação</th><th>Modo</th><th className="r">Qtd</th><th className="r">Preço</th><th className="r">Subtotal</th></tr>
          </thead>
          <tbody>
            {p.itens.map((i, idx) => (
              <tr key={idx}>
                <td>{i.fotoUrl ? <img className="ped-mini" src={i.fotoUrl} alt="" /> : <div className="ped-mini vazio" />}</td>
                <td>{i.nome}</td>
                <td>{[i.cor, i.estampa, i.tamanho].filter(Boolean).join(' / ')}</td>
                <td>{i.modo === 'ATACADO' ? 'Atacado' : 'Varejo'}</td>
                <td className="r">{i.qtd}</td>
                <td className="r">{formataReal(i.precoUnit)}</td>
                <td className="r">{formataReal(i.precoUnit * i.qtd)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ped-rodape">
          <div />
          <div className="ped-totais">
            <div><span>Peças</span><span>{p.pecas}</span></div>
            <div className="t"><span>Subtotal</span><span>{formataReal(Number(p.subtotal))}</span></div>
          </div>
        </div>

        {p.convertido && (
          <div className="ped-obs"><strong>Atualização:</strong> este pedido já foi transformado em orçamento pela vendedora.</div>
        )}
        <footer className="ped-pe">{p.marca.nome} · powered by ZAIEZE</footer>
      </div>
    </div>
  )
}

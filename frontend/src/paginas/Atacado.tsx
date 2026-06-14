import { useCallback, useEffect, useState } from 'react'
import { api, formataReal } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface ClienteAtacado {
  id: string; nome: string; telefone: string; totalGasto: number
  ultimaCompraEm?: string | null; vendedora?: { nome: string } | null
}
interface Resumo { clientes: number; faturamentoAtacado: number; pedidos: number; ticketMedio: number }

function diasDesde(iso?: string | null): string {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d === 0 ? 'hoje' : `há ${d} dias`
}

export default function Atacado() {
  const escopo = useLojaAtiva()
  const [clientes, setClientes] = useState<ClienteAtacado[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/atacado', { params: escopo.params })
    setClientes(data.clientes)
    setResumo(data.resumo)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  return (
    <>
      <header>
        <h1>📦 Atacado</h1>
        <SeletorLoja escopo={escopo} />
      </header>

      {resumo && (
        <div className="grade-cards">
          <div className="cartao kpi"><div className="rotulo">Clientes de atacado</div><div className="valor">{resumo.clientes}</div></div>
          <div className="cartao kpi"><div className="rotulo">Faturamento atacado</div><div className="valor">{formataReal(resumo.faturamentoAtacado)}</div></div>
          <div className="cartao kpi"><div className="rotulo">Pedidos de atacado</div><div className="valor">{resumo.pedidos}</div></div>
          <div className="cartao kpi"><div className="rotulo">Ticket médio</div><div className="valor">{formataReal(resumo.ticketMedio)}</div></div>
        </div>
      )}

      <div className="cartao" style={{ marginTop: 16 }}>
        <h2 className="painel-titulo">Sacoleiras & revendedores</h2>
        <table>
          <thead><tr><th>Cliente</th><th>WhatsApp</th><th>Total comprado</th><th>Última compra</th><th>Vendedora</th></tr></thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>{c.nome}</td>
                <td>{c.telefone}</td>
                <td>{formataReal(c.totalGasto)}</td>
                <td style={{ color: 'var(--ink-soft)' }}>{diasDesde(c.ultimaCompraEm)}</td>
                <td>{c.vendedora?.nome ?? '—'}</td>
              </tr>
            ))}
            {clientes.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>Nenhum cliente de atacado ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

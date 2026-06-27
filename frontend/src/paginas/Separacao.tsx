import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, formataReal, mensagemDeErro } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface PedidoSep {
  id: string
  tokenPublico: string
  createdAt: string
  total: string
  atacado: boolean
  separado: boolean
  separadoEm: string | null
  cliente: string
  vendedora: string
  pecas: number
}

const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Tempo decorrido desde a venda (cobrança do gerente: há quanto tempo está pendente). */
function tempoDecorrido(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `há ${Math.max(1, Math.floor(ms / 60_000))} min`
  if (h < 48) return `há ${h}h`
  return `há ${Math.floor(h / 24)} dias`
}

export default function Separacao() {
  const escopo = useLojaAtiva()
  const [pedidos, setPedidos] = useState<PedidoSep[]>([])
  const [verTodos, setVerTodos] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState('')

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    setErro('')
    try {
      const params = { ...escopo.params, status: verTodos ? 'todos' : 'pendentes' }
      const { data } = await api.get('/vendas/separacao', { params })
      setPedidos(data)
    } catch (err) { setErro(mensagemDeErro(err)) }
  }, [escopo.pronto, escopo.params, verTodos])

  useEffect(() => { carregar() }, [carregar])

  async function alternar(p: PedidoSep) {
    setSalvando(p.id); setErro('')
    try {
      await api.patch(`/vendas/${p.id}/separado`, { separado: !p.separado }, { params: escopo.params })
      carregar()
    } catch (err) { setErro(mensagemDeErro(err)) } finally { setSalvando('') }
  }

  function abrirComprovante(token: string) {
    window.open(`${window.location.origin}/pedido/publico/${token}`, '_blank', 'noreferrer')
  }

  const pendentes = useMemo(() => pedidos.filter((p) => !p.separado).length, [pedidos])

  return (
    <>
      <header>
        <h1>Pedidos a separar</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <SeletorLoja escopo={escopo} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} />
            Mostrar já separados
          </label>
        </div>
      </header>

      <p style={{ color: 'var(--ink-soft)', marginTop: -4 }}>
        Ao fechar uma venda, o pedido entra aqui como <strong>pendente</strong>. O gestor de estoque separa as peças e marca como
        <strong> separado</strong>; o gerente acompanha e cobra os pendentes. Abra o comprovante para conferir os itens.
      </p>

      {erro && <div className="alerta">{erro}</div>}

      <div style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 10px' }}>
        {pendentes > 0 ? <strong style={{ color: '#c2552b' }}>{pendentes} pendente(s)</strong> : 'Nenhum pedido pendente. 🎉'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pedidos.map((p) => (
          <div key={p.id} className="cartao" style={{ padding: 12, borderLeft: `4px solid ${p.separado ? '#7ce8a0' : '#e8a87c'}`, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>Pedido {p.id.slice(-6).toUpperCase()}</strong>
                <span className={`selo ${p.atacado ? 'baixo' : ''}`} style={{ fontSize: 11 }}>{p.atacado ? 'ATACADO' : 'VAREJO'}</span>
                {p.separado
                  ? <span className="selo ok" style={{ fontSize: 11 }}>separado</span>
                  : <span className="selo" style={{ fontSize: 11, background: '#e8a87c33', color: '#a85a2b' }}>pendente · {tempoDecorrido(p.createdAt)}</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
                {dataBR(p.createdAt)} · {p.cliente} · {p.pecas} peça(s) · {formataReal(p.total)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                👤 Vendedora: {p.vendedora}{p.separado && p.separadoEm ? ` · separado em ${dataBR(p.separadoEm)}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn secundario" onClick={() => abrirComprovante(p.tokenPublico)}>🧾 Comprovante</button>
              <button className={`btn ${p.separado ? 'secundario' : ''}`} disabled={salvando === p.id} onClick={() => alternar(p)}>
                {salvando === p.id ? '…' : p.separado ? 'Reabrir' : '✓ Marcar separado'}
              </button>
            </div>
          </div>
        ))}
        {pedidos.length === 0 && <div style={{ color: 'var(--ink-soft)', padding: 14 }}>{verTodos ? 'Nenhum pedido.' : 'Nenhum pedido pendente.'}</div>}
      </div>
    </>
  )
}

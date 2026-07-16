import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formataReal, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'

interface Loja { id: string; nome: string }
interface ClientePipeline {
  id: string
  nome: string
  telefone: string | null
  instagram: string | null
  totalGasto: string
  ultimaCompraEm: string | null
  createdAt: string
}
interface Vendedora { id: string; nome: string; role: string }

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/**
 * Config do add-on "Vendedora ZAIEZE" (loja 100% automatizada por IA): o gestor escolhe a loja
 * padrão onde toda venda fechada pela IA é lançada, e acompanha aqui os clientes que ela captou
 * (sem vendedora humana ainda) — podendo atribuir manualmente pra alguém da equipe.
 */
export default function VendedoraZaieze() {
  const avisar = useToast()
  const [semAcesso, setSemAcesso] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [lojas, setLojas] = useState<Loja[]>([])
  const [lojaId, setLojaId] = useState('')
  const [lojaSalva, setLojaSalva] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [pipeline, setPipeline] = useState<ClientePipeline[]>([])
  const [vendedoras, setVendedoras] = useState<Vendedora[]>([])
  const [atribuindo, setAtribuindo] = useState<Record<string, string>>({})
  const [salvandoAtribuicao, setSalvandoAtribuicao] = useState('')

  useEffect(() => {
    api.get('/vendedora-zaieze/config')
      .then(({ data }) => {
        setLojas(data.lojas)
        setLojaSalva(data.lojaVendedoraIaId)
        setLojaId(data.lojaVendedoraIaId ?? (data.lojas.length === 1 ? data.lojas[0].id : ''))
      })
      .catch((e) => { if (e.response?.status === 403) setSemAcesso(true) })
      .finally(() => setCarregando(false))
  }, [])

  const carregarPipeline = useCallback(() => {
    if (!lojaSalva) return
    api.get('/vendedora-zaieze/pipeline').then(({ data }) => setPipeline(data)).catch(() => {})
    api.get('/usuarios', { params: { lojaId: lojaSalva } })
      .then(({ data }) => setVendedoras((data as Vendedora[]).filter((u) => u.role === 'VENDEDORA')))
      .catch(() => {})
  }, [lojaSalva])

  useEffect(() => { carregarPipeline() }, [carregarPipeline])

  async function salvarLoja(e: React.FormEvent) {
    e.preventDefault()
    if (!lojaId) return
    setSalvando(true); setErro('')
    try {
      await api.put('/vendedora-zaieze/config', { lojaId })
      setLojaSalva(lojaId)
      avisar('Loja padrão da Vendedora ZAIEZE salva.')
    } catch (err) { setErro(mensagemDeErro(err)) } finally { setSalvando(false) }
  }

  async function atribuir(clienteId: string) {
    const vendedoraId = atribuindo[clienteId]
    if (!vendedoraId || !lojaSalva) return
    setSalvandoAtribuicao(clienteId)
    try {
      await api.patch(`/clientes/${clienteId}`, { vendedoraId }, { params: { lojaId: lojaSalva } })
      avisar('Cliente atribuído.')
      carregarPipeline()
    } catch (err) { avisar(mensagemDeErro(err)) } finally { setSalvandoAtribuicao('') }
  }

  if (carregando) return null

  if (semAcesso) {
    return (
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Vendedora ZAIEZE</h2>
        <p>Loja 100% automatizada por IA: atende WhatsApp/Instagram, recomenda produtos e fecha vendas sozinha — sem comissão, sem precisar de uma vendedora online. Disponível como add-on, cobrado à parte.</p>
        <Link className="btn" to="/planos">Assinar add-on</Link>
      </div>
    )
  }

  return (
    <>
      <header><h1>Vendedora ZAIEZE</h1></header>
      <p style={{ color: 'var(--ink-soft)', marginTop: -4 }}>
        Ela atende quem chega pelo WhatsApp/Instagram da marca sem cair na carteira de nenhuma vendedora.
        Fecha o pedido sozinha e manda pra fila de separação — sem comissão. Você acompanha os clientes dela
        aqui embaixo e pode passar qualquer um pra uma vendedora humana quando quiser.
      </p>

      {erro && <div className="alerta">{erro}</div>}

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Loja padrão</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          Estoque e preço são por loja — escolha em qual loja a Vendedora ZAIEZE lança as vendas que fecha.
        </p>
        <form onSubmit={salvarLoja} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={lojaId} onChange={(e) => setLojaId(e.target.value)} required>
            <option value="">Selecione a loja…</option>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          <button className="btn" disabled={salvando}>{salvando ? '…' : 'Salvar'}</button>
          {lojaSalva && <span className="selo ok">Ativa</span>}
        </form>
      </div>

      {lojaSalva && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>Clientes atendidos pela Vendedora ZAIEZE</h2>
          {pipeline.length === 0 && <div style={{ color: 'var(--ink-soft)' }}>Nenhum cliente ainda.</div>}
          <table>
            <thead>
              <tr><th>Cliente</th><th>Contato</th><th>Total gasto</th><th>Desde</th><th>Atribuir a</th></tr>
            </thead>
            <tbody>
              {pipeline.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td>{c.telefone || c.instagram || '—'}</td>
                  <td>{formataReal(Number(c.totalGasto))}</td>
                  <td>{dataBR(c.createdAt)}</td>
                  <td>
                    <select value={atribuindo[c.id] ?? ''} onChange={(e) => setAtribuindo({ ...atribuindo, [c.id]: e.target.value })} style={{ marginRight: 6 }}>
                      <option value="">Vendedora…</option>
                      {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                    </select>
                    <button className="btn secundario" disabled={!atribuindo[c.id] || salvandoAtribuicao === c.id} onClick={() => atribuir(c.id)}>
                      {salvandoAtribuicao === c.id ? '…' : 'Atribuir'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

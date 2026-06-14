import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface Cliente {
  id: string
  nome: string
  telefone: string
  email?: string | null
  instagram?: string | null
  segmento: string
  totalGasto: string
  ultimaCompraEm?: string | null
  consentimentoLgpd: boolean
  vendedora?: { id: string; nome: string } | null
}

interface ItemHist {
  id: string
  quantidade: number
  precoUnitario: string
  variacao: { cor: string; tamanho: string; produto: { nome: string } }
}
interface VendaHist {
  id: string
  total: string
  status: 'CONCLUIDA' | 'CANCELADA'
  atacado: boolean
  createdAt: string
  itens: ItemHist[]
}
interface ClienteDetalhe extends Cliente {
  cpf?: string | null
  observacoes?: string | null
  vendas: VendaHist[]
}

interface Vendedora { id: string; nome: string; role: string }
type Distribuicao = Record<string, number>

const SEGMENTOS = ['NOVO', 'FREQUENTE', 'VIP', 'INATIVO', 'ATACADO']
const FILTRO_SEGMENTOS = ['', ...SEGMENTOS]

function diasDesde(iso?: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function Clientes() {
  const usuario = usuarioLogado()!
  const gerente = usuario.role !== 'VENDEDORA'
  const escopo = useLojaAtiva()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [distribuicao, setDistribuicao] = useState<Distribuicao>({})
  const [vendedoras, setVendedoras] = useState<Vendedora[]>([])
  const [busca, setBusca] = useState('')
  const [segmento, setSegmento] = useState('')
  const [editando, setEditando] = useState<Partial<Cliente> | null>(null)
  const [detalhe, setDetalhe] = useState<ClienteDetalhe | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [segmentando, setSegmentando] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const params: Record<string, string> = { ...escopo.params }
    if (busca) params.busca = busca
    if (segmento) params.segmento = segmento
    const [lista, resumo] = await Promise.all([
      api.get('/clientes', { params }),
      api.get('/clientes/resumo/segmentos', { params: escopo.params }),
    ])
    setClientes(lista.data)
    setDistribuicao(resumo.data.distribuicao)
  }, [busca, segmento, escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (gerente && escopo.pronto) {
      api.get('/usuarios', { params: escopo.params }).then(({ data }) =>
        setVendedoras(data.filter((u: Vendedora) => u.role === 'VENDEDORA')),
      )
    }
  }, [gerente, escopo.pronto, escopo.params])

  async function recalcular() {
    setSegmentando(true)
    setAviso('')
    try {
      const { data } = await api.post('/clientes/segmentar', {}, { params: escopo.params })
      const d = data.distribuicao as Distribuicao
      setAviso(
        `Segmentação recalculada — ${data.atualizados} cliente(s) reclassificado(s). ` +
          `VIP ${d.VIP} · Frequente ${d.FREQUENTE} · Inativo ${d.INATIVO} · Atacado ${d.ATACADO} · Novo ${d.NOVO}.`,
      )
      await carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSegmentando(false)
    }
  }

  async function abrirDetalhe(id: string) {
    setErro('')
    try {
      const { data } = await api.get(`/clientes/${id}`, { params: escopo.params })
      setDetalhe(data)
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setErro('')
    const corpo = {
      nome: editando.nome,
      telefone: editando.telefone,
      email: editando.email || undefined,
      instagram: editando.instagram || undefined,
      vendedoraId: (editando as { vendedoraId?: string }).vendedoraId || editando.vendedora?.id || undefined,
      consentimentoLgpd: editando.consentimentoLgpd ?? false,
    }
    try {
      if (editando.id) await api.patch(`/clientes/${editando.id}`, corpo, { params: escopo.params })
      else await api.post('/clientes', corpo, { params: escopo.params })
      setEditando(null)
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  const detalheDias = diasDesde(detalhe?.ultimaCompraEm)

  return (
    <>
      <header>
        <h1>{gerente ? 'Clientes da loja' : 'Minha carteira'}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          {gerente && (
            <button className="btn secundario" onClick={recalcular} disabled={segmentando || !escopo.pronto}>
              {segmentando ? 'Recalculando…' : '🔄 Recalcular segmentação'}
            </button>
          )}
          <button className="btn" onClick={() => setEditando({ consentimentoLgpd: false })}>+ Novo cliente</button>
        </div>
      </header>

      {aviso && <div className="sucesso">{aviso}</div>}
      {erro && <div className="alerta">{erro}</div>}

      {/* Distribuição da carteira por segmento (clicável = filtro) */}
      <div className="cartao" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>Carteira:</strong>
        {SEGMENTOS.map((s) => (
          <button
            key={s}
            onClick={() => setSegmento(segmento === s ? '' : s)}
            title={segmento === s ? 'Remover filtro' : `Filtrar por ${s}`}
            style={{
              border: segmento === s ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: 'transparent', borderRadius: 999, padding: '4px 4px 4px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, width: 'auto',
            }}
          >
            <span className={`selo ${s}`}>{s}</span>
            <strong>{distribuicao[s] ?? 0}</strong>
          </button>
        ))}
      </div>

      <div className="cartao">
        <div className="linha-campos">
          <div className="campo">
            <label>Buscar (nome ou telefone)</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Ana" />
          </div>
          <div className="campo">
            <label>Segmento</label>
            <select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
              {FILTRO_SEGMENTOS.map((s) => <option key={s} value={s}>{s || 'Todos'}</option>)}
            </select>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>WhatsApp</th><th>Segmento</th><th>Total gasto</th><th>Última compra</th>
              {gerente && <th>Vendedora</th>}
              <th>LGPD</th><th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const dias = diasDesde(c.ultimaCompraEm)
              return (
                <tr key={c.id}>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); abrirDetalhe(c.id) }}>{c.nome}</a></td>
                  <td>{c.telefone}</td>
                  <td><span className={`selo ${c.segmento}`}>{c.segmento}</span></td>
                  <td>{formataReal(c.totalGasto)}</td>
                  <td style={{ fontSize: 13, color: dias != null && dias > 90 ? 'var(--danger)' : 'var(--ink-soft)' }}>
                    {dias == null ? '—' : dias === 0 ? 'hoje' : `há ${dias} dias`}
                  </td>
                  {gerente && <td>{c.vendedora?.nome ?? '—'}</td>}
                  <td>{c.consentimentoLgpd ? '✅' : '—'}</td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); setEditando(c) }}>editar</a></td>
                </tr>
              )
            })}
            {clientes.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--ink-soft)' }}>Nenhum cliente encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detalhe + histórico de compras */}
      {detalhe && (
        <div className="modal-fundo" onClick={() => setDetalhe(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{detalhe.nome}</h2>
                <span className={`selo ${detalhe.segmento}`}>{detalhe.segmento}</span>
              </div>
              <button className="btn secundario" onClick={() => setDetalhe(null)}>Fechar</button>
            </div>

            <div className="grade-cards" style={{ marginTop: 16 }}>
              <div className="cartao kpi"><div className="rotulo">Total gasto</div><div className="valor">{formataReal(detalhe.totalGasto)}</div></div>
              <div className="cartao kpi"><div className="rotulo">Compras</div><div className="valor">{detalhe.vendas.filter((v) => v.status === 'CONCLUIDA').length}</div></div>
              <div className="cartao kpi">
                <div className="rotulo">Última compra</div>
                <div className="valor" style={{ fontSize: 18 }}>
                  {detalheDias == null ? '—' : detalheDias === 0 ? 'hoje' : `há ${detalheDias}d`}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 16px' }}>
              📱 {detalhe.telefone}{detalhe.instagram ? ` · ${detalhe.instagram}` : ''}
              {detalhe.vendedora ? ` · carteira de ${detalhe.vendedora.nome}` : ''}
              {detalhe.consentimentoLgpd ? ' · ✅ aceita campanhas' : ' · ⚠ sem consentimento LGPD'}
            </div>

            {detalhe.segmento === 'INATIVO' && (
              <div className="alerta" style={{ background: '#fff3e0', color: 'var(--warn)' }}>
                💡 Oportunidade de recuperação: cliente sem comprar há {detalheDias} dias. Acione na régua de inativos (Fase 4 — WhatsApp).
              </div>
            )}

            <h3 className="painel-titulo">Histórico de compras</h3>
            <table>
              <thead><tr><th>Data</th><th>Itens</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {detalhe.vendas.map((venda) => (
                  <tr key={venda.id} style={{ opacity: venda.status === 'CANCELADA' ? 0.5 : 1 }}>
                    <td>{dataCurta(venda.createdAt)}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                      {venda.itens.map((i) => `${i.quantidade}× ${i.variacao.produto.nome} ${i.variacao.cor}/${i.variacao.tamanho}`).join(' · ')}
                      {venda.atacado ? '  🏷️atacado' : ''}
                    </td>
                    <td>{formataReal(venda.total)}</td>
                    <td><span className={`selo ${venda.status === 'CONCLUIDA' ? 'ok' : 'baixo'}`}>{venda.status === 'CONCLUIDA' ? 'OK' : 'Cancelada'}</span></td>
                  </tr>
                ))}
                {detalhe.vendas.length === 0 && (
                  <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>Sem compras registradas — cliente novo na carteira.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cadastro / edição */}
      {editando && (
        <div className="modal-fundo" onClick={() => setEditando(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>{editando.id ? 'Editar cliente' : 'Novo cliente'}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>Nome*</label>
                <input value={editando.nome ?? ''} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} required />
              </div>
              <div className="campo">
                <label>WhatsApp* (com DDI)</label>
                <input value={editando.telefone ?? ''} onChange={(e) => setEditando({ ...editando, telefone: e.target.value })} placeholder="5562999998888" required />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>E-mail</label>
                <input type="email" value={editando.email ?? ''} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              </div>
              <div className="campo">
                <label>Instagram</label>
                <input value={editando.instagram ?? ''} onChange={(e) => setEditando({ ...editando, instagram: e.target.value })} placeholder="@cliente" />
              </div>
            </div>
            {gerente && (
              <div className="campo">
                <label>Vendedora (carteira)</label>
                <select
                  value={(editando as { vendedoraId?: string }).vendedoraId ?? editando.vendedora?.id ?? ''}
                  onChange={(e) => setEditando({ ...editando, vendedoraId: e.target.value } as never)}
                >
                  <option value="">— Sem carteira —</option>
                  {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </div>
            )}
            <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox" style={{ width: 'auto' }} id="lgpd"
                checked={editando.consentimentoLgpd ?? false}
                onChange={(e) => setEditando({ ...editando, consentimentoLgpd: e.target.checked })}
              />
              <label htmlFor="lgpd" style={{ margin: 0 }}>Cliente consentiu receber campanhas (LGPD)</label>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

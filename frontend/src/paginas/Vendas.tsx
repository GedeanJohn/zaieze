import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, formataReal, mensagemDeErro, usuarioLogado, FORMAS_RECEBIMENTO, rotuloForma, CANAIS_VENDA, rotuloCanal, type FormaRecebimento, type CanalVenda } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface ItemVendaView {
  id: string
  quantidade: number
  precoUnitario: string
  variacao: { cor: string; tamanho: string; produto: { nome: string } }
}

interface Venda {
  id: string
  status: 'CONCLUIDA' | 'CANCELADA'
  canal: CanalVenda
  total: string
  desconto: string
  atacado: boolean
  formaRecebimento: string
  observacao?: string | null
  createdAt: string
  cliente?: { id: string; nome: string } | null
  vendedora: { id: string; nome: string }
  itens: ItemVendaView[]
}

interface VariacaoP { id: string; cor: string; tamanho: string; estoque: number }
interface ProdutoP { id: string; nome: string; precoVarejo: string; precoAtacado?: string | null; variacoes: VariacaoP[] }
interface Pessoa { id: string; nome: string; role?: string }

interface LinhaItem { produtoId: string; variacaoId: string; quantidade: number; precoUnitario: string }

interface FormVenda {
  clienteId: string
  vendedoraId: string
  canal: CanalVenda
  atacado: boolean
  formaRecebimento: FormaRecebimento
  desconto: string
  observacao: string
  itens: LinhaItem[]
}

const LINHA_VAZIA: LinhaItem = { produtoId: '', variacaoId: '', quantidade: 1, precoUnitario: '' }

function formataData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Vendas() {
  const usuario = usuarioLogado()!
  const gerente = usuario.role !== 'VENDEDORA'
  const escopo = useLojaAtiva()

  const [vendas, setVendas] = useState<Venda[]>([])
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [canalFiltro, setCanalFiltro] = useState('')
  const [form, setForm] = useState<FormVenda | null>(null)
  const [erro, setErro] = useState('')

  // Dados de apoio para o PDV (carregados quando o modal abre)
  const [produtos, setProdutos] = useState<ProdutoP[]>([])
  const [clientes, setClientes] = useState<Pessoa[]>([])
  const [vendedoras, setVendedoras] = useState<Pessoa[]>([])

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const params: Record<string, string> = { ...escopo.params }
    if (de) params.de = de
    if (ate) params.ate = ate
    if (canalFiltro) params.canal = canalFiltro
    const { data } = await api.get('/vendas', { params })
    setVendas(data)
  }, [de, ate, canalFiltro, escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  const abrirNova = useCallback(async (prefClienteId = '') => {
    setErro('')
    const [prod, cli] = await Promise.all([
      api.get('/produtos', { params: { ...escopo.params, ativo: 'true' } }),
      api.get('/clientes', { params: escopo.params }),
    ])
    setProdutos(prod.data)
    setClientes(cli.data)
    if (gerente) {
      const { data } = await api.get('/usuarios', { params: escopo.params })
      setVendedoras(data.filter((u: Pessoa) => u.role === 'VENDEDORA'))
    }
    // venda vinda da caixa de entrada já nasce Online, com o cliente preenchido
    setForm({ clienteId: prefClienteId, vendedoraId: '', canal: 'ONLINE', atacado: false, formaRecebimento: 'DINHEIRO', desconto: '', observacao: '', itens: [{ ...LINHA_VAZIA }] })
  }, [escopo.params, gerente])

  // Atalho da caixa de entrada: /vendas?cliente=<id> abre o PDV pré-preenchido (venda online)
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const cli = searchParams.get('cliente')
    if (cli && escopo.pronto && !form) {
      abrirNova(cli)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, escopo.pronto, form, abrirNova, setSearchParams])

  function precoSugerido(produtoId: string, atacado: boolean): string {
    const p = produtos.find((x) => x.id === produtoId)
    if (!p) return ''
    if (atacado && p.precoAtacado) return p.precoAtacado
    return p.precoVarejo
  }

  function mudarLinha(i: number, patch: Partial<LinhaItem>) {
    if (!form) return
    const itens = form.itens.map((l, idx) => {
      if (idx !== i) return l
      const novo = { ...l, ...patch }
      // Ao trocar de produto: zera variação e sugere preço
      if (patch.produtoId !== undefined) {
        novo.variacaoId = ''
        novo.precoUnitario = precoSugerido(patch.produtoId, form.atacado)
      }
      return novo
    })
    setForm({ ...form, itens })
  }

  function mudarAtacado(atacado: boolean) {
    if (!form) return
    // Re-sugere preços ainda não editados manualmente seguindo a tabela escolhida
    const itens = form.itens.map((l) => ({
      ...l,
      precoUnitario: l.produtoId ? precoSugerido(l.produtoId, atacado) : l.precoUnitario,
    }))
    setForm({ ...form, atacado, itens })
  }

  const totalPrevisto = useMemo(() => {
    if (!form) return 0
    const bruto = form.itens.reduce((s, l) => s + (Number(l.precoUnitario) || 0) * (Number(l.quantidade) || 0), 0)
    return Math.max(0, bruto - (Number(form.desconto) || 0))
  }, [form])

  function variacoesDe(produtoId: string): VariacaoP[] {
    return produtos.find((p) => p.id === produtoId)?.variacoes ?? []
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    if (gerente && !form.vendedoraId) return setErro('Selecione a vendedora da venda.')
    if (form.itens.some((l) => !l.variacaoId || Number(l.quantidade) < 1)) {
      return setErro('Cada item precisa de uma variação e quantidade ≥ 1.')
    }
    const corpo = {
      clienteId: form.clienteId || undefined,
      vendedoraId: gerente ? form.vendedoraId : undefined,
      canal: form.canal,
      atacado: form.atacado,
      formaRecebimento: form.formaRecebimento,
      desconto: Number(form.desconto) || 0,
      observacao: form.observacao || undefined,
      itens: form.itens.map((l) => ({
        variacaoId: l.variacaoId,
        quantidade: Number(l.quantidade),
        precoUnitario: l.precoUnitario ? Number(l.precoUnitario) : undefined,
      })),
    }
    try {
      await api.post('/vendas', corpo, { params: escopo.params })
      setForm(null)
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function cancelar(v: Venda) {
    if (!window.confirm(`Cancelar a venda de ${formataReal(v.total)}? O estoque será devolvido.`)) return
    try {
      await api.post(`/vendas/${v.id}/cancelar`, {}, { params: escopo.params })
      carregar()
    } catch (err) {
      alert(mensagemDeErro(err))
    }
  }

  return (
    <>
      <header>
        <h1>Vendas</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          <button className="btn" onClick={() => abrirNova()} disabled={!escopo.pronto}>+ Nova venda</button>
        </div>
      </header>

      <div className="cartao">
        <div className="linha-campos">
          <div className="campo">
            <label>De</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="campo">
            <label>Até</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="campo">
            <label>Canal</label>
            <select value={canalFiltro} onChange={(e) => setCanalFiltro(e.target.value)}>
              <option value="">Todos os canais</option>
              {CANAIS_VENDA.map((c) => <option key={c} value={c}>{rotuloCanal[c]}</option>)}
            </select>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Cliente</th><th>Vendedora</th><th>Canal</th><th>Itens</th>
              <th>Total</th><th>Recebimento</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((v) => (
              <tr key={v.id} style={{ opacity: v.status === 'CANCELADA' ? 0.5 : 1 }}>
                <td>{formataData(v.createdAt)}</td>
                <td>{v.cliente?.nome ?? '—'}</td>
                <td>{v.vendedora.nome}</td>
                <td>
                  <span style={{ fontSize: 13 }}>{v.canal === 'ONLINE' ? '📲 Online' : '🏬 Balcão'}</span>
                </td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {v.itens.map((i) => `${i.quantidade}× ${i.variacao.produto.nome} ${i.variacao.cor}/${i.variacao.tamanho}`).join(' · ')}
                  {v.atacado ? '  🏷️atacado' : ''}
                </td>
                <td>{formataReal(v.total)}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{rotuloForma[v.formaRecebimento] ?? v.formaRecebimento}</td>
                <td>
                  <span className={`selo ${v.status === 'CONCLUIDA' ? 'ok' : 'baixo'}`}>
                    {v.status === 'CONCLUIDA' ? 'Concluída' : 'Cancelada'}
                  </span>
                </td>
                <td>
                  {gerente && v.status === 'CONCLUIDA' && (
                    <a href="#" onClick={(e) => { e.preventDefault(); cancelar(v) }}>cancelar</a>
                  )}
                </td>
              </tr>
            ))}
            {vendas.length === 0 && (
              <tr><td colSpan={9} style={{ color: 'var(--ink-soft)' }}>Nenhuma venda no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>Nova venda</h2>
            {erro && <div className="alerta">{erro}</div>}

            <div className="linha-campos">
              <div className="campo">
                <label>Canal da venda*</label>
                <select value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value as CanalVenda })}>
                  {CANAIS_VENDA.map((c) => <option key={c} value={c}>{rotuloCanal[c]}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Cliente</label>
                <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                  <option value="">— Sem cliente (avulsa) —</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              {gerente && (
                <div className="campo">
                  <label>Vendedora*</label>
                  <select value={form.vendedoraId} onChange={(e) => setForm({ ...form, vendedoraId: e.target.value })} required>
                    <option value="">— Selecione —</option>
                    {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
              )}
            </div>

            <h3 style={{ marginBottom: 8 }}>Itens</h3>
            <div className="grade-itens" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              <span>Produto</span><span>Variação</span><span>Qtd</span><span>Preço un.</span><span></span>
            </div>
            {form.itens.map((l, i) => (
              <div className="grade-itens" key={i}>
                <select value={l.produtoId} onChange={(e) => mudarLinha(i, { produtoId: e.target.value })} required>
                  <option value="">— Produto —</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <select value={l.variacaoId} onChange={(e) => mudarLinha(i, { variacaoId: e.target.value })} disabled={!l.produtoId} required>
                  <option value="">— Cor/Tam —</option>
                  {variacoesDe(l.produtoId).map((v) => (
                    <option key={v.id} value={v.id} disabled={v.estoque <= 0}>
                      {v.cor}/{v.tamanho} ({v.estoque})
                    </option>
                  ))}
                </select>
                <input type="number" min="1" value={l.quantidade} onChange={(e) => mudarLinha(i, { quantidade: Number(e.target.value) })} />
                <input type="number" step="0.01" min="0" value={l.precoUnitario} onChange={(e) => mudarLinha(i, { precoUnitario: e.target.value })} placeholder="auto" />
                <button
                  type="button" className="remover" title="Remover"
                  onClick={() => setForm({ ...form, itens: form.itens.filter((_, idx) => idx !== i) })}
                  disabled={form.itens.length === 1}
                >×</button>
              </div>
            ))}
            <button type="button" className="btn secundario" onClick={() => setForm({ ...form, itens: [...form.itens, { ...LINHA_VAZIA }] })}>
              + Adicionar item
            </button>

            <div className="linha-campos" style={{ marginTop: 16 }}>
              <div className="campo">
                <label>Forma de recebimento*</label>
                <select value={form.formaRecebimento} onChange={(e) => setForm({ ...form, formaRecebimento: e.target.value as FormaRecebimento })}>
                  {FORMAS_RECEBIMENTO.map((f) => <option key={f} value={f}>{rotuloForma[f]}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Desconto (R$)</label>
                <input type="number" step="0.01" min="0" value={form.desconto} onChange={(e) => setForm({ ...form, desconto: e.target.value })} />
              </div>
              <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end' }}>
                <input type="checkbox" style={{ width: 'auto' }} id="atacado" checked={form.atacado} onChange={(e) => mudarAtacado(e.target.checked)} />
                <label htmlFor="atacado" style={{ margin: 0 }}>Preço de atacado</label>
              </div>
            </div>
            <div className="campo">
              <label>Observação</label>
              <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <strong style={{ fontSize: 18 }}>Total: {formataReal(totalPrevisto)}</strong>
            </div>

            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn">Registrar venda</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

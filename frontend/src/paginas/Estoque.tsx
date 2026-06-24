import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, rotuloMovimento } from '../api'
import { useLojaAtiva } from '../componentes/SeletorLoja'

// Estoque central (único da fábrica/marca) — não há mais estoque por loja nem transferências.
interface DashEstoque {
  rede: { nome: string }
  totalPecas: number; valorCusto: number; valorVenda: number; skus: number
  criticosCount: number; paradosCount: number
  criticos: { produto: string; referencia: string | null; cor: string; tamanho: string; estoque: number; estoqueMinimo: number }[]
  parados: { produto: string; referencia: string | null; cor: string; tamanho: string; estoque: number; valorCusto: number }[]
}
interface Inteligencia {
  campeoes: { produto: string; referencia: string | null; qtd: number }[]
  ruptura: { produto: string; referencia: string | null; cor: string; tamanho: string; estoque: number; vendidos30: number; diasEstimados: number }[]
}

interface VariacaoP { id: string; cor: string; tamanho: string; estoque: number; estoqueVarejo: number; sku: string }
interface ProdutoP { id: string; nome: string; referencia?: string | null; variacoes: VariacaoP[] }

interface Movimento {
  id: string
  tipo: string
  quantidade: number
  motivo?: string | null
  createdAt: string
  variacao: { cor: string; tamanho: string; sku: string; produto: { nome: string; referencia?: string | null } }
}

interface LinhaEntrada { produtoId: string; variacaoId: string; quantidade: number }
interface FormEntrada { nota: string; observacao: string; itens: LinhaEntrada[] }
interface FormAjuste { produtoId: string; variacaoId: string; novaQuantidade: string; motivo: string }
interface FormReserva { produtoId: string; variacaoId: string; quantidadeVarejo: string }

const LINHA: LinhaEntrada = { produtoId: '', variacaoId: '', quantidade: 1 }
const TIPOS = ['', 'ENTRADA', 'SAIDA_VENDA', 'AJUSTE', 'DEVOLUCAO']
const gridEntrada = { display: 'grid', gridTemplateColumns: '1.7fr 1.2fr 80px 36px', gap: 8, alignItems: 'end', marginBottom: 8 } as const

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="cartao kpi">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
    </div>
  )
}

export default function Estoque() {
  const escopo = useLojaAtiva()
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [dash, setDash] = useState<DashEstoque | null>(null)
  const [intel, setIntel] = useState<Inteligencia | null>(null)
  const [tipo, setTipo] = useState('')
  const [produtos, setProdutos] = useState<ProdutoP[]>([])
  const [entrada, setEntrada] = useState<FormEntrada | null>(null)
  const [ajuste, setAjuste] = useState<FormAjuste | null>(null)
  const [reserva, setReserva] = useState<FormReserva | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const params = { ...escopo.params, ...(tipo ? { tipo } : {}) }
    const { data } = await api.get('/estoque/movimentos', { params })
    setMovimentos(data)
  }, [tipo, escopo.pronto, escopo.params])

  const carregarDash = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/estoque/dashboard', { params: escopo.params })
    setDash(data)
    const { data: i } = await api.get('/estoque/inteligencia', { params: escopo.params })
    setIntel(i)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar(); carregarDash() }, [carregar, carregarDash])

  async function carregarProdutos() {
    const { data } = await api.get('/produtos', { params: { ...escopo.params, ativo: 'true' } })
    setProdutos(data)
    return data as ProdutoP[]
  }

  async function abrirEntrada() {
    setErro(''); setAviso('')
    await carregarProdutos()
    setEntrada({ nota: '', observacao: '', itens: [{ ...LINHA }] })
  }

  async function abrirAjuste() {
    setErro(''); setAviso('')
    await carregarProdutos()
    setAjuste({ produtoId: '', variacaoId: '', novaQuantidade: '', motivo: '' })
  }

  async function abrirReserva() {
    setErro(''); setAviso('')
    await carregarProdutos()
    setReserva({ produtoId: '', variacaoId: '', quantidadeVarejo: '' })
  }

  async function salvarReserva(e: React.FormEvent) {
    e.preventDefault()
    if (!reserva) return
    setErro('')
    if (!reserva.variacaoId || reserva.quantidadeVarejo === '') {
      return setErro('Escolha a variação e a quantidade para varejo.')
    }
    try {
      const { data } = await api.post('/estoque/reserva-varejo', { variacaoId: reserva.variacaoId, quantidadeVarejo: Number(reserva.quantidadeVarejo) }, { params: escopo.params })
      setReserva(null)
      setAviso(`Reserva de varejo definida: ${data.estoqueVarejo} p/ varejo · ${data.estoqueAtacado} p/ atacado.`)
      carregar(); carregarDash()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  function variacoesDe(produtoId: string): VariacaoP[] {
    return produtos.find((p) => p.id === produtoId)?.variacoes ?? []
  }

  function mudarLinha(i: number, patch: Partial<LinhaEntrada>) {
    if (!entrada) return
    const itens = entrada.itens.map((l, idx) => {
      if (idx !== i) return l
      const novo = { ...l, ...patch }
      if (patch.produtoId !== undefined) novo.variacaoId = ''
      return novo
    })
    setEntrada({ ...entrada, itens })
  }

  async function salvarEntrada(e: React.FormEvent) {
    e.preventDefault()
    if (!entrada) return
    setErro('')
    if (entrada.itens.some((l) => !l.variacaoId || Number(l.quantidade) < 1)) {
      return setErro('Cada item precisa de uma variação e quantidade ≥ 1.')
    }
    const corpo = {
      nota: entrada.nota || undefined,
      observacao: entrada.observacao || undefined,
      itens: entrada.itens.map((l) => ({ variacaoId: l.variacaoId, quantidade: Number(l.quantidade) })),
    }
    try {
      const { data } = await api.post('/estoque/entrada', corpo, { params: escopo.params })
      setEntrada(null)
      setAviso(`Entrada registrada: ${data.totalPecas} peça(s) em ${data.itens} item(ns).`)
      carregar(); carregarDash()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function salvarAjuste(e: React.FormEvent) {
    e.preventDefault()
    if (!ajuste) return
    setErro('')
    if (!ajuste.variacaoId || ajuste.novaQuantidade === '' || !ajuste.motivo.trim()) {
      return setErro('Informe a variação, a nova quantidade e o motivo.')
    }
    try {
      const { data } = await api.post('/estoque/ajuste', { variacaoId: ajuste.variacaoId, novaQuantidade: Number(ajuste.novaQuantidade), motivo: ajuste.motivo }, { params: escopo.params })
      setAjuste(null)
      setAviso(data.delta === 0 ? 'Sem diferença: estoque já estava correto.' : `Ajuste aplicado (${data.delta > 0 ? '+' : ''}${data.delta}).`)
      carregar(); carregarDash()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  const ajusteVar = ajuste ? variacoesDe(ajuste.produtoId).find((v) => v.id === ajuste.variacaoId) : undefined

  return (
    <>
      <header>
        <h1>Estoque</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn secundario" onClick={abrirReserva} disabled={!escopo.pronto}>Reserva varejo</button>
          <button className="btn secundario" onClick={abrirAjuste} disabled={!escopo.pronto}>Ajuste / contagem</button>
          <button className="btn" onClick={abrirEntrada} disabled={!escopo.pronto}>+ Entrada de produção</button>
        </div>
      </header>

      {aviso && <div className="sucesso">{aviso}</div>}
      {erro && !entrada && !ajuste && !reserva && <div className="alerta">{erro}</div>}

      {/* Estoque central da fábrica/marca (único — sem split por loja) */}
      {dash && (
        <>
          <h2 className="painel-titulo" style={{ margin: '4px 0 10px' }}>Estoque central — {dash.rede.nome}</h2>
          <div className="grade-cards">
            <Kpi rotulo="Valor em estoque (custo)" valor={formataReal(dash.valorCusto)} />
            <Kpi rotulo="Valor a varejo" valor={formataReal(dash.valorVenda)} />
            <Kpi rotulo="Peças" valor={String(dash.totalPecas)} />
            <Kpi rotulo="SKUs" valor={String(dash.skus)} />
            <Kpi rotulo="Estoque crítico" valor={String(dash.criticosCount)} />
            <Kpi rotulo="Parados (60d)" valor={String(dash.paradosCount)} />
          </div>

          <div className="grade-paineis" style={{ marginTop: 16 }}>
            <div className="cartao">
              <h2 className="painel-titulo">Parados / encalhados (60d)</h2>
              <table>
                <thead><tr><th>Produto</th><th>Grade</th><th>Estoque</th><th>Valor parado</th></tr></thead>
                <tbody>
                  {dash.parados.map((p, i) => (
                    <tr key={i}>
                      <td>{p.produto}<div style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'Consolas, monospace' }}>{p.referencia ?? ''}</div></td>
                      <td style={{ color: 'var(--ink-soft)' }}>{p.cor}/{p.tamanho}</td>
                      <td>{p.estoque}</td>
                      <td>{formataReal(p.valorCusto)}</td>
                    </tr>
                  ))}
                  {dash.parados.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ok)' }}>Nada parado há 60 dias. 👍</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="cartao">
              <h2 className="painel-titulo">Estoque crítico</h2>
              <table>
                <thead><tr><th>Produto</th><th>Grade</th><th>Estoque</th></tr></thead>
                <tbody>
                  {dash.criticos.map((c, i) => (
                    <tr key={i}>
                      <td>{c.produto}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{c.cor}/{c.tamanho}</td>
                      <td><span className="selo baixo">{c.estoque} (mín {c.estoqueMinimo})</span></td>
                    </tr>
                  ))}
                  {dash.criticos.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ok)' }}>Tudo acima do mínimo. 👍</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {intel && (intel.campeoes.length > 0 || intel.ruptura.length > 0) && (
        <div className="grade-paineis" style={{ marginTop: 16 }}>
          <div className="cartao">
            <h2 className="painel-titulo">🏆 Campeões de venda (30d)</h2>
            <table>
              <thead><tr><th>Produto</th><th>Ref.</th><th>Vendidos</th></tr></thead>
              <tbody>
                {intel.campeoes.map((c, i) => (
                  <tr key={i}><td>{c.produto}</td><td style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{c.referencia ?? '—'}</td><td><strong>{c.qtd}</strong></td></tr>
                ))}
                {intel.campeoes.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>Sem vendas no período.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="cartao">
            <h2 className="painel-titulo">⚠ Risco de ruptura</h2>
            <table>
              <thead><tr><th>Produto</th><th>Grade</th><th>Estoque</th><th>Acaba em</th></tr></thead>
              <tbody>
                {intel.ruptura.map((r, i) => (
                  <tr key={i}><td>{r.produto}</td><td style={{ color: 'var(--ink-soft)' }}>{r.cor}/{r.tamanho}</td><td>{r.estoque}</td><td><span className="selo baixo">~{r.diasEstimados} dia(s)</span></td></tr>
                ))}
                {intel.ruptura.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ok)' }}>Nenhum risco de ruptura. 👍</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="painel-titulo" style={{ margin: '20px 0 8px' }}>Movimentações</h2>
      <div className="cartao">
        <div className="campo" style={{ maxWidth: 260 }}>
          <label>Tipo de movimento</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => <option key={t} value={t}>{t ? rotuloMovimento[t] : 'Todos'}</option>)}
          </select>
        </div>
        <table>
          <thead>
            <tr><th>Data</th><th>Produto</th><th>Ref.</th><th>Grade</th><th>Tipo</th><th>Qtd</th><th>Motivo</th></tr>
          </thead>
          <tbody>
            {movimentos.map((m) => (
              <tr key={m.id}>
                <td>{dataHora(m.createdAt)}</td>
                <td>{m.variacao.produto.nome}</td>
                <td style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{m.variacao.produto.referencia ?? '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{m.variacao.cor}/{m.variacao.tamanho}</td>
                <td><span className={`selo ${m.quantidade >= 0 ? 'ok' : 'baixo'}`}>{rotuloMovimento[m.tipo] ?? m.tipo}</span></td>
                <td style={{ fontWeight: 600, color: m.quantidade >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                  {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                </td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{m.motivo ?? '—'}</td>
              </tr>
            ))}
            {movimentos.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>Nenhum movimento.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Entrada de produção */}
      {entrada && (
        <div className="modal-fundo" onClick={() => setEntrada(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarEntrada}>
            <h2>Entrada de produção</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>Nota / lote (confecção)</label>
                <input value={entrada.nota} onChange={(e) => setEntrada({ ...entrada, nota: e.target.value })} placeholder="Ex.: NF 1042" />
              </div>
              <div className="campo">
                <label>Observação</label>
                <input value={entrada.observacao} onChange={(e) => setEntrada({ ...entrada, observacao: e.target.value })} />
              </div>
            </div>

            <h3 style={{ marginBottom: 8 }}>Itens recebidos</h3>
            <div style={{ ...gridEntrada, fontSize: 12, color: 'var(--ink-soft)' }}>
              <span>Produto</span><span>Variação</span><span>Qtd</span><span></span>
            </div>
            {entrada.itens.map((l, i) => (
              <div style={gridEntrada} key={i}>
                <select value={l.produtoId} onChange={(e) => mudarLinha(i, { produtoId: e.target.value })} required>
                  <option value="">— Produto —</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.referencia ? `${p.referencia} · ` : ''}{p.nome}</option>)}
                </select>
                <select value={l.variacaoId} onChange={(e) => mudarLinha(i, { variacaoId: e.target.value })} disabled={!l.produtoId} required>
                  <option value="">— Cor/Tam —</option>
                  {variacoesDe(l.produtoId).map((v) => <option key={v.id} value={v.id}>{v.cor}/{v.tamanho} (atual: {v.estoque})</option>)}
                </select>
                <input type="number" min="1" value={l.quantidade} onChange={(e) => mudarLinha(i, { quantidade: Number(e.target.value) })} />
                <button type="button" className="remover" title="Remover" style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 18, cursor: 'pointer' }}
                  onClick={() => setEntrada({ ...entrada, itens: entrada.itens.filter((_, idx) => idx !== i) })}
                  disabled={entrada.itens.length === 1}>×</button>
              </div>
            ))}
            <button type="button" className="btn secundario" onClick={() => setEntrada({ ...entrada, itens: [...entrada.itens, { ...LINHA }] })}>
              + Adicionar item
            </button>

            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setEntrada(null)}>Cancelar</button>
              <button className="btn">Registrar entrada</button>
            </div>
          </form>
        </div>
      )}

      {/* Ajuste / contagem */}
      {ajuste && (
        <div className="modal-fundo" onClick={() => setAjuste(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarAjuste} style={{ width: 'min(520px, 92vw)' }}>
            <h2>Ajuste / contagem</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 0 }}>Defina a quantidade física real — o sistema registra a diferença.</p>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>Produto</label>
              <select value={ajuste.produtoId} onChange={(e) => setAjuste({ ...ajuste, produtoId: e.target.value, variacaoId: '' })} required>
                <option value="">— Produto —</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.referencia ? `${p.referencia} · ` : ''}{p.nome}</option>)}
              </select>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>Variação</label>
                <select value={ajuste.variacaoId} onChange={(e) => setAjuste({ ...ajuste, variacaoId: e.target.value })} disabled={!ajuste.produtoId} required>
                  <option value="">— Cor/Tam —</option>
                  {variacoesDe(ajuste.produtoId).map((v) => <option key={v.id} value={v.id}>{v.cor}/{v.tamanho}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Nova quantidade{ajusteVar ? ` (atual: ${ajusteVar.estoque})` : ''}</label>
                <input type="number" min="0" value={ajuste.novaQuantidade} onChange={(e) => setAjuste({ ...ajuste, novaQuantidade: e.target.value })} required />
              </div>
            </div>
            <div className="campo">
              <label>Motivo</label>
              <input value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} placeholder="Ex.: inventário, perda, correção" required />
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setAjuste(null)}>Cancelar</button>
              <button className="btn">Aplicar ajuste</button>
            </div>
          </form>
        </div>
      )}

      {/* Reserva de varejo: remaneja varejo ↔ atacado (não altera o total) */}
      {reserva && (() => {
        const rv = variacoesDe(reserva.produtoId).find((v) => v.id === reserva.variacaoId)
        return (
          <div className="modal-fundo" onClick={() => setReserva(null)}>
            <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarReserva} style={{ width: 'min(520px, 92vw)' }}>
              <h2>Reserva de varejo</h2>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 0 }}>
                Defina quantas peças desta variação ficam <strong>exclusivas do varejo</strong> (peças únicas). O restante fica para o atacado — não altera o total.
              </p>
              {erro && <div className="alerta">{erro}</div>}
              <div className="campo">
                <label>Produto</label>
                <select value={reserva.produtoId} onChange={(e) => setReserva({ ...reserva, produtoId: e.target.value, variacaoId: '', quantidadeVarejo: '' })} required>
                  <option value="">— Produto —</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.referencia ? `${p.referencia} · ` : ''}{p.nome}</option>)}
                </select>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>Variação</label>
                  <select value={reserva.variacaoId} disabled={!reserva.produtoId} required
                    onChange={(e) => { const id = e.target.value; const vv = variacoesDe(reserva.produtoId).find((x) => x.id === id); setReserva({ ...reserva, variacaoId: id, quantidadeVarejo: vv ? String(vv.estoqueVarejo) : '' }) }}>
                    <option value="">— Cor/Tam —</option>
                    {variacoesDe(reserva.produtoId).map((v) => <option key={v.id} value={v.id}>{v.cor}/{v.tamanho} (estoque {v.estoque})</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label>Qtd p/ varejo{rv ? ` (máx ${rv.estoque})` : ''}</label>
                  <input type="number" min="0" max={rv?.estoque} value={reserva.quantidadeVarejo} onChange={(e) => setReserva({ ...reserva, quantidadeVarejo: e.target.value })} disabled={!reserva.variacaoId} required />
                </div>
              </div>
              {rv && (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  Hoje: <strong>{rv.estoqueVarejo}</strong> p/ varejo · <strong>{rv.estoque - rv.estoqueVarejo}</strong> p/ atacado (total {rv.estoque}).
                </div>
              )}
              <div className="acoes">
                <button type="button" className="btn secundario" onClick={() => setReserva(null)}>Cancelar</button>
                <button className="btn">Salvar reserva</button>
              </div>
            </form>
          </div>
        )
      })()}
    </>
  )
}

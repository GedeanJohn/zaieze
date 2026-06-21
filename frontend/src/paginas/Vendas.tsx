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
  descontoPct: string
  observacao: string
  itens: LinhaItem[]
}

interface ConfigDesconto { regua: { ate: number | null; pct: number }[]; autoMaxPct: number; senhaMaxPct: number }
interface AutorizDesc { tipo: 'senha' | 'gerente'; senha: string; gEmail: string; gSenha: string; erro?: string }

const LINHA_VAZIA: LinhaItem = { produtoId: '', variacaoId: '', quantidade: 1, precoUnitario: '' }

function formataData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Vendas() {
  const usuario = usuarioLogado()!
  const gerente = usuario.role !== 'VENDEDORA'
  // Quem efetivamente registra venda: vendedora e gerente de loja. Gestor (rede) e admin supervisionam.
  const podeVender = usuario.role === 'VENDEDORA' || usuario.role === 'GERENTE'
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
  const [config, setConfig] = useState<ConfigDesconto>({ regua: [], autoMaxPct: 10, senhaMaxPct: 15 })
  const [autoriz, setAutoriz] = useState<AutorizDesc | null>(null)

  useEffect(() => {
    if (!escopo.pronto) return
    api.get('/vendas/config-desconto', { params: escopo.params }).then(({ data }) => setConfig(data)).catch(() => {})
  }, [escopo.pronto, escopo.params])

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
    setForm({ clienteId: prefClienteId, vendedoraId: '', canal: 'ONLINE', atacado: false, formaRecebimento: 'DINHEIRO', descontoPct: '', observacao: '', itens: [{ ...LINHA_VAZIA }] })
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

  const bruto = useMemo(
    () => form ? form.itens.reduce((s, l) => s + (Number(l.precoUnitario) || 0) * (Number(l.quantidade) || 0), 0) : 0,
    [form])
  const pct = Number(form?.descontoPct) || 0
  const descontoValor = Math.round(bruto * (pct / 100) * 100) / 100
  const totalPrevisto = Math.max(0, bruto - descontoValor)

  // % sugerido pela régua conforme o total bruto do pedido.
  const sugeridoPct = useMemo(() => {
    for (const faixa of config.regua) if (faixa.ate == null || bruto <= faixa.ate) return faixa.pct
    return config.regua.length ? config.regua[config.regua.length - 1].pct : 0
  }, [config.regua, bruto])
  const zonaDesconto = pct <= config.autoMaxPct ? 'ok' : pct <= config.senhaMaxPct ? 'senha' : 'gerente'

  function variacoesDe(produtoId: string): VariacaoP[] {
    return produtos.find((p) => p.id === produtoId)?.variacoes ?? []
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    if (gerente && !form.vendedoraId) return setErro('Selecione a vendedora da venda.')
    if (form.itens.some((l) => !l.variacaoId || Number(l.quantidade) < 1)) {
      return setErro('Cada item precisa de uma variação e quantidade ≥ 1.')
    }
    void enviar()
  }

  async function enviar(cred?: { senha?: string; gerenteEmail?: string; gerenteSenha?: string }) {
    if (!form) return
    const corpo = {
      clienteId: form.clienteId || undefined,
      vendedoraId: gerente ? form.vendedoraId : undefined,
      canal: form.canal,
      atacado: form.atacado,
      formaRecebimento: form.formaRecebimento,
      descontoPct: pct,
      autorizacao: cred,
      observacao: form.observacao || undefined,
      itens: form.itens.map((l) => ({
        variacaoId: l.variacaoId,
        quantidade: Number(l.quantidade),
        precoUnitario: l.precoUnitario ? Number(l.precoUnitario) : undefined,
      })),
    }
    try {
      await api.post('/vendas', corpo, { params: escopo.params })
      setForm(null); setAutoriz(null); carregar()
    } catch (err) {
      const code = (err as { response?: { data?: { erro?: string } } }).response?.data?.erro
      if (code === 'SENHA_NECESSARIA') {
        setAutoriz({ tipo: 'senha', senha: '', gEmail: '', gSenha: '', erro: cred ? 'Senha incorreta. Tente de novo.' : undefined })
      } else if (code === 'GERENTE_NECESSARIO') {
        setAutoriz((a) => ({ tipo: 'gerente', senha: '', gEmail: a?.gEmail ?? '', gSenha: '', erro: cred ? 'E-mail/senha do gerente inválidos.' : undefined }))
      } else {
        setErro(mensagemDeErro(err))
      }
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
          {podeVender && <button className="btn" onClick={() => abrirNova()} disabled={!escopo.pronto}>+ Nova venda</button>}
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
                <td style={{ whiteSpace: 'nowrap' }}>
                  <a href={`/pedido/${v.id}`} target="_blank" rel="noreferrer">🧾 pedido</a>
                  {gerente && v.status === 'CONCLUIDA' && (
                    <>{' · '}<a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); cancelar(v) }}>cancelar</a></>
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
              <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end' }}>
                <input type="checkbox" style={{ width: 'auto' }} id="atacado" checked={form.atacado} onChange={(e) => mudarAtacado(e.target.checked)} />
                <label htmlFor="atacado" style={{ margin: 0 }}>Preço de atacado</label>
              </div>
            </div>

            {/* Régua + slider de desconto */}
            <div className="desc-box">
              <div className="desc-cab">
                <label style={{ margin: 0 }}>Desconto</label>
                <div className="desc-regua">
                  {config.regua.map((f, i) => (
                    <span key={i} className={`desc-faixa ${f.pct === sugeridoPct ? 'sug' : ''}`}>
                      {f.ate == null ? '+' : `≤${(f.ate / 1000).toLocaleString('pt-BR')}k`} · {f.pct}%
                    </span>
                  ))}
                </div>
              </div>
              <div className="desc-slider">
                <input type="range" min={0} max={30} step={1} value={pct}
                  onChange={(e) => setForm({ ...form, descontoPct: e.target.value })} />
                <span className={`desc-pct ${zonaDesconto}`}>{pct}%</span>
                {sugeridoPct > 0 && pct !== sugeridoPct && (
                  <button type="button" className="desc-sug-btn" onClick={() => setForm({ ...form, descontoPct: String(sugeridoPct) })}>
                    usar sugerido ({sugeridoPct}%)
                  </button>
                )}
              </div>
              <div className={`desc-aviso ${zonaDesconto}`}>
                {zonaDesconto === 'ok' && `Liberado (até ${config.autoMaxPct}%).`}
                {zonaDesconto === 'senha' && `Acima de ${config.autoMaxPct}% — vai pedir sua senha ao registrar.`}
                {zonaDesconto === 'gerente' && `Acima de ${config.senhaMaxPct}% — precisa de autorização do gerente.`}
              </div>
            </div>

            <div className="campo">
              <label>Observação</label>
              <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>

            <div className="desc-totais">
              <div><span>Subtotal</span><span>{formataReal(bruto)}</span></div>
              {pct > 0 && <div className="desc"><span>Desconto ({pct}%)</span><span>− {formataReal(descontoValor)}</span></div>}
              <div className="tot"><span>Total</span><span>{formataReal(totalPrevisto)}</span></div>
            </div>

            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn">Registrar venda</button>
            </div>
          </form>
        </div>
      )}

      {/* Autorização do desconto */}
      {autoriz && (
        <div className="modal-fundo" onClick={() => setAutoriz(null)}>
          <form
            className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); void enviar({ senha: autoriz.senha, gerenteEmail: autoriz.gEmail, gerenteSenha: autoriz.gSenha }) }}
          >
            <h2>{autoriz.tipo === 'senha' ? 'Confirmar desconto' : 'Autorização do gerente'}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: -4 }}>
              {autoriz.tipo === 'senha'
                ? `Desconto de ${pct}% (${formataReal(descontoValor)}). Confirme sua senha para aplicar.`
                : `Desconto de ${pct}% acima do limite. Um gerente precisa autorizar.`}
            </p>
            {autoriz.erro && <div className="alerta">{autoriz.erro}</div>}
            {autoriz.tipo === 'senha' ? (
              <div className="campo">
                <label>Sua senha</label>
                <input type="password" autoFocus value={autoriz.senha} onChange={(e) => setAutoriz({ ...autoriz, senha: e.target.value })} required />
              </div>
            ) : (
              <>
                <div className="campo">
                  <label>E-mail do gerente</label>
                  <input type="email" autoFocus value={autoriz.gEmail} onChange={(e) => setAutoriz({ ...autoriz, gEmail: e.target.value })} required />
                </div>
                <div className="campo">
                  <label>Senha do gerente</label>
                  <input type="password" value={autoriz.gSenha} onChange={(e) => setAutoriz({ ...autoriz, gSenha: e.target.value })} required />
                </div>
              </>
            )}
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setAutoriz(null)}>Cancelar</button>
              <button className="btn">Autorizar e registrar</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

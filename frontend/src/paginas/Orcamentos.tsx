import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, formataReal, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'

type StatusOrc = 'RASCUNHO' | 'AGUARDANDO_APROVACAO_DESCONTO' | 'ENVIADO' | 'ALTERACAO_SOLICITADA' | 'CONVERTIDO' | 'CANCELADO'

interface ItemOrc {
  id: string
  variacaoId: string
  quantidade: number
  precoUnitario: string
  variacao: { produtoId: string; cor: string; tamanho: string; produto: { nome: string } }
}
interface Orcamento {
  id: string
  status: StatusOrc
  atacado: boolean
  descontoPct: string
  descontoSolicitadoPct: string | null
  total: string
  observacao?: string | null
  mensagemCliente?: string | null
  tokenPublico: string
  createdAt: string
  cliente: { id: string; nome: string; telefone: string | null }
  vendedora: { id: string; nome: string }
  aprovadoDescontoPor?: { id: string; nome: string } | null
  venda?: { id: string; tokenPublico: string } | null
  itens: ItemOrc[]
}

interface VariacaoP { id: string; cor: string; tamanho: string; estoque: number; estoqueVarejo: number }
interface ProdutoP { id: string; nome: string; precoVarejo: string; precoAtacado?: string | null; variacoes: VariacaoP[] }
interface Pessoa { id: string; nome: string; role?: string }
interface LinhaItem { produtoId: string; variacaoId: string; quantidade: number; precoUnitario: string }

interface FormOrc {
  id?: string
  clienteId: string
  vendedoraId: string
  atacado: boolean
  descontoPct: string
  observacao: string
  itens: LinhaItem[]
}

const LINHA_VAZIA: LinhaItem = { produtoId: '', variacaoId: '', quantidade: 1, precoUnitario: '' }
const EDITAVEL: StatusOrc[] = ['RASCUNHO', 'AGUARDANDO_APROVACAO_DESCONTO', 'ALTERACAO_SOLICITADA']

function formataData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function seloDe(status: StatusOrc): string {
  if (status === 'CONVERTIDO') return 'ok'
  if (status === 'CANCELADO') return 'baixo'
  if (status === 'ALTERACAO_SOLICITADA') return 'baixo'
  if (status === 'AGUARDANDO_APROVACAO_DESCONTO') return 'ATACADO'
  if (status === 'ENVIADO') return 'FREQUENTE'
  return 'NOVO'
}

export default function Orcamentos() {
  const usuario = usuarioLogado()!
  const { t } = useIdioma()
  const avisar = useToast()
  const gerente = usuario.role !== 'VENDEDORA'
  const podeCriar = usuario.role === 'VENDEDORA' || usuario.role === 'GERENTE'
  const podeAprovarDesconto = usuario.role === 'GERENTE' || usuario.role === 'GESTOR' || usuario.role === 'SUPER_ADMIN'
  const escopo = useLojaAtiva()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([])
  const [produtos, setProdutos] = useState<ProdutoP[]>([])
  const [clientes, setClientes] = useState<Pessoa[]>([])
  const [vendedoras, setVendedoras] = useState<Pessoa[]>([])
  const [autoMaxPct, setAutoMaxPct] = useState(10)
  const [form, setForm] = useState<FormOrc | null>(null)
  const [detalhe, setDetalhe] = useState<Orcamento | null>(null)
  const [erro, setErro] = useState('')
  const [processando, setProcessando] = useState(false)
  // true quando o editor foi aberto a partir de "Editar/fechar pedido" no card do Funil (ver
  // Pipeline.tsx) — nesse caso fecharForm() volta pro Funil em vez de deixar a vendedora "presa"
  // na lista de Orçamentos (o Funil não está no menu de baixo do celular, só dentro de "Mais").
  const [veioDoFunil, setVeioDoFunil] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/orcamentos', { params: escopo.params })
    setOrcamentos(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!escopo.pronto) return
    api.get('/vendas/config-desconto', { params: escopo.params }).then(({ data }) => setAutoMaxPct(data.autoMaxPct)).catch(() => {})
  }, [escopo.pronto, escopo.params])

  const carregarApoio = useCallback(async () => {
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
  }, [escopo.params, gerente])

  const abrirNovo = useCallback(async () => {
    setErro('')
    setVeioDoFunil(false)
    await carregarApoio()
    setForm({ clienteId: '', vendedoraId: '', atacado: false, descontoPct: '', observacao: '', itens: [{ ...LINHA_VAZIA }] })
  }, [carregarApoio])

  const abrirEdicao = useCallback(async (o: Orcamento) => {
    setErro('')
    setDetalhe(null)
    await carregarApoio()
    setForm({
      id: o.id, clienteId: o.cliente.id, vendedoraId: o.vendedora.id, atacado: o.atacado,
      descontoPct: String(o.descontoSolicitadoPct ?? o.descontoPct ?? '0'),
      observacao: o.observacao ?? '',
      itens: o.itens.map((i) => ({ produtoId: i.variacao.produtoId, variacaoId: i.variacaoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario })),
    })
  }, [carregarApoio])

  // Veio de "Editar pedido" no card do Funil (ver Pipeline.tsx) — abre direto na janela de
  // edição desse orçamento recém-criado a partir do carrinho da vitrine.
  useEffect(() => {
    const idParaAbrir = searchParams.get('abrir')
    if (!idParaAbrir || !escopo.pronto) return
    setSearchParams((p) => { p.delete('abrir'); return p }, { replace: true })
    api.get(`/orcamentos/${idParaAbrir}`, { params: escopo.params })
      .then(({ data }) => { setVeioDoFunil(true); return abrirEdicao(data) })
      .catch((err) => avisar(mensagemDeErro(err), 'erro'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escopo.pronto, escopo.params])

  function fecharForm() {
    setForm(null); setErro('')
    if (veioDoFunil) { setVeioDoFunil(false); navigate('/funil') }
  }

  function precoSugerido(produtoId: string, atacado: boolean): string {
    const p = produtos.find((x) => x.id === produtoId)
    if (!p) return ''
    if (atacado && p.precoAtacado) return p.precoAtacado
    return p.precoVarejo
  }

  function variacoesDe(produtoId: string): VariacaoP[] {
    return produtos.find((p) => p.id === produtoId)?.variacoes ?? []
  }

  function mudarLinha(i: number, patch: Partial<LinhaItem>) {
    if (!form) return
    const itens = form.itens.map((l, idx) => {
      if (idx !== i) return l
      const novo = { ...l, ...patch }
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
    const itens = form.itens.map((l) => ({ ...l, precoUnitario: l.produtoId ? precoSugerido(l.produtoId, atacado) : l.precoUnitario }))
    setForm({ ...form, atacado, itens })
  }

  const bruto = useMemo(() => form ? form.itens.reduce((s, l) => s + (Number(l.precoUnitario) || 0) * (Number(l.quantidade) || 0), 0) : 0, [form])
  const pct = Number(form?.descontoPct) || 0
  const descontoValor = Math.round(bruto * (pct / 100) * 100) / 100
  const totalPrevisto = Math.max(0, bruto - descontoValor)
  const precisaAprovacao = pct > autoMaxPct

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    if (!form.clienteId) return setErro(t('orc.erroSelecioneCliente'))
    if (gerente && !form.vendedoraId) return setErro(t('vendas.erroSelecioneVendedora'))
    if (form.itens.some((l) => !l.variacaoId || Number(l.quantidade) < 1)) return setErro(t('vendas.erroItemInvalido'))
    const corpo = {
      clienteId: form.clienteId,
      vendedoraId: gerente ? form.vendedoraId : undefined,
      atacado: form.atacado,
      descontoPct: pct,
      observacao: form.observacao || undefined,
      itens: form.itens.map((l) => ({
        variacaoId: l.variacaoId,
        quantidade: Number(l.quantidade),
        precoUnitario: l.precoUnitario ? Number(l.precoUnitario) : undefined,
      })),
    }
    try {
      if (form.id) await api.patch(`/orcamentos/${form.id}`, corpo, { params: escopo.params })
      else await api.post('/orcamentos', corpo, { params: escopo.params })
      fecharForm()
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function enviar(o: Orcamento) {
    setProcessando(true)
    try {
      const { data } = await api.post(`/orcamentos/${o.id}/enviar`, {}, { params: escopo.params })
      avisar(data.envio?.status === 'ENVIADA' ? t('orc.enviadoSucesso') : t('orc.enviadoSimulado'))
      setDetalhe(null)
      carregar()
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function cancelar(o: Orcamento) {
    if (!window.confirm(t('orc.confirmarCancelar'))) return
    setProcessando(true)
    try {
      await api.post(`/orcamentos/${o.id}/cancelar`, {}, { params: escopo.params })
      setDetalhe(null)
      carregar()
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aprovarDesconto(o: Orcamento) {
    setProcessando(true)
    try {
      await api.post(`/orcamentos/${o.id}/aprovar-desconto`, {}, { params: escopo.params })
      avisar(t('orc.descontoAprovado'))
      carregar()
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function recusarDesconto(o: Orcamento) {
    setProcessando(true)
    try {
      await api.post(`/orcamentos/${o.id}/recusar-desconto`, {}, { params: escopo.params })
      avisar(t('orc.descontoRecusado'))
      carregar()
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    } finally {
      setProcessando(false)
    }
  }

  function copiarLink(o: Orcamento) {
    const link = `${window.location.origin}/orcamento/publico/${o.tokenPublico}`
    navigator.clipboard?.writeText(link).then(() => avisar(t('orc.linkCopiado'))).catch(() => {})
  }

  async function abrirDetalhe(o: Orcamento) {
    try {
      const { data } = await api.get(`/orcamentos/${o.id}`, { params: escopo.params })
      setDetalhe(data)
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    }
  }

  return (
    <>
      <header>
        <h1>{t('orc.titulo')}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          {podeCriar && <button className="btn" onClick={abrirNovo} disabled={!escopo.pronto}>{t('orc.novoOrcamento')}</button>}
        </div>
      </header>

      <div className="cartao">
        <table>
          <thead>
            <tr>
              <th>{t('orc.data')}</th><th>{t('orc.cliente')}</th>
              {gerente && <th>{t('vendas.vendedora')}</th>}
              <th>{t('vendas.itens')}</th><th>{t('vendas.total')}</th><th>{t('vendas.status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {orcamentos.map((o) => (
              <tr key={o.id} style={{ opacity: o.status === 'CANCELADO' ? 0.5 : 1 }}>
                <td>{formataData(o.createdAt)}</td>
                <td>{o.cliente.nome}</td>
                {gerente && <td>{o.vendedora.nome}</td>}
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {o.itens.map((i) => `${i.quantidade}× ${i.variacao.produto.nome} ${i.variacao.cor}/${i.variacao.tamanho}`).join(' · ')}
                </td>
                <td>{formataReal(o.total)}</td>
                <td><span className={`selo ${seloDe(o.status)}`}>{t(`orc.status.${o.status}`)}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); abrirDetalhe(o) }}>{t('orc.verLink')}</a>
                </td>
              </tr>
            ))}
            {orcamentos.length === 0 && (
              <tr><td colSpan={gerente ? 7 : 6} style={{ color: 'var(--ink-soft)' }}>{t('orc.nenhumOrcamento')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Janela de detalhe — visão do gerente e ações do fluxo */}
      {detalhe && (
        <div className="modal-fundo" onClick={() => setDetalhe(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{detalhe.cliente.nome}</h2>
                <span className={`selo ${seloDe(detalhe.status)}`}>{t(`orc.status.${detalhe.status}`)}</span>
              </div>
              <button className="btn secundario" onClick={() => setDetalhe(null)}>{t('cli.fechar')}</button>
            </div>

            <div style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '10px 0' }}>
              {t('vendas.vendedora')}: {detalhe.vendedora.nome}
              {detalhe.atacado ? `  🏷️${t('vendas.atacadoTag')}` : ''}
            </div>

            <table>
              <thead><tr><th>{t('vendas.produto')}</th><th>{t('vendas.variacao')}</th><th>{t('vendas.qtd')}</th><th>{t('vendas.precoUn')}</th></tr></thead>
              <tbody>
                {detalhe.itens.map((i) => (
                  <tr key={i.id}>
                    <td>{i.variacao.produto.nome}</td>
                    <td>{i.variacao.cor}/{i.variacao.tamanho}</td>
                    <td>{i.quantidade}</td>
                    <td>{formataReal(i.precoUnitario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="desc-totais">
              {Number(detalhe.descontoPct) > 0 && <div className="desc"><span>{t('vendas.desconto')} ({detalhe.descontoPct}%)</span><span></span></div>}
              <div className="tot"><span>{t('vendas.total')}</span><span>{formataReal(detalhe.total)}</span></div>
            </div>

            {detalhe.status === 'AGUARDANDO_APROVACAO_DESCONTO' && (
              <div className="alerta" style={{ background: '#fff3e0', color: 'var(--warn)' }}>
                {t('orc.descontoSolicitadoAviso', { pct: detalhe.descontoSolicitadoPct ?? '0' })}
              </div>
            )}
            {detalhe.status === 'ALTERACAO_SOLICITADA' && detalhe.mensagemCliente && (
              <div className="alerta" style={{ background: '#fff3e0', color: 'var(--warn)' }}>
                <strong>{t('orc.clientePediu')}</strong> {detalhe.mensagemCliente}
              </div>
            )}
            {detalhe.status === 'CONVERTIDO' && detalhe.venda && (
              <div style={{ fontSize: 13, marginTop: 8 }}>
                <a href={`/pedido/${detalhe.venda.id}`} target="_blank" rel="noreferrer">🧾 {t('orc.verVendaGerada')}</a>
              </div>
            )}

            {(detalhe.status === 'RASCUNHO' || detalhe.status === 'ALTERACAO_SOLICITADA') && (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '10px 0 0' }}>
                {t('orc.previewExplicacao')}{' '}
                <a href={`/orcamento/publico/${detalhe.tokenPublico}`} target="_blank" rel="noreferrer">👁 {t('orc.previewLink')}</a>
              </div>
            )}

            <div className="acoes" style={{ flexWrap: 'wrap' }}>
              {EDITAVEL.includes(detalhe.status) && (
                <button type="button" className="btn secundario" onClick={() => { setVeioDoFunil(false); abrirEdicao(detalhe) }}>{t('orc.editar')}</button>
              )}
              {detalhe.status === 'AGUARDANDO_APROVACAO_DESCONTO' && podeAprovarDesconto && (
                <>
                  <button type="button" className="btn secundario" disabled={processando} onClick={() => recusarDesconto(detalhe)}>{t('orc.recusarDesconto')}</button>
                  <button type="button" className="btn" disabled={processando} onClick={() => aprovarDesconto(detalhe)}>{t('orc.aprovarDesconto')}</button>
                </>
              )}
              {(detalhe.status === 'RASCUNHO' || detalhe.status === 'ALTERACAO_SOLICITADA') && (
                <button type="button" className="btn" disabled={processando} onClick={() => enviar(detalhe)}>{t('orc.enviarCliente')}</button>
              )}
              {detalhe.status === 'ENVIADO' && (
                <button type="button" className="btn secundario" onClick={() => copiarLink(detalhe)}>{t('orc.copiarLink')}</button>
              )}
              {detalhe.status !== 'CONVERTIDO' && detalhe.status !== 'CANCELADO' && (
                <button type="button" className="btn secundario" style={{ color: 'var(--danger)' }} disabled={processando} onClick={() => cancelar(detalhe)}>{t('orc.cancelarOrcamento')}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Criar / editar orçamento */}
      {form && (
        <div className="modal-fundo" onClick={fecharForm}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            {veioDoFunil && (
              <button type="button" className="btn secundario" style={{ marginBottom: 10 }} onClick={fecharForm}>
                ← {t('orc.voltarFunil')}
              </button>
            )}
            <h2>{form.id ? t('orc.editarOrcamento') : t('orc.novoOrcamento')}</h2>
            {erro && <div className="alerta">{erro}</div>}

            <div className="linha-campos">
              <div className="campo">
                <label>{t('vendas.cliente')}</label>
                <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })} required>
                  <option value="">{t('comum.selecione')}</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              {gerente && (
                <div className="campo">
                  <label>{t('vendas.vendedoraObrig')}</label>
                  <select value={form.vendedoraId} onChange={(e) => setForm({ ...form, vendedoraId: e.target.value })} required>
                    <option value="">{t('comum.selecione')}</option>
                    {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
              )}
              <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end' }}>
                <input type="checkbox" style={{ width: 'auto' }} id="orc-atacado" checked={form.atacado} onChange={(e) => mudarAtacado(e.target.checked)} />
                <label htmlFor="orc-atacado" style={{ margin: 0 }}>{t('vendas.precoAtacado')}</label>
              </div>
            </div>

            <h3 style={{ marginBottom: 8 }}>{t('vendas.itensTitulo')}</h3>
            <div className="grade-itens" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              <span>{t('vendas.produto')}</span><span>{t('vendas.variacao')}</span><span>{t('vendas.qtd')}</span><span>{t('vendas.precoUn')}</span><span></span>
            </div>
            {form.itens.map((l, i) => (
              <div className="grade-itens" key={i}>
                <select value={l.produtoId} onChange={(e) => mudarLinha(i, { produtoId: e.target.value })} required>
                  <option value="">{t('vendas.produtoPlaceholder')}</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <select value={l.variacaoId} onChange={(e) => mudarLinha(i, { variacaoId: e.target.value })} disabled={!l.produtoId} required>
                  <option value="">{t('vendas.corTamPlaceholder')}</option>
                  {variacoesDe(l.produtoId).map((v) => <option key={v.id} value={v.id}>{v.cor}/{v.tamanho}</option>)}
                </select>
                <input type="number" min="1" value={l.quantidade} onChange={(e) => mudarLinha(i, { quantidade: Number(e.target.value) })} />
                <input type="number" step="0.01" min="0" value={l.precoUnitario} onChange={(e) => mudarLinha(i, { precoUnitario: e.target.value })} placeholder="auto" />
                <button
                  type="button" className="remover" title={t('comum.excluir')}
                  onClick={() => setForm({ ...form, itens: form.itens.filter((_, idx) => idx !== i) })}
                  disabled={form.itens.length === 1}
                >×</button>
              </div>
            ))}
            <button type="button" className="btn secundario" onClick={() => setForm({ ...form, itens: [...form.itens, { ...LINHA_VAZIA }] })}>
              {t('vendas.adicionarItem')}
            </button>

            <div className="campo" style={{ marginTop: 16, maxWidth: 200 }}>
              <label>{t('orc.descontoLabel', { pct: autoMaxPct })}</label>
              <input type="number" min="0" max="90" value={form.descontoPct} onChange={(e) => setForm({ ...form, descontoPct: e.target.value })} />
            </div>
            {precisaAprovacao && <div className="alerta" style={{ background: '#fff3e0', color: 'var(--warn)' }}>{t('orc.avisoPrecisaAprovacao')}</div>}

            <div className="campo">
              <label>{t('vendas.observacao')}</label>
              <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>

            <div className="desc-totais">
              <div><span>{t('vendas.subtotal')}</span><span>{formataReal(bruto)}</span></div>
              {pct > 0 && <div className="desc"><span>{t('vendas.desconto')} ({pct}%)</span><span>− {formataReal(descontoValor)}</span></div>}
              <div className="tot"><span>{t('vendas.total')}</span><span>{formataReal(totalPrevisto)}</span></div>
            </div>

            <div className="acoes">
              <button type="button" className="btn secundario" onClick={fecharForm}>{t('comum.cancelar')}</button>
              <button className="btn">{t('orc.salvarOrcamento')}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

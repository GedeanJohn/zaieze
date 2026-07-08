import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro } from '../api'
import { useLojaAtiva } from '../componentes/SeletorLoja'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'

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
interface DemandaReserva {
  variacaoId: string; produto: string; referencia: string | null; cor: string; tamanho: string
  estoqueAtual: number; quantidadePendente: number; quantidadeDisponivel: number; pedidos: number; maisAntigoEm: string
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

function rotuloMovimento(tipo: string, t: (chave: string) => string): string {
  return t(`mov.${tipo.toLowerCase()}`)
}

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
  const { t } = useIdioma()
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [dash, setDash] = useState<DashEstoque | null>(null)
  const [intel, setIntel] = useState<Inteligencia | null>(null)
  const [demanda, setDemanda] = useState<DemandaReserva[]>([])
  const [tipo, setTipo] = useState('')
  const [produtos, setProdutos] = useState<ProdutoP[]>([])
  const [entrada, setEntrada] = useState<FormEntrada | null>(null)
  const [ajuste, setAjuste] = useState<FormAjuste | null>(null)
  const [reserva, setReserva] = useState<FormReserva | null>(null)
  const [erro, setErro] = useState('')
  const avisar = useToast()

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

  const carregarDemanda = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/reservas/demanda', { params: escopo.params })
    setDemanda(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar(); carregarDash(); carregarDemanda() }, [carregar, carregarDash, carregarDemanda])

  async function carregarProdutos() {
    const { data } = await api.get('/produtos', { params: { ...escopo.params, ativo: 'true' } })
    setProdutos(data)
    return data as ProdutoP[]
  }

  async function abrirEntrada() {
    setErro('')
    await carregarProdutos()
    setEntrada({ nota: '', observacao: '', itens: [{ ...LINHA }] })
  }

  async function abrirAjuste() {
    setErro('')
    await carregarProdutos()
    setAjuste({ produtoId: '', variacaoId: '', novaQuantidade: '', motivo: '' })
  }

  async function abrirReserva() {
    setErro('')
    await carregarProdutos()
    setReserva({ produtoId: '', variacaoId: '', quantidadeVarejo: '' })
  }

  async function salvarReserva(e: React.FormEvent) {
    e.preventDefault()
    if (!reserva) return
    setErro('')
    if (!reserva.variacaoId || reserva.quantidadeVarejo === '') {
      return setErro(t('estq.erroReserva'))
    }
    try {
      const { data } = await api.post('/estoque/reserva-varejo', { variacaoId: reserva.variacaoId, quantidadeVarejo: Number(reserva.quantidadeVarejo) }, { params: escopo.params })
      setReserva(null)
      avisar(t('estq.reservaSucesso', { varejo: data.estoqueVarejo, atacado: data.estoqueAtacado }))
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
      return setErro(t('estq.erroItens'))
    }
    const corpo = {
      nota: entrada.nota || undefined,
      observacao: entrada.observacao || undefined,
      itens: entrada.itens.map((l) => ({ variacaoId: l.variacaoId, quantidade: Number(l.quantidade) })),
    }
    try {
      const { data } = await api.post('/estoque/entrada', corpo, { params: escopo.params })
      setEntrada(null)
      avisar(t('estq.entradaSucesso', { pecas: data.totalPecas, itens: data.itens }))
      carregar(); carregarDash(); carregarDemanda()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function salvarAjuste(e: React.FormEvent) {
    e.preventDefault()
    if (!ajuste) return
    setErro('')
    if (!ajuste.variacaoId || ajuste.novaQuantidade === '' || !ajuste.motivo.trim()) {
      return setErro(t('estq.erroAjuste'))
    }
    try {
      const { data } = await api.post('/estoque/ajuste', { variacaoId: ajuste.variacaoId, novaQuantidade: Number(ajuste.novaQuantidade), motivo: ajuste.motivo }, { params: escopo.params })
      setAjuste(null)
      avisar(data.delta === 0 ? t('estq.semDiferenca') : t('estq.ajusteAplicado', { sinal: data.delta > 0 ? '+' : '', delta: data.delta }))
      carregar(); carregarDash()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  const ajusteVar = ajuste ? variacoesDe(ajuste.produtoId).find((v) => v.id === ajuste.variacaoId) : undefined

  return (
    <>
      <header>
        <h1>{t('estq.titulo')}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn secundario" onClick={abrirReserva} disabled={!escopo.pronto}>{t('estq.reservaVarejo')}</button>
          <button className="btn secundario" onClick={abrirAjuste} disabled={!escopo.pronto}>{t('estq.ajusteContagem')}</button>
          <button className="btn" onClick={abrirEntrada} disabled={!escopo.pronto}>{t('estq.novaEntrada')}</button>
        </div>
      </header>

      {erro && !entrada && !ajuste && !reserva && <div className="alerta">{erro}</div>}

      {/* Estoque central da fábrica/marca (único — sem split por loja) */}
      {dash && (
        <>
          <h2 className="painel-titulo" style={{ margin: '4px 0 10px' }}>{t('estq.estoqueCentral', { nome: dash.rede.nome })}</h2>
          <div className="grade-cards">
            <Kpi rotulo={t('estq.valorEstoqueCusto')} valor={formataReal(dash.valorCusto)} />
            <Kpi rotulo={t('estq.valorVarejo')} valor={formataReal(dash.valorVenda)} />
            <Kpi rotulo={t('estq.pecas')} valor={String(dash.totalPecas)} />
            <Kpi rotulo={t('estq.skus')} valor={String(dash.skus)} />
            <Kpi rotulo={t('estq.estoqueCritico')} valor={String(dash.criticosCount)} />
            <Kpi rotulo={t('estq.paradosSufixo')} valor={String(dash.paradosCount)} />
          </div>

          <div className="grade-paineis" style={{ marginTop: 16 }}>
            <div className="cartao">
              <h2 className="painel-titulo">{t('estq.paradosTitulo')}</h2>
              <table>
                <thead><tr><th>{t('estq.colProduto')}</th><th>{t('estq.colGrade')}</th><th>{t('estq.colEstoque')}</th><th>{t('estq.colValorParado')}</th></tr></thead>
                <tbody>
                  {dash.parados.map((p, i) => (
                    <tr key={i}>
                      <td>{p.produto}<div style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'Consolas, monospace' }}>{p.referencia ?? ''}</div></td>
                      <td style={{ color: 'var(--ink-soft)' }}>{p.cor}/{p.tamanho}</td>
                      <td>{p.estoque}</td>
                      <td>{formataReal(p.valorCusto)}</td>
                    </tr>
                  ))}
                  {dash.parados.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ok)' }}>{t('estq.nadaParado')}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="cartao">
              <h2 className="painel-titulo">{t('estq.estoqueCritico')}</h2>
              <table>
                <thead><tr><th>{t('estq.colProduto')}</th><th>{t('estq.colGrade')}</th><th>{t('estq.colEstoque')}</th></tr></thead>
                <tbody>
                  {dash.criticos.map((c, i) => (
                    <tr key={i}>
                      <td>{c.produto}</td>
                      <td style={{ color: 'var(--ink-soft)' }}>{c.cor}/{c.tamanho}</td>
                      <td><span className="selo baixo">{c.estoque} ({t('estq.minSufixo', { n: c.estoqueMinimo })})</span></td>
                    </tr>
                  ))}
                  {dash.criticos.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ok)' }}>{t('estq.tudoAcimaMinimo')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Demanda de pedidos de reserva (peças esgotadas com cliente esperando) — para programar produção */}
      {demanda.length > 0 && (
        <div className="cartao" style={{ marginTop: 16 }}>
          <h2 className="painel-titulo">{t('estq.demandaReservaTitulo')}</h2>
          <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: -4 }}>{t('estq.demandaReservaExplicacao')}</p>
          <table>
            <thead>
              <tr>
                <th>{t('estq.colProduto')}</th><th>{t('estq.colGrade')}</th><th>{t('estq.colEstoque')}</th>
                <th>{t('estq.colDemandaPendente')}</th><th>{t('estq.colDemandaDisponivel')}</th><th>{t('estq.colPedidos')}</th><th>{t('estq.colMaisAntigo')}</th>
              </tr>
            </thead>
            <tbody>
              {demanda.map((d) => (
                <tr key={d.variacaoId}>
                  <td>{d.produto}<div style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'Consolas, monospace' }}>{d.referencia ?? ''}</div></td>
                  <td style={{ color: 'var(--ink-soft)' }}>{d.cor}/{d.tamanho}</td>
                  <td>{d.estoqueAtual}</td>
                  <td><span className="selo ATACADO">{d.quantidadePendente}</span></td>
                  <td>{d.quantidadeDisponivel > 0 ? <span className="selo ok">{d.quantidadeDisponivel}</span> : '—'}</td>
                  <td>{d.pedidos}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{dataHora(d.maisAntigoEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {intel && (intel.campeoes.length > 0 || intel.ruptura.length > 0) && (
        <div className="grade-paineis" style={{ marginTop: 16 }}>
          <div className="cartao">
            <h2 className="painel-titulo">{t('estq.campeoesTitulo')}</h2>
            <table>
              <thead><tr><th>{t('estq.colProduto')}</th><th>{t('estq.colRef')}</th><th>{t('estq.colVendidos')}</th></tr></thead>
              <tbody>
                {intel.campeoes.map((c, i) => (
                  <tr key={i}><td>{c.produto}</td><td style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{c.referencia ?? '—'}</td><td><strong>{c.qtd}</strong></td></tr>
                ))}
                {intel.campeoes.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>{t('estq.semVendasPeriodo')}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="cartao">
            <h2 className="painel-titulo">{t('estq.rupturaTitulo')}</h2>
            <table>
              <thead><tr><th>{t('estq.colProduto')}</th><th>{t('estq.colGrade')}</th><th>{t('estq.colEstoque')}</th><th>{t('estq.colAcabaEm')}</th></tr></thead>
              <tbody>
                {intel.ruptura.map((r, i) => (
                  <tr key={i}><td>{r.produto}</td><td style={{ color: 'var(--ink-soft)' }}>{r.cor}/{r.tamanho}</td><td>{r.estoque}</td><td><span className="selo baixo">{t('estq.diaSufixo', { n: r.diasEstimados })}</span></td></tr>
                ))}
                {intel.ruptura.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ok)' }}>{t('estq.nenhumRisco')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="painel-titulo" style={{ margin: '20px 0 8px' }}>{t('estq.movimentacoesTitulo')}</h2>
      <div className="cartao">
        <div className="campo" style={{ maxWidth: 260 }}>
          <label>{t('estq.tipoMovimento')}</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((tp) => <option key={tp} value={tp}>{tp ? rotuloMovimento(tp, t) : t('mov.todos')}</option>)}
          </select>
        </div>
        <table>
          <thead>
            <tr><th>{t('estq.colData')}</th><th>{t('estq.colProduto')}</th><th>{t('estq.colRef')}</th><th>{t('estq.colGrade')}</th><th>{t('estq.colTipo')}</th><th>{t('estq.colQtd')}</th><th>{t('estq.colMotivo')}</th></tr>
          </thead>
          <tbody>
            {movimentos.map((m) => (
              <tr key={m.id}>
                <td>{dataHora(m.createdAt)}</td>
                <td>{m.variacao.produto.nome}</td>
                <td style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{m.variacao.produto.referencia ?? '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{m.variacao.cor}/{m.variacao.tamanho}</td>
                <td><span className={`selo ${m.quantidade >= 0 ? 'ok' : 'baixo'}`}>{rotuloMovimento(m.tipo, t)}</span></td>
                <td style={{ fontWeight: 600, color: m.quantidade >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
                  {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                </td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{m.motivo ?? '—'}</td>
              </tr>
            ))}
            {movimentos.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>{t('estq.nenhumMovimento')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Entrada de produção */}
      {entrada && (
        <div className="modal-fundo" onClick={() => setEntrada(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarEntrada}>
            <h2>{t('estq.entradaTitulo')}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>{t('estq.notaLoteLabel')}</label>
                <input value={entrada.nota} onChange={(e) => setEntrada({ ...entrada, nota: e.target.value })} placeholder={t('estq.notaLotePlaceholder')} />
              </div>
              <div className="campo">
                <label>{t('estq.observacaoLabel')}</label>
                <input value={entrada.observacao} onChange={(e) => setEntrada({ ...entrada, observacao: e.target.value })} />
              </div>
            </div>

            <h3 style={{ marginBottom: 8 }}>{t('estq.itensRecebidos')}</h3>
            <div style={{ ...gridEntrada, fontSize: 12, color: 'var(--ink-soft)' }}>
              <span>{t('estq.produtoLabel')}</span><span>{t('estq.variacaoLabel')}</span><span>{t('estq.qtdLabel')}</span><span></span>
            </div>
            {entrada.itens.map((l, i) => (
              <div style={gridEntrada} key={i}>
                <select value={l.produtoId} onChange={(e) => mudarLinha(i, { produtoId: e.target.value })} required>
                  <option value="">{t('estq.produtoPlaceholderOpt')}</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.referencia ? `${p.referencia} · ` : ''}{p.nome}</option>)}
                </select>
                <select value={l.variacaoId} onChange={(e) => mudarLinha(i, { variacaoId: e.target.value })} disabled={!l.produtoId} required>
                  <option value="">{t('estq.corTamPlaceholderOpt')}</option>
                  {variacoesDe(l.produtoId).map((v) => <option key={v.id} value={v.id}>{v.cor}/{v.tamanho} ({t('estq.atualSufixo', { n: v.estoque })})</option>)}
                </select>
                <input type="number" min="1" value={l.quantidade} onChange={(e) => mudarLinha(i, { quantidade: Number(e.target.value) })} />
                <button type="button" className="remover" title={t('estq.remover')} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 18, cursor: 'pointer' }}
                  onClick={() => setEntrada({ ...entrada, itens: entrada.itens.filter((_, idx) => idx !== i) })}
                  disabled={entrada.itens.length === 1}>×</button>
              </div>
            ))}
            <button type="button" className="btn secundario" onClick={() => setEntrada({ ...entrada, itens: [...entrada.itens, { ...LINHA }] })}>
              {t('estq.adicionarItem')}
            </button>

            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setEntrada(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('estq.registrarEntrada')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Ajuste / contagem */}
      {ajuste && (
        <div className="modal-fundo" onClick={() => setAjuste(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarAjuste} style={{ width: 'min(520px, 92vw)' }}>
            <h2>{t('estq.ajusteTitulo')}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 0 }}>{t('estq.ajusteExplicacao')}</p>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>{t('estq.produtoLabel')}</label>
              <select value={ajuste.produtoId} onChange={(e) => setAjuste({ ...ajuste, produtoId: e.target.value, variacaoId: '' })} required>
                <option value="">{t('estq.produtoPlaceholderOpt')}</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.referencia ? `${p.referencia} · ` : ''}{p.nome}</option>)}
              </select>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>{t('estq.variacaoLabel')}</label>
                <select value={ajuste.variacaoId} onChange={(e) => setAjuste({ ...ajuste, variacaoId: e.target.value })} disabled={!ajuste.produtoId} required>
                  <option value="">{t('estq.corTamPlaceholderOpt')}</option>
                  {variacoesDe(ajuste.produtoId).map((v) => <option key={v.id} value={v.id}>{v.cor}/{v.tamanho}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>{t('estq.novaQuantidadeLabel')}{ajusteVar ? ` (${t('estq.atualSufixo', { n: ajusteVar.estoque })})` : ''}</label>
                <input type="number" min="0" value={ajuste.novaQuantidade} onChange={(e) => setAjuste({ ...ajuste, novaQuantidade: e.target.value })} required />
              </div>
            </div>
            <div className="campo">
              <label>{t('estq.motivoLabel')}</label>
              <input value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} placeholder={t('estq.motivoPlaceholder')} required />
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setAjuste(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('estq.aplicarAjuste')}</button>
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
              <h2>{t('estq.reservaTitulo')}</h2>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 0 }}>
                {t('estq.reservaExplicacao1')} <strong>{t('estq.exclusivasVarejo')}</strong> {t('estq.reservaExplicacao2')}
              </p>
              {erro && <div className="alerta">{erro}</div>}
              <div className="campo">
                <label>{t('estq.produtoLabel')}</label>
                <select value={reserva.produtoId} onChange={(e) => setReserva({ ...reserva, produtoId: e.target.value, variacaoId: '', quantidadeVarejo: '' })} required>
                  <option value="">{t('estq.produtoPlaceholderOpt')}</option>
                  {produtos.map((p) => <option key={p.id} value={p.id}>{p.referencia ? `${p.referencia} · ` : ''}{p.nome}</option>)}
                </select>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>{t('estq.variacaoLabel')}</label>
                  <select value={reserva.variacaoId} disabled={!reserva.produtoId} required
                    onChange={(e) => { const id = e.target.value; const vv = variacoesDe(reserva.produtoId).find((x) => x.id === id); setReserva({ ...reserva, variacaoId: id, quantidadeVarejo: vv ? String(vv.estoqueVarejo) : '' }) }}>
                    <option value="">{t('estq.corTamPlaceholderOpt')}</option>
                    {variacoesDe(reserva.produtoId).map((v) => <option key={v.id} value={v.id}>{v.cor}/{v.tamanho} ({t('estq.estoqueAtualSufixo', { n: v.estoque })})</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label>{t('estq.qtdParaVarejoLabel')}{rv ? ` (${t('estq.maxSufixo', { n: rv.estoque })})` : ''}</label>
                  <input type="number" min="0" max={rv?.estoque} value={reserva.quantidadeVarejo} onChange={(e) => setReserva({ ...reserva, quantidadeVarejo: e.target.value })} disabled={!reserva.variacaoId} required />
                </div>
              </div>
              {rv && (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {t('estq.hojeResumo', { varejo: rv.estoqueVarejo, atacado: rv.estoque - rv.estoqueVarejo, total: rv.estoque })}
                </div>
              )}
              <div className="acoes">
                <button type="button" className="btn secundario" onClick={() => setReserva(null)}>{t('comum.cancelar')}</button>
                <button className="btn">{t('estq.salvarReserva')}</button>
              </div>
            </form>
          </div>
        )
      })()}
    </>
  )
}

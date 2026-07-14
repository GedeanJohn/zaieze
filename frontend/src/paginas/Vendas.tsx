import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, formataReal, mensagemDeErro, usuarioLogado, FORMAS_RECEBIMENTO, rotuloForma, CANAIS_VENDA, rotuloCanal, type FormaRecebimento, type CanalVenda } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import CampoSenha from '../componentes/CampoSenha'
import { useIdioma } from '../lib/i18n'

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

interface VariacaoP { id: string; cor: string; tamanho: string; estoque: number; estoqueVarejo: number }
interface ProdutoP { id: string; nome: string; precoVarejo: string; precoAtacado?: string | null; variacoes: VariacaoP[] }
interface Pessoa { id: string; nome: string; role?: string }

interface LinhaItem { produtoId: string; variacaoId: string; quantidade: number; precoUnitario: string }

type StatusReserva = 'PENDENTE' | 'DISPONIVEL' | 'CONVERTIDO' | 'CANCELADO'
interface PedidoReserva {
  id: string
  status: StatusReserva
  quantidade: number
  precoUnitario: string
  atacado: boolean
  observacao?: string | null
  createdAt: string
  cliente?: { id: string; nome: string } | null
  vendedora: { id: string; nome: string }
  variacao: { cor: string; tamanho: string; produto: { nome: string } }
}

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
  const { t } = useIdioma()
  const gerente = usuario.role !== 'VENDEDORA'
  // Quem efetivamente registra venda: vendedora e gerente de loja. Gestor (rede) e admin supervisionam.
  const podeVender = usuario.role === 'VENDEDORA' || usuario.role === 'GERENTE'
  const escopo = useLojaAtiva()

  const [vendas, setVendas] = useState<Venda[]>([])
  const [reservas, setReservas] = useState<PedidoReserva[]>([])
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
  const [codigoLido, setCodigoLido] = useState('')
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)

  // Venda presencial (balcão): cliente coringa "Consumidor Outro" pré-selecionado; a
  // vendedora troca para um cliente cadastrado (ou cadastra um novo ali mesmo) se não for ele.
  const [presencial, setPresencial] = useState(false)
  const [consumidorOutro, setConsumidorOutro] = useState<Pessoa | null>(null)
  const [trocarCliente, setTrocarCliente] = useState(false)
  const [novoCliente, setNovoCliente] = useState<{ nome: string; telefone: string } | null>(null)
  const [salvandoCliente, setSalvandoCliente] = useState(false)

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

  const carregarReservas = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/reservas', { params: escopo.params })
    setReservas(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregarReservas() }, [carregarReservas])

  const abrirNova = useCallback(async (prefClienteId = '') => {
    setErro('')
    setPresencial(false)
    setTrocarCliente(false)
    setNovoCliente(null)
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

  // Venda presencial (balcão): abre o PDV já como Balcão, com o cliente coringa "Consumidor
  // Outro" pré-selecionado — a vendedora só troca de cliente se não for uma venda avulsa.
  const abrirPresencial = useCallback(async () => {
    setErro('')
    setTrocarCliente(false)
    setNovoCliente(null)
    const [prod, cli, consOutro] = await Promise.all([
      api.get('/produtos', { params: { ...escopo.params, ativo: 'true' } }),
      api.get('/clientes', { params: escopo.params }),
      api.get('/clientes/consumidor-outro', { params: escopo.params }),
    ])
    setProdutos(prod.data)
    setClientes(cli.data)
    if (gerente) {
      const { data } = await api.get('/usuarios', { params: escopo.params })
      setVendedoras(data.filter((u: Pessoa) => u.role === 'VENDEDORA'))
    }
    setConsumidorOutro(consOutro.data)
    setPresencial(true)
    setForm({ clienteId: consOutro.data.id, vendedoraId: '', canal: 'BALCAO', atacado: false, formaRecebimento: 'DINHEIRO', descontoPct: '', observacao: '', itens: [{ ...LINHA_VAZIA }] })
  }, [escopo.params, gerente])

  function fecharForm() {
    setForm(null)
    setPresencial(false)
    setTrocarCliente(false)
    setNovoCliente(null)
    setErro('')
  }

  async function salvarNovoClienteRapido() {
    if (!novoCliente?.nome.trim() || !form) return
    setSalvandoCliente(true)
    setErro('')
    try {
      const { data } = await api.post('/clientes', { nome: novoCliente.nome.trim(), telefone: novoCliente.telefone.trim() || undefined }, { params: escopo.params })
      setClientes((cs) => [...cs, { id: data.id, nome: data.nome }])
      setForm((f) => f && { ...f, clienteId: data.id })
      setNovoCliente(null)
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvandoCliente(false)
    }
  }

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

  // Quanto está disponível para VENDA IMEDIATA nesse canal (o resto vira "sob encomenda").
  function disponivelPara(v: VariacaoP, atacado: boolean): number {
    return atacado ? v.estoque - v.estoqueVarejo : v.estoqueVarejo
  }

  // Uma linha vira "sob encomenda" (pedido de reserva) quando o estoque do canal escolhido
  // não cobre a quantidade pedida — a peça esgotou (ou o balde do canal não tem o suficiente).
  function linhaSobEncomenda(l: LinhaItem): boolean {
    if (!form || !l.variacaoId) return false
    const v = variacoesDe(l.produtoId).find((x) => x.id === l.variacaoId)
    if (!v) return false
    return disponivelPara(v, form.atacado) < Number(l.quantidade || 1)
  }

  // Leitura de código de barras (venda presencial): leitor USB/Bluetooth digita o código + Enter,
  // como um teclado. Se a variação já está no carrinho, só soma 1; senão cria/preenche uma linha.
  async function lerCodigo(codigo: string) {
    const c = codigo.trim()
    if (!c || !form) return
    setBuscandoCodigo(true)
    setErro('')
    try {
      const { data } = await api.get('/produtos/variacao-por-codigo', { params: { ...escopo.params, codigo: c } })
      setForm((f) => {
        if (!f) return f
        const existente = f.itens.findIndex((l) => l.variacaoId === data.variacaoId)
        if (existente >= 0) {
          const itens = f.itens.map((l, idx) => (idx === existente ? { ...l, quantidade: Number(l.quantidade) + 1 } : l))
          return { ...f, itens }
        }
        const preco = f.atacado && data.precoAtacado ? data.precoAtacado : data.precoVarejo
        const novaLinha: LinhaItem = { produtoId: data.produtoId, variacaoId: data.variacaoId, quantidade: 1, precoUnitario: preco }
        const vazioIdx = f.itens.findIndex((l) => !l.produtoId)
        const itens = vazioIdx >= 0 ? f.itens.map((l, idx) => (idx === vazioIdx ? novaLinha : l)) : [...f.itens, novaLinha]
        return { ...f, itens }
      })
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setBuscandoCodigo(false)
      setCodigoLido('')
    }
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    if (gerente && !form.vendedoraId) return setErro(t('vendas.erroSelecioneVendedora'))
    if (form.itens.some((l) => !l.variacaoId || Number(l.quantidade) < 1)) {
      return setErro(t('vendas.erroItemInvalido'))
    }
    const flags = form.itens.map(linhaSobEncomenda)
    const algumaReserva = flags.some(Boolean)
    const todasReserva = flags.every(Boolean)
    if (algumaReserva && !todasReserva) return setErro(t('vendas.erroReservaMista'))
    if (todasReserva) return void enviarReserva()
    void enviar()
  }

  async function enviarReserva() {
    if (!form) return
    const corpo = {
      clienteId: form.clienteId || undefined,
      vendedoraId: gerente ? form.vendedoraId : undefined,
      atacado: form.atacado,
      observacao: form.observacao || undefined,
      itens: form.itens.map((l) => ({
        variacaoId: l.variacaoId,
        quantidade: Number(l.quantidade),
        precoUnitario: l.precoUnitario ? Number(l.precoUnitario) : undefined,
      })),
    }
    try {
      await api.post('/reservas', corpo, { params: escopo.params })
      fecharForm(); carregarReservas()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function confirmarReserva(p: PedidoReserva) {
    try {
      await api.post(`/reservas/${p.id}/confirmar`, {}, { params: escopo.params })
      carregarReservas(); carregar()
    } catch (err) {
      alert(mensagemDeErro(err))
    }
  }

  async function cancelarReserva(p: PedidoReserva) {
    if (!window.confirm(t('vendas.confirmarCancelarReserva'))) return
    try {
      await api.post(`/reservas/${p.id}/cancelar`, {}, { params: escopo.params })
      carregarReservas()
    } catch (err) {
      alert(mensagemDeErro(err))
    }
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
      fecharForm(); setAutoriz(null); carregar()
    } catch (err) {
      const code = (err as { response?: { data?: { erro?: string } } }).response?.data?.erro
      if (code === 'SENHA_NECESSARIA') {
        setAutoriz({ tipo: 'senha', senha: '', gEmail: '', gSenha: '', erro: cred ? t('vendas.erroSenhaIncorreta') : undefined })
      } else if (code === 'GERENTE_NECESSARIO') {
        setAutoriz((a) => ({ tipo: 'gerente', senha: '', gEmail: a?.gEmail ?? '', gSenha: '', erro: cred ? t('vendas.erroGerenteInvalido') : undefined }))
      } else {
        setErro(mensagemDeErro(err))
      }
    }
  }

  async function cancelar(v: Venda) {
    if (!window.confirm(`${t('vendas.confirmarCancelar')} ${formataReal(v.total)}${t('vendas.estoqueSeraDevolvido')}`)) return
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
        <h1>{t('vendas.titulo')}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          {podeVender && <button className="btn secundario" onClick={() => abrirPresencial()} disabled={!escopo.pronto}>{t('vendas.vendaPresencial')}</button>}
          {podeVender && <button className="btn" onClick={() => abrirNova()} disabled={!escopo.pronto}>{t('vendas.novaVenda')}</button>}
        </div>
      </header>

      <div className="cartao">
        <div className="linha-campos">
          <div className="campo">
            <label>{t('vendas.de')}</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="campo">
            <label>{t('vendas.ate')}</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="campo">
            <label>{t('vendas.canal')}</label>
            <select value={canalFiltro} onChange={(e) => setCanalFiltro(e.target.value)}>
              <option value="">{t('vendas.todosCanais')}</option>
              {CANAIS_VENDA.map((c) => <option key={c} value={c}>{t(`canal.${c}`) || rotuloCanal[c]}</option>)}
            </select>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>{t('vendas.data')}</th><th>{t('vendas.cliente')}</th><th>{t('vendas.vendedora')}</th><th>{t('vendas.canal')}</th><th>{t('vendas.itens')}</th>
              <th>{t('vendas.total')}</th><th>{t('vendas.recebimento')}</th><th>{t('vendas.status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((v) => (
              <tr key={v.id} style={{ opacity: v.status === 'CANCELADA' ? 0.5 : 1 }}>
                <td>{formataData(v.createdAt)}</td>
                <td>{v.cliente?.nome ?? '—'}</td>
                <td>{v.vendedora.nome}</td>
                <td>
                  <span style={{ fontSize: 13 }}>{v.canal === 'ONLINE' ? `📲 ${t('canal.ONLINE')}` : `🏬 ${t('canal.BALCAO')}`}</span>
                </td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {v.itens.map((i) => `${i.quantidade}× ${i.variacao.produto.nome} ${i.variacao.cor}/${i.variacao.tamanho}`).join(' · ')}
                  {v.atacado ? `  🏷️${t('vendas.atacadoTag')}` : ''}
                </td>
                <td>{formataReal(v.total)}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t(`forma.${v.formaRecebimento}`) || rotuloForma[v.formaRecebimento] || v.formaRecebimento}</td>
                <td>
                  <span className={`selo ${v.status === 'CONCLUIDA' ? 'ok' : 'baixo'}`}>
                    {v.status === 'CONCLUIDA' ? t('vendas.concluida') : t('vendas.cancelada')}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <a href={`/pedido/${v.id}`} target="_blank" rel="noreferrer">🧾 {t('vendas.pedido')}</a>
                  {gerente && v.status === 'CONCLUIDA' && (
                    <>{' · '}<a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); cancelar(v) }}>{t('vendas.cancelarLink')}</a></>
                  )}
                </td>
              </tr>
            ))}
            {vendas.length === 0 && (
              <tr><td colSpan={9} style={{ color: 'var(--ink-soft)' }}>{t('vendas.nenhumaVenda')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pedidos de reserva: peças esgotadas com demanda — a fábrica repõe, alguém confirma e vira venda. */}
      <div className="cartao">
        <h3 className="painel-titulo">{t('vendas.pedidosReservaTitulo')}</h3>
        <table>
          <thead>
            <tr>
              <th>{t('vendas.data')}</th><th>{t('vendas.cliente')}</th><th>{t('vendas.itens')}</th><th>{t('vendas.qtd')}</th>
              {gerente && <th>{t('vendas.vendedora')}</th>}
              <th>{t('vendas.status')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {reservas.map((r) => (
              <tr key={r.id} style={{ opacity: r.status === 'CANCELADO' ? 0.5 : 1 }}>
                <td>{formataData(r.createdAt)}</td>
                <td>{r.cliente?.nome ?? '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {r.variacao.produto.nome} {r.variacao.cor}/{r.variacao.tamanho}
                  {r.atacado ? `  🏷️${t('vendas.atacadoTag')}` : ''}
                </td>
                <td>{r.quantidade}</td>
                {gerente && <td>{r.vendedora.nome}</td>}
                <td>
                  <span className={`selo ${r.status === 'CANCELADO' ? 'baixo' : r.status === 'PENDENTE' ? 'ATACADO' : 'ok'}`}>
                    {t(`reserva.status.${r.status}`)}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.status === 'DISPONIVEL' && (
                    <a href="#" onClick={(e) => { e.preventDefault(); confirmarReserva(r) }}>{t('vendas.confirmarReservaLink')}</a>
                  )}
                  {(r.status === 'PENDENTE' || r.status === 'DISPONIVEL') && (
                    <>{r.status === 'DISPONIVEL' ? ' · ' : ''}<a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); cancelarReserva(r) }}>{t('vendas.cancelarLink')}</a></>
                  )}
                </td>
              </tr>
            ))}
            {reservas.length === 0 && (
              <tr><td colSpan={gerente ? 7 : 6} style={{ color: 'var(--ink-soft)' }}>{t('vendas.nenhumaReserva')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (() => {
        const itensComVariacao = form.itens.filter((l) => l.variacaoId)
        const modoReserva = itensComVariacao.length > 0 && itensComVariacao.every(linhaSobEncomenda)
        return (
        <div className="modal-fundo" onClick={fecharForm}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>{modoReserva ? t('vendas.pedidoReservaTitulo') : presencial ? t('vendas.vendaPresencialTitulo') : t('vendas.novaVendaTitulo')}</h2>
            {erro && <div className="alerta">{erro}</div>}
            {modoReserva && <div className="alerta" style={{ background: '#fff3e0', color: 'var(--warn)' }}>{t('vendas.avisoModoReserva')}</div>}

            <div className="linha-campos">
              <div className="campo">
                <label>{t('vendas.canalDaVenda')}</label>
                {presencial ? (
                  <input value={`🏬 ${t('canal.BALCAO')}`} disabled />
                ) : (
                  <select value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value as CanalVenda })}>
                    {CANAIS_VENDA.map((c) => <option key={c} value={c}>{t(`canal.${c}`) || rotuloCanal[c]}</option>)}
                  </select>
                )}
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
            </div>

            {presencial ? (
              <div className="campo">
                <label>{t('vendas.cliente')}</label>
                {!trocarCliente ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <strong>{consumidorOutro?.nome}</strong>
                    <a href="#" onClick={(e) => { e.preventDefault(); setTrocarCliente(true) }}>{t('vendas.trocarClienteLink')}</a>
                  </div>
                ) : (
                  <>
                    <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                      {consumidorOutro && <option value={consumidorOutro.id}>{consumidorOutro.nome}</option>}
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    {!novoCliente ? (
                      <a href="#" onClick={(e) => { e.preventDefault(); setNovoCliente({ nome: '', telefone: '' }) }}>{t('vendas.novoClienteRapido')}</a>
                    ) : (
                      <div className="linha-campos" style={{ marginTop: 8 }}>
                        <div className="campo">
                          <label>{t('cli.nomeObrig')}</label>
                          <input value={novoCliente.nome} onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} />
                        </div>
                        <div className="campo">
                          <label>{t('cli.whatsappComDdi')}</label>
                          <input value={novoCliente.telefone} onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })} placeholder="5562999998888" />
                        </div>
                        <button type="button" className="btn secundario" onClick={salvarNovoClienteRapido} disabled={!novoCliente.nome.trim() || salvandoCliente}>
                          {salvandoCliente ? '…' : t('comum.salvar')}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="campo">
                <label>{t('vendas.cliente')}</label>
                <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                  <option value="">{t('vendas.semClienteAvulsa')}</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}

            {presencial && (
              <div className="campo">
                <label>{t('vendas.tipoDeVenda')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className={`btn ${form.atacado ? 'secundario' : ''}`} onClick={() => mudarAtacado(false)}>{t('vendas.varejoOpc')}</button>
                  <button type="button" className={`btn ${form.atacado ? '' : 'secundario'}`} onClick={() => mudarAtacado(true)}>{t('vendas.atacadoOpc')}</button>
                </div>
              </div>
            )}

            <h3 style={{ marginBottom: 8 }}>{t('vendas.itensTitulo')}</h3>
            <div className="campo">
              <label>{t('vendas.leitorCodigoLabel')}</label>
              <input
                value={codigoLido}
                onChange={(e) => setCodigoLido(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void lerCodigo(codigoLido) } }}
                placeholder={t('vendas.leitorCodigoPlaceholder')}
                disabled={buscandoCodigo}
                autoFocus
              />
            </div>
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
                  {variacoesDe(l.produtoId).map((v) => {
                    const disp = disponivelPara(v, form.atacado)
                    return (
                      <option key={v.id} value={v.id}>
                        {v.cor}/{v.tamanho} {disp > 0 ? `(${disp})` : `— ${t('vendas.subEncomendaOpc')}`}
                      </option>
                    )
                  })}
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

            {!modoReserva && (
              <div className="linha-campos" style={{ marginTop: 16 }}>
                <div className="campo">
                  <label>{t('vendas.formaRecebimentoObrig')}</label>
                  <select value={form.formaRecebimento} onChange={(e) => setForm({ ...form, formaRecebimento: e.target.value as FormaRecebimento })}>
                    {FORMAS_RECEBIMENTO.map((f) => <option key={f} value={f}>{t(`forma.${f}`) || rotuloForma[f]}</option>)}
                  </select>
                </div>
                {!presencial && (
                  <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end' }}>
                    <input type="checkbox" style={{ width: 'auto' }} id="atacado" checked={form.atacado} onChange={(e) => mudarAtacado(e.target.checked)} />
                    <label htmlFor="atacado" style={{ margin: 0 }}>{t('vendas.precoAtacado')}</label>
                  </div>
                )}
              </div>
            )}

            {/* Régua + slider de desconto — não se aplica a pedido de reserva (preço travado) */}
            {!modoReserva && (
              <div className="desc-box">
                <div className="desc-cab">
                  <label style={{ margin: 0 }}>{t('vendas.desconto')}</label>
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
                      {t('vendas.usarSugerido')} ({sugeridoPct}%)
                    </button>
                  )}
                </div>
                <div className={`desc-aviso ${zonaDesconto}`}>
                  {zonaDesconto === 'ok' && `${t('vendas.liberadoAte')} ${config.autoMaxPct}%).`}
                  {zonaDesconto === 'senha' && `${t('vendas.acimaDe')} ${config.autoMaxPct}% ${t('vendas.acimaVaiPedirSenha')}`}
                  {zonaDesconto === 'gerente' && `${t('vendas.acimaDe')} ${config.senhaMaxPct}% ${t('vendas.acimaPrecisaGerente')}`}
                </div>
              </div>
            )}

            <div className="campo">
              <label>{t('vendas.observacao')}</label>
              <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>

            <div className="desc-totais">
              <div><span>{t('vendas.subtotal')}</span><span>{formataReal(bruto)}</span></div>
              {!modoReserva && pct > 0 && <div className="desc"><span>{t('vendas.desconto')} ({pct}%)</span><span>− {formataReal(descontoValor)}</span></div>}
              <div className="tot"><span>{t('vendas.total')}</span><span>{formataReal(modoReserva ? bruto : totalPrevisto)}</span></div>
            </div>

            <div className="acoes">
              <button type="button" className="btn secundario" onClick={fecharForm}>{t('comum.cancelar')}</button>
              <button className="btn">{modoReserva ? t('vendas.registrarPedidoReserva') : t('vendas.registrarVenda')}</button>
            </div>
          </form>
        </div>
        )
      })()}

      {/* Autorização do desconto */}
      {autoriz && (
        <div className="modal-fundo" onClick={() => setAutoriz(null)}>
          <form
            className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); void enviar({ senha: autoriz.senha, gerenteEmail: autoriz.gEmail, gerenteSenha: autoriz.gSenha }) }}
          >
            <h2>{autoriz.tipo === 'senha' ? t('vendas.confirmarDesconto') : t('vendas.autorizacaoGerente')}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: -4 }}>
              {autoriz.tipo === 'senha'
                ? `${t('vendas.descontoDe')} ${pct}% (${formataReal(descontoValor)}). ${t('vendas.confirmeSenhaParaAplicar')}`
                : `${t('vendas.descontoDe')} ${pct}% ${t('vendas.acimaLimiteGerentePrecisa')}`}
            </p>
            {autoriz.erro && <div className="alerta">{autoriz.erro}</div>}
            {autoriz.tipo === 'senha' ? (
              <div className="campo">
                <label>{t('vendas.suaSenha')}</label>
                <CampoSenha autoFocus value={autoriz.senha} onChange={(e) => setAutoriz({ ...autoriz, senha: e.target.value })} required />
              </div>
            ) : (
              <>
                <div className="campo">
                  <label>{t('vendas.emailGerente')}</label>
                  <input type="email" autoFocus value={autoriz.gEmail} onChange={(e) => setAutoriz({ ...autoriz, gEmail: e.target.value })} required />
                </div>
                <div className="campo">
                  <label>{t('vendas.senhaGerente')}</label>
                  <CampoSenha value={autoriz.gSenha} onChange={(e) => setAutoriz({ ...autoriz, gSenha: e.target.value })} required />
                </div>
              </>
            )}
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setAutoriz(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('vendas.autorizarERegistrar')}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

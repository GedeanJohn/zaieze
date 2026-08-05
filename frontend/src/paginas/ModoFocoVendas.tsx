import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Send, Sparkles, MapPin, Wallet, Calendar, StickyNote, Trophy, Target, Clock } from 'lucide-react'
import { api, formataReal, mensagemDeErro, usuarioLogado, rotuloPapel, type Papel } from '../api'
import { useLojaAtiva } from '../componentes/SeletorLoja'
import { useToast } from '../componentes/Toast'
import CarrinhoCliente from '../componentes/CarrinhoCliente'

// ─────────────────────────── Tipos ───────────────────────────

interface ConversaResumo {
  cliente: { id: string; nome: string; telefone: string | null; segmento: string; vendedoraId: string | null }
  vendedoraNome: string | null
  ultimaMensagem: string
  ultimaDirecao: 'ENVIADA' | 'RECEBIDA'
  ultimaEm: string
  mensagens: number
  naoLidas: number
}

interface Mensagem {
  id: string
  direcao: 'ENVIADA' | 'RECEBIDA'
  status: string
  texto: string
  tipoMidia?: string | null
  createdAt: string
}

interface ItemVendaResp { quantidade: number; precoUnitario: string; variacao: { produto: { nome: string } } }
interface VendaResp { id: string; createdAt: string; total: string; itens: ItemVendaResp[] }
interface OrcamentoResp { id: string; createdAt: string; status: string; itens: ItemVendaResp[] }
interface ClienteCompleto {
  id: string; nome: string; telefone: string | null; cidade: string | null; uf: string | null
  segmento: string; totalGasto: string; ultimaCompraEm: string | null; observacoes: string | null
  vendas: VendaResp[]; orcamentos: OrcamentoResp[]
}

interface ComissaoLinha { vendedoraId: string; nome: string; totalVendido: number; comissao: number; meta: number | null; pctMeta: number | null }
interface RankingLinha { posicao: number; id: string; nome: string; total: number; pctMeta: number | null }

const ROTULO_SEGMENTO: Record<string, string> = {
  NOVO: 'Novo', FREQUENTE: 'Frequente', VIP: 'VIP', INATIVO: 'Inativo', ATACADO: 'Atacado',
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

function horaCurta(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─────────────────────────── Página ───────────────────────────

export default function ModoFocoVendas() {
  const { clienteId } = useParams<{ clienteId?: string }>()
  const escopo = useLojaAtiva()
  if (!clienteId) return <SeletorConversa escopo={escopo} />
  return <FocoDeVendas clienteId={clienteId} escopo={escopo} />
}

/** Sem cliente escolhido ainda: lista de conversas recentes pra entrar direto numa. */
function SeletorConversa({ escopo }: { escopo: ReturnType<typeof useLojaAtiva> }) {
  const navigate = useNavigate()
  const [conversas, setConversas] = useState<ConversaResumo[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (!escopo.pronto) return
    api.get('/whatsapp/conversas', { params: escopo.params })
      .then(({ data }) => setConversas(data))
      .finally(() => setCarregando(false))
  }, [escopo.pronto, escopo.params])

  return (
    <div className="mf mf-pagina">
      <header className="mf-header">
        <button type="button" className="mf-voltar" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
        <div className="mf-header-titulo">
          <strong>Modo Foco de Vendas</strong>
          <span>Escolha uma conversa pra começar</span>
        </div>
      </header>
      <div className="mf-seletor-lista">
        {carregando && <div className="mf-vazio">Carregando conversas...</div>}
        {!carregando && conversas.length === 0 && <div className="mf-vazio">Nenhuma conversa ainda.</div>}
        {conversas.map((c) => (
          <button key={c.cliente.id} type="button" className="mf-seletor-item" onClick={() => navigate(`/foco/${c.cliente.id}`)}>
            <span className="mf-avatar">{iniciais(c.cliente.nome)}</span>
            <span className="mf-seletor-info">
              <strong>{c.cliente.nome}</strong>
              <span>{c.ultimaDirecao === 'RECEBIDA' ? 'Cliente: ' : 'Você: '}{c.ultimaMensagem}</span>
            </span>
            {c.naoLidas > 0 && <span className="mf-badge-nao-lidas">{c.naoLidas}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Workspace completo: cabeçalho com meta, KPIs do dia, chat + cartões inteligentes. */
function FocoDeVendas({ clienteId, escopo }: { clienteId: string; escopo: ReturnType<typeof useLojaAtiva> }) {
  const navigate = useNavigate()
  const avisar = useToast()
  const usuario = usuarioLogado()!

  const [cliente, setCliente] = useState<ClienteCompleto | null>(null)
  const [thread, setThread] = useState<Mensagem[]>([])
  const [vendasHoje, setVendasHoje] = useState<{ total: string }[]>([])
  const [comissao, setComissao] = useState<ComissaoLinha | null>(null)
  const [ranking, setRanking] = useState<RankingLinha | null>(null)
  const [carregando, setCarregando] = useState(true)

  function carregarTudo() {
    if (!escopo.pronto) return
    setCarregando(true)
    const hoje = hojeISO()
    Promise.all([
      api.get(`/clientes/${clienteId}`, { params: escopo.params }),
      api.get(`/whatsapp/conversas/${clienteId}`, { params: escopo.params }),
      api.get('/vendas', { params: { ...escopo.params, de: hoje, ate: hoje } }),
      api.get('/comissoes', { params: escopo.params }),
      api.get('/ranking', { params: escopo.params }),
    ])
      .then(([cli, msgs, vendas, com, rank]) => {
        setCliente(cli.data)
        setThread(msgs.data)
        setVendasHoje(vendas.data)
        setComissao((com.data as ComissaoLinha[]).find((l) => l.vendedoraId === usuario.id) ?? null)
        setRanking((rank.data as RankingLinha[]).find((l) => l.id === usuario.id) ?? null)
      })
      .catch((err) => avisar(mensagemDeErro(err), 'erro'))
      .finally(() => setCarregando(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(carregarTudo, [clienteId, escopo.pronto, escopo.params])

  const pedidosHoje = vendasHoje.length
  const ticketMedioHoje = pedidosHoje > 0 ? vendasHoje.reduce((s, v) => s + Number(v.total), 0) / pedidosHoje : 0

  const ticketMedioCliente = useMemo(() => {
    if (!cliente || cliente.vendas.length === 0) return 0
    return cliente.vendas.reduce((s, v) => s + Number(v.total), 0) / cliente.vendas.length
  }, [cliente])

  const timeline = useMemo(() => {
    if (!cliente) return []
    type Evento = { data: string; texto: string }
    const eventos: Evento[] = [
      ...cliente.vendas.map((v): Evento => ({
        data: v.createdAt,
        texto: `Compra fechada — ${formataReal(v.total)} (${v.itens.map((i) => i.variacao.produto.nome).join(', ')})`,
      })),
      ...cliente.orcamentos.map((o): Evento => ({
        data: o.createdAt,
        texto: `Orçamento ${o.status.toLowerCase().replace(/_/g, ' ')} — ${o.itens.length} item(ns)`,
      })),
      ...thread.slice(-30).map((m): Evento => ({
        data: m.createdAt,
        texto: `${m.direcao === 'RECEBIDA' ? 'Cliente' : 'Você'}: ${m.texto.slice(0, 80)}`,
      })),
    ]
    return eventos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()).slice(0, 15)
  }, [cliente, thread])

  if (carregando && !cliente) return <div className="mf mf-carregando">Carregando Modo Foco de Vendas...</div>
  if (!cliente) return <div className="mf mf-carregando">Cliente não encontrado.</div>

  const faltamParaMeta = comissao?.meta ? Math.max(0, comissao.meta - comissao.totalVendido) : null

  return (
    <div className="mf mf-pagina">
      <header className="mf-header">
        <button type="button" className="mf-voltar" onClick={() => navigate('/foco')}><ArrowLeft size={18} /></button>
        <span className="mf-avatar">{iniciais(cliente.nome)}</span>
        <div className="mf-header-titulo">
          <strong>{cliente.nome}</strong>
          <span className={`mf-chip-segmento seg-${cliente.segmento.toLowerCase()}`}>{ROTULO_SEGMENTO[cliente.segmento] ?? cliente.segmento}</span>
        </div>
        {comissao?.pctMeta != null && (
          <div className="mf-meta-anel" title={`${comissao.pctMeta}% da meta mensal`}>
            <svg viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="17" className="mf-anel-fundo" />
              <circle
                cx="20" cy="20" r="17" className="mf-anel-progresso"
                strokeDasharray={`${Math.min(100, comissao.pctMeta) * 1.068} 106.8`}
              />
            </svg>
            <span>{comissao.pctMeta}%</span>
          </div>
        )}
      </header>

      <div className="mf-kpis">
        <div className="mf-kpi">
          <span className="mf-kpi-rotulo">Pedidos hoje</span>
          <strong>{pedidosHoje}</strong>
        </div>
        <div className="mf-kpi">
          <span className="mf-kpi-rotulo">Ticket médio hoje</span>
          <strong>{pedidosHoje > 0 ? formataReal(ticketMedioHoje) : '—'}</strong>
        </div>
        <div className="mf-kpi">
          <span className="mf-kpi-rotulo"><Trophy size={12} /> Ranking</span>
          <strong>{ranking ? `${ranking.posicao}º lugar` : '—'}</strong>
        </div>
        <div className="mf-kpi mf-kpi-destaque">
          <span className="mf-kpi-rotulo"><Target size={12} /> Meta do mês</span>
          <strong>{faltamParaMeta != null ? (faltamParaMeta > 0 ? `Faltam ${formataReal(faltamParaMeta)}` : 'Meta batida! 🎉') : 'Sem meta definida'}</strong>
        </div>
      </div>

      <div className="mf-corpo">
        <div className="mf-coluna-chat">
          <PainelConversa clienteId={clienteId} thread={thread} setThread={setThread} escopo={escopo} cliente={cliente} usuario={usuario} avisar={avisar} />
        </div>
        <div className="mf-coluna-cards">
          <CartaoCliente cliente={cliente} ticketMedio={ticketMedioCliente} />
          <div className="mf-cartao mf-cartao-pedido">
            <div className="mf-cartao-titulo">Pedido</div>
            <CarrinhoCliente clienteId={clienteId} atacado={cliente.segmento === 'ATACADO'} onFechar={() => {}} />
          </div>
          <CartaoMetaComissao comissao={comissao} ranking={ranking} papel={usuario.role} />
          <CartaoTimeline eventos={timeline} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── Painel de conversa ───────────────────────────

function PainelConversa({ clienteId, thread, setThread, escopo, cliente, usuario, avisar }: {
  clienteId: string; thread: Mensagem[]; setThread: (fn: (t: Mensagem[]) => Mensagem[]) => void
  escopo: ReturnType<typeof useLojaAtiva>; cliente: ClienteCompleto; usuario: { nome: string }
  avisar: (texto: string, tipo?: 'sucesso' | 'erro') => void
}) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [sugerindo, setSugerindo] = useState(false)
  const [sugestaoAtiva, setSugestaoAtiva] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }) }, [thread.length])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    try {
      const { data } = await api.post(`/whatsapp/conversas/${clienteId}/responder`, { texto }, { params: escopo.params })
      setThread((t) => [...t, data])
      setTexto('')
      setSugestaoAtiva(false)
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    } finally {
      setEnviando(false)
    }
  }

  async function pedirSugestao() {
    setSugerindo(true)
    try {
      const { data } = await api.post(`/whatsapp/conversas/${clienteId}/sugestao`, {}, { params: escopo.params })
      setTexto(data.texto)
      setSugestaoAtiva(true)
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    } finally {
      setSugerindo(false)
    }
  }

  return (
    <div className="mf-conversa">
      <div className="mf-thread">
        {thread.map((m) => (
          <div key={m.id} className={`mf-bolha ${m.direcao === 'ENVIADA' ? 'mf-bolha-out' : 'mf-bolha-in'}`}>
            <p>{m.texto}</p>
            <span className="mf-bolha-hora">{horaCurta(m.createdAt)}</span>
          </div>
        ))}
        {thread.length === 0 && <div className="mf-vazio">Nenhuma mensagem ainda com {cliente.nome}.</div>}
        <div ref={fimRef} />
      </div>

      {sugestaoAtiva && (
        <div className="mf-sugestao-tag">
          <Sparkles size={13} /> Sugestão da IA — revise antes de enviar
        </div>
      )}

      <form className="mf-compor" onSubmit={enviar}>
        <button
          type="button" className="mf-btn-ia" title="Sugerir resposta com IA" disabled={sugerindo}
          onClick={pedirSugestao}
        >
          <Sparkles size={16} />
        </button>
        <input
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setSugestaoAtiva(false) }}
          placeholder={sugerindo ? 'Pensando numa sugestão...' : 'Digite sua mensagem...'}
          disabled={sugerindo}
        />
        <button type="submit" className="mf-btn-enviar" disabled={enviando || !texto.trim()}>
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}

// ─────────────────────────── Cartões ───────────────────────────

function CartaoCliente({ cliente, ticketMedio }: { cliente: ClienteCompleto; ticketMedio: number }) {
  return (
    <div className="mf-cartao">
      <div className="mf-cartao-titulo">Cliente</div>
      <div className="mf-cliente-grid">
        <div><MapPin size={13} /> {cliente.cidade ? `${cliente.cidade}${cliente.uf ? '/' + cliente.uf : ''}` : 'Cidade não informada'}</div>
        <div><Calendar size={13} /> Última compra: {cliente.ultimaCompraEm ? new Date(cliente.ultimaCompraEm).toLocaleDateString('pt-BR') : '—'}</div>
        <div><Wallet size={13} /> Ticket médio: {formataReal(ticketMedio)}</div>
        <div><Wallet size={13} /> Total gasto: {formataReal(cliente.totalGasto)}</div>
      </div>
      {cliente.observacoes && (
        <div className="mf-obs"><StickyNote size={13} /> {cliente.observacoes}</div>
      )}
    </div>
  )
}

function CartaoMetaComissao({ comissao, ranking, papel }: { comissao: ComissaoLinha | null; ranking: RankingLinha | null; papel: string }) {
  return (
    <div className="mf-cartao">
      <div className="mf-cartao-titulo">Meta &amp; Comissão ({rotuloPapel[papel as Papel] ?? papel})</div>
      {!comissao ? (
        <div className="mf-vazio">Sem dados de comissão pra este mês ainda.</div>
      ) : (
        <div className="mf-cliente-grid">
          <div>Vendido no mês: {formataReal(comissao.totalVendido)}</div>
          <div>Meta mensal: {comissao.meta ? formataReal(comissao.meta) : 'não definida'}</div>
          <div>Comissão prevista: {formataReal(comissao.comissao)}</div>
          <div><Trophy size={13} /> Ranking: {ranking ? `${ranking.posicao}º lugar` : '—'}</div>
        </div>
      )}
      <div className="mf-meta-nota">Meta é calculada por mês — diária/semanal ainda não existe no sistema.</div>
    </div>
  )
}

function CartaoTimeline({ eventos }: { eventos: { data: string; texto: string }[] }) {
  return (
    <div className="mf-cartao">
      <div className="mf-cartao-titulo"><Clock size={14} /> Timeline</div>
      {eventos.length === 0 && <div className="mf-vazio">Nenhum evento registrado ainda.</div>}
      <div className="mf-timeline">
        {eventos.map((e, i) => (
          <div key={i} className="mf-timeline-item">
            <span className="mf-timeline-data">{horaCurta(e.data)}</span>
            <span>{e.texto}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

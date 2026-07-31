import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, useDraggable, useDroppable,
  MeasuringStrategy, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'

// Remede a posição das colunas continuamente durante o arrastar (não só uma vez, no início) — o
// Kanban tem rolagem horizontal, e uma medição só-no-início pode ficar desatualizada, fazendo o
// dnd-kit não achar nenhuma coluna válida na hora de soltar (sintoma: onDragEnd com over: null).
const MEDICAO_CONTINUA = { droppable: { strategy: MeasuringStrategy.Always } }
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { urlCatalogo } from '../host'
import { useLojaAtiva, SeletorLoja } from '../componentes/SeletorLoja'
import { useIdioma } from '../lib/i18n'

type Etapa = 'ENTROU' | 'ATENDIDO' | 'NEGOCIANDO' | 'AGUARDANDO_PAGAMENTO' | 'CONVERTIDO' | 'PERDIDO'
type SituacaoChave =
  | 'ESPERA_NO_PRAZO' | 'ESPERA_APERTADO' | 'ESPERA_ATRASADO'
  | 'ATENDIMENTO_NO_PRAZO' | 'ATENDIMENTO_ATRASADO'
  | 'REDISTRIBUIDO' | 'CONVERTIDO' | 'PERDIDO'
interface Situacao { chave: SituacaoChave; label: string; cor: string }

// Item do carrinho enviado pelo cliente na vitrine — snapshot denormalizado (preço/foto do
// momento da compra), guardado em PedidoCatalogo pra vendedora ver o pedido formatado no card.
interface ItemPedido {
  produtoId: string; nome: string; fotoUrl?: string | null
  cor?: string; estampa?: string; tamanho?: string; modo: 'ATACADO' | 'VAREJO'; precoUnit: number; qtd: number
}
interface PedidoCatalogo { id: string; leadId: string; orcamentoId?: string | null; itens: ItemPedido[]; pecas: number; subtotal: string; createdAt: string }

interface Card {
  id: string; nome?: string | null; telefone?: string | null; status: Etapa; atrasado: boolean
  situacao: Situacao
  redistribuicoes: number; etapaDesde: string; createdAt: string
  vendedora: { id: string; nome: string }
  cliente?: {
    id: string; nome: string; telefone: string; cidade?: string | null; uf?: string | null
    avaliacoes?: { nota: number; comentario: string | null }[]
  } | null
  pedidosCatalogo?: PedidoCatalogo[]
}
interface Metricas { total: number; abertos: number; atrasados: number; convertidos: number; perdidos: number; taxaConversao: number; tempoMedioRespostaMin: number | null; porSituacao: Partial<Record<SituacaoChave, number>> }
interface Pipeline { colunas: Record<Etapa, Card[]>; metricas: Metricas }
interface LinkVend { id: string; nome: string; slug: string; redeSlug: string; path: string; temWhatsapp: boolean }

const ETAPAS: Etapa[] = ['ENTROU', 'ATENDIDO', 'NEGOCIANDO', 'AGUARDANDO_PAGAMENTO', 'CONVERTIDO', 'PERDIDO']
const CHAVE_ETAPA: Record<Etapa, string> = { ENTROU: 'entrou', ATENDIDO: 'atendido', NEGOCIANDO: 'negociando', AGUARDANDO_PAGAMENTO: 'aguardandoPagamento', CONVERTIDO: 'convertido', PERDIDO: 'perdido' }
const rotuloEtapa = (etapa: Etapa, t: (chave: string) => string): string => t(`pipe.etapa.${CHAVE_ETAPA[etapa]}`)
const corEtapa: Record<Etapa, string> = { ENTROU: '#e8a87c', ATENDIDO: '#7cc4e8', NEGOCIANDO: '#c9a0ff', AGUARDANDO_PAGAMENTO: '#f0c419', CONVERTIDO: '#7ce8a0', PERDIDO: '#888' }

// Escala de cores da SITUAÇÃO (cor + ícone vêm do back; ícone só no front p/ acessibilidade).
const ordemSituacao: SituacaoChave[] = [
  'ESPERA_NO_PRAZO', 'ESPERA_APERTADO', 'ESPERA_ATRASADO',
  'ATENDIMENTO_NO_PRAZO', 'ATENDIMENTO_ATRASADO', 'REDISTRIBUIDO', 'CONVERTIDO', 'PERDIDO',
]
const CHAVE_SITUACAO: Record<SituacaoChave, string> = {
  ESPERA_NO_PRAZO: 'esperaNoPrazo', ESPERA_APERTADO: 'esperaApertado', ESPERA_ATRASADO: 'esperaAtrasado',
  ATENDIMENTO_NO_PRAZO: 'atendimentoNoPrazo', ATENDIMENTO_ATRASADO: 'atendimentoAtrasado',
  REDISTRIBUIDO: 'redistribuido', CONVERTIDO: 'convertido', PERDIDO: 'perdido',
}
const labelSituacao = (chave: SituacaoChave, t: (chave: string) => string): string => t(`pipe.sit.${CHAVE_SITUACAO[chave]}`)
const corSituacao: Record<SituacaoChave, string> = {
  ESPERA_NO_PRAZO: '#38BDF8', ESPERA_APERTADO: '#F59E0B', ESPERA_ATRASADO: '#EF4444',
  ATENDIMENTO_NO_PRAZO: '#22C55E', ATENDIMENTO_ATRASADO: '#F97316',
  REDISTRIBUIDO: '#8B5CF6', CONVERTIDO: '#059669', PERDIDO: '#9CA3AF',
}
// Ícone por situação — nunca depender só da cor (acessibilidade / daltonismo).
const iconeSituacao: Record<SituacaoChave, string> = {
  ESPERA_NO_PRAZO: '⏳', ESPERA_APERTADO: '⚠️', ESPERA_ATRASADO: '⏰',
  ATENDIMENTO_NO_PRAZO: '💬', ATENDIMENTO_ATRASADO: '🔥',
  REDISTRIBUIDO: '↪', CONVERTIDO: '✅', PERDIDO: '✖️',
}

function BadgeSituacao({ s }: { s: Situacao }) {
  return (
    <span title={s.label} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 12, color: s.cor, lineHeight: 1.25,
      background: `${s.cor}22`, border: `1px solid ${s.cor}55`, maxWidth: '100%',
    }}>
      <span aria-hidden style={{ flex: '0 0 auto' }}>{iconeSituacao[s.chave]}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{s.label}</span>
    </span>
  )
}

function tempoNaEtapa(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.floor(ms / 60_000)}min`
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

// Cor do CARD conforme o tempo de espera vs. SLA: verde (no prazo) · laranja claro (apertado) · vermelho (atrasado).
// Cards finalizados (convertido/perdido/redistribuído) não recebem cor de tempo.
const VERDE = '#22C55E', LARANJA = '#F59E0B', VERMELHO = '#EF4444'
function corTempoEspera(c: Card): string | null {
  if (c.atrasado || c.situacao.chave === 'ESPERA_ATRASADO' || c.situacao.chave === 'ATENDIMENTO_ATRASADO') return VERMELHO
  if (c.situacao.chave === 'ESPERA_APERTADO') return LARANJA
  if (c.situacao.chave === 'ESPERA_NO_PRAZO' || c.situacao.chave === 'ATENDIMENTO_NO_PRAZO') return VERDE
  return null
}

// Coluna do funil = área onde se SOLTA o card (droppable).
function ColunaDrop({ etapa, children }: { etapa: Etapa; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa })
  return (
    <div ref={setNodeRef} style={{
      background: isOver ? '#c2552b22' : '#ffffff08', borderRadius: 10, padding: 8, minWidth: 180,
      outline: isOver ? '2px dashed var(--accent)' : 'none', transition: 'background .12s',
    }}>{children}</div>
  )
}

// Card do cliente. No desktop é ARRASTÁVEL (alça ⠿) E também tem o botão "Mover etapa" (menu) como
// caminho garantido — o arrastar depende de o navegador/coluna cooperar (relatado quebrando em
// alguns casos só pra soltar fora da coluna de origem), então o menu fica sempre disponível como
// alternativa que não depende de drag-and-drop. No celular a alça some (não cabe/não funciona bem
// numa tela estreita) e só o botão "Mover etapa" aparece. Clicar no nome/telefone abre a conversa
// do cliente no Chat Zaieze.
function CardLead({ c, redistribuir, podeRedistribuir, abrirChat, verPedido, aoMover, arrastavel, t }: {
  c: Card; redistribuir: (c: Card) => void; podeRedistribuir: boolean; abrirChat: (clienteId: string) => void
  verPedido: (pedido: PedidoCatalogo, etapa: Etapa) => void
  aoMover?: (c: Card) => void
  arrastavel?: boolean
  t: (chave: string, vars?: Record<string, string | number>) => string
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, data: { card: c } })
  const ct = corTempoEspera(c)
  const clienteId = c.cliente?.id ?? null
  const nome = c.cliente?.nome ?? c.nome ?? '—'
  const telefone = c.cliente?.telefone ?? c.telefone ?? ''
  const pedido = c.pedidosCatalogo?.[0]
  const avaliacao = c.cliente?.avaliacoes?.[0]
  return (
    <div ref={arrastavel ? setNodeRef : undefined} className="cartao" style={{ padding: 10, marginBottom: 8, borderLeft: `4px solid ${ct ?? c.situacao.cor}`, background: ct ? `${ct}22` : undefined, opacity: isDragging ? 0.4 : 1, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {arrastavel && (
          <button type="button" {...attributes} {...listeners} title={t('pipe.arrastarParaMudar')} aria-label={t('pipe.arrastarCard')}
            style={{ cursor: 'grab', touchAction: 'none', border: 'none', background: 'none', color: 'var(--ink-soft)', fontSize: 24, padding: '2px 4px', lineHeight: 1, alignSelf: 'stretch' }}>⠿</button>
        )}
        <button type="button" onClick={() => clienteId && abrirChat(clienteId)} disabled={!clienteId}
          title={clienteId ? t('pipe.abrirConversa') : undefined}
          style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', padding: 0, cursor: clienteId ? 'pointer' : 'default', color: 'inherit', display: 'block' }}>
          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25, color: clienteId ? 'var(--accent)' : undefined, overflowWrap: 'anywhere' }}>{nome}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{telefone}</div>
        </button>
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <BadgeSituacao s={c.situacao} />
        {avaliacao && (
          <span title={avaliacao.comentario ?? undefined} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
            padding: '2px 8px', borderRadius: 12, color: '#c9a25f', lineHeight: 1.25,
            background: '#c9a25f22', border: '1px solid #c9a25f55', maxWidth: '100%',
          }}>
            {'★'.repeat(avaliacao.nota)}{'☆'.repeat(5 - avaliacao.nota)}
          </span>
        )}
      </div>
      {pedido && (
        <button type="button" onClick={() => verPedido(pedido, c.status)} title={t('pipe.verPedidoTitle')}
          style={{
            marginTop: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, fontSize: 11,
            padding: '4px 9px', borderRadius: 10, border: '1px solid var(--accent-soft)', background: 'var(--accent-soft)',
            color: 'var(--accent)', cursor: 'pointer', textAlign: 'left',
          }}>
          <strong style={{ fontWeight: 700 }}>🛒 {pedido.orcamentoId ? t('pipe.orcamentoEmAndamento') : t('pipe.pedidoEmAndamento')}</strong>
          <span>{t('pipe.pedidoResumo', { n: pedido.pecas, valor: Number(pedido.subtotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) })}</span>
        </button>
      )}
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
        👤 {c.vendedora.nome}{c.redistribuicoes > 0 && ` · ${t('pipe.redistribuicoesSufixo', { n: c.redistribuicoes })}`}
      </div>
      <div style={{ fontSize: 11, marginTop: 2, color: c.atrasado ? '#ff6b6b' : 'var(--ink-soft)' }}>
        ⏱ {tempoNaEtapa(c.etapaDesde)} {t('pipe.nestaEtapa')}{c.atrasado && ` · ${t('pipe.atrasadoSufixo')}`}
      </div>
      {(aoMover || (podeRedistribuir && ['ENTROU', 'ATENDIDO', 'NEGOCIANDO', 'AGUARDANDO_PAGAMENTO'].includes(c.status))) && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {aoMover && (
            <button className="btn secundario" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => aoMover(c)}>↕ {t('pipe.moverEtapaBtn')}</button>
          )}
          {podeRedistribuir && ['ENTROU', 'ATENDIDO', 'NEGOCIANDO', 'AGUARDANDO_PAGAMENTO'].includes(c.status) && (
            <button className="btn secundario" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => redistribuir(c)} title={t('pipe.redistribuirTitle')}>↪ {t('pipe.redistribuirBtn')}</button>
          )}
        </div>
      )}
    </div>
  )
}

// Menu (bottom sheet) pra mudar de etapa no celular — no lugar de arrastar entre colunas fora da
// tela. Reaproveita a mesma `mover()` do Kanban (mesmo prompt de motivo ao escolher "Perdido").
function SheetMoverEtapa({ card, onFechar, onEscolher, t }: {
  card: Card; onFechar: () => void; onEscolher: (etapa: Etapa) => void
  t: (chave: string, vars?: Record<string, string | number>) => string
}) {
  const nome = card.cliente?.nome ?? card.nome ?? '—'
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 92vw)' }}>
        <h2 style={{ marginBottom: 2 }}>{t('pipe.moverEtapaTitulo')}</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>{nome}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {ETAPAS.map((etapa) => (
            <button key={etapa} type="button" disabled={etapa === card.status} onClick={() => onEscolher(etapa)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '11px 8px', borderRadius: 10,
                border: 'none', background: 'none', textAlign: 'left', width: '100%',
                cursor: etapa === card.status ? 'default' : 'pointer', fontSize: 14, fontWeight: 600,
                color: etapa === card.status ? 'var(--ink-soft)' : 'var(--ink)',
              }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: corEtapa[etapa], flexShrink: 0 }} />
              {rotuloEtapa(etapa, t)}
              {etapa === card.status && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-soft)' }}>{t('pipe.etapaAtualTag')}</span>}
            </button>
          ))}
        </div>
        <div className="acoes">
          <button type="button" className="btn secundario" onClick={onFechar}>{t('comum.cancelar')}</button>
        </div>
      </div>
    </div>
  )
}

export default function Pipeline() {
  const usuario = usuarioLogado()!
  const ehVendedora = usuario.role === 'VENDEDORA'
  const podeRedistribuir = usuario.role === 'GESTOR' || usuario.role === 'GERENTE' || usuario.role === 'SUPER_ADMIN'
  const escopo = useLojaAtiva()
  const navigate = useNavigate()
  const abrirChat = useCallback((clienteId: string) => navigate(`/caixa?cliente=${clienteId}`), [navigate])
  const { t } = useIdioma()

  const [pipe, setPipe] = useState<Pipeline | null>(null)
  const [meuLink, setMeuLink] = useState<LinkVend | null>(null)
  const [links, setLinks] = useState<LinkVend[]>([])
  const [vendFiltro, setVendFiltro] = useState('')
  const [nomeFiltro, setNomeFiltro] = useState('')
  const [telefoneFiltro, setTelefoneFiltro] = useState('')
  const [cidadeFiltro, setCidadeFiltro] = useState('')
  const [ufFiltro, setUfFiltro] = useState('')
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState('')
  const [pedidoAberto, setPedidoAberto] = useState<PedidoCatalogo | null>(null)
  const [pedidoAbertoEtapa, setPedidoAbertoEtapa] = useState<Etapa | null>(null)
  const [editandoPedido, setEditandoPedido] = useState(false)
  const [abaMobile, setAbaMobile] = useState<Etapa>('ENTROU')
  const [cardMoverMobile, setCardMoverMobile] = useState<Card | null>(null)

  const filtroAtivo = !!(nomeFiltro || telefoneFiltro || cidadeFiltro || ufFiltro)
  function normalizar(v: string): string { return v.trim().toLowerCase() }
  function cardBate(c: Card): boolean {
    if (nomeFiltro && !normalizar(c.cliente?.nome ?? c.nome ?? '').includes(normalizar(nomeFiltro))) return false
    if (telefoneFiltro && !(c.cliente?.telefone ?? c.telefone ?? '').replace(/\D/g, '').includes(telefoneFiltro.replace(/\D/g, ''))) return false
    if (cidadeFiltro && !normalizar(c.cliente?.cidade ?? '').includes(normalizar(cidadeFiltro))) return false
    if (ufFiltro && normalizar(c.cliente?.uf ?? '') !== normalizar(ufFiltro)) return false
    return true
  }
  const pipeFiltrado: Pipeline | null = pipe && filtroAtivo
    ? { ...pipe, colunas: Object.fromEntries(ETAPAS.map((etapa) => [etapa, pipe.colunas[etapa].filter(cardBate)])) as Record<Etapa, Card[]> }
    : pipe

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    setErro('')
    try {
      const params = vendFiltro ? { ...escopo.params, vendedoraId: vendFiltro } : escopo.params
      setPipe((await api.get('/leads/pipeline', { params })).data)
      if (ehVendedora) setMeuLink((await api.get('/catalogo/meu-link')).data)
      else setLinks((await api.get('/catalogo/links', { params: escopo.params })).data)
    } catch (err) { setErro(mensagemDeErro(err)) }
  }, [escopo.pronto, escopo.params, ehVendedora, vendFiltro])

  useEffect(() => { carregar() }, [carregar])
  // Ao trocar de loja, zera o filtro de vendedora (ela pode não existir na outra loja) e os filtros de texto.
  useEffect(() => {
    setVendFiltro(''); setNomeFiltro(''); setTelefoneFiltro(''); setCidadeFiltro(''); setUfFiltro('')
  }, [escopo.lojaId])

  async function copiar(redeSlug: string, path: string, chave: string) {
    try { await navigator.clipboard.writeText(urlCatalogo(redeSlug, path)) } catch { /* ignore */ }
    setCopiado(chave); setTimeout(() => setCopiado(''), 1800)
  }
  async function mover(card: Card, etapa: Etapa) {
    if (etapa === card.status) return
    const motivoPerda = etapa === 'PERDIDO' ? (prompt(t('pipe.motivoPerda')) ?? undefined) : undefined
    try { await api.patch(`/leads/${card.id}/etapa`, { etapa, motivoPerda }, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }
  async function redistribuir(card: Card) {
    try { await api.post(`/leads/${card.id}/redistribuir`, {}, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }
  // Converte o pedido montado na vitrine num Orçamento de verdade (ou reabre o já convertido) e
  // navega pra Orçamentos já com a janela de edição aberta (ver useEffect de `abrir` lá).
  async function editarPedido(pedido: PedidoCatalogo) {
    setEditandoPedido(true)
    try {
      const { data } = await api.post(`/orcamentos/da-vitrine/${pedido.leadId}`, {}, { params: escopo.params })
      navigate(`/orcamentos?abrir=${data.id}`)
    } catch (err) { alert(mensagemDeErro(err)) } finally { setEditandoPedido(false) }
  }

  async function redistribuirAtrasados() {
    try {
      const { data } = await api.post('/leads/redistribuir-atrasados', {}, { params: escopo.params })
      alert(t('pipe.cicloRedistribuido', { n: data.redistribuidos })); carregar()
    } catch (err) { alert(mensagemDeErro(err)) }
  }

  // Drag-and-drop (desktop = mouse; mobile = pressionar e segurar p/ não brigar com o scroll).
  // MouseSensor (não PointerSensor) — eventos de mouse "clássicos" (mousedown/mousemove/mouseup),
  // sem passar pela API de Pointer Events; e closestCenter (não o rectIntersection padrão) — decide
  // a coluna de destino pelo CENTRO mais próximo do ponto onde soltou, mais tolerante que exigir
  // intersecção exata de retângulos, principalmente perto da borda de colunas adjacentes.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
  const [arrastando, setArrastando] = useState<Card | null>(null)
  function aoIniciarArrasto(e: DragStartEvent) { setArrastando((e.active.data.current?.card as Card) ?? null) }
  function aoSoltar(e: DragEndEvent) {
    setArrastando(null)
    const card = e.active.data.current?.card as Card | undefined
    const destino = e.over?.id as Etapa | undefined
    if (!card) { console.warn('[funil] soltou sem um card de origem identificado', e); return }
    if (!destino) {
      console.warn('[funil] soltou fora de qualquer coluna', {
        origem: card.status, delta: e.delta, activeRect: e.active.rect.current, collisions: e.collisions,
      })
      return
    }
    if (!ETAPAS.includes(destino)) { console.warn('[funil] destino não é uma etapa válida', destino); return }
    if (destino !== card.status) mover(card, destino)
  }

  const m = pipe?.metricas
  return (
    <>
      <header>
        <h1>{t('pipe.titulo')}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <SeletorLoja escopo={escopo} />
          {!ehVendedora && links.length > 0 && (
            <div className="campo" style={{ minWidth: 200, marginBottom: 0 }}>
              <label>{t('pipe.vendedora')}</label>
              <select value={vendFiltro} onChange={(e) => setVendFiltro(e.target.value)}>
                <option value="">{t('pipe.todasVendedoras')}</option>
                {links.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
          )}
          {podeRedistribuir && <button className="btn secundario" onClick={redistribuirAtrasados}>{t('pipe.redistribuirAtrasados')}</button>}
        </div>
      </header>

      {erro && <div className="alerta">{erro}</div>}

      {/* Links do catálogo */}
      {ehVendedora && meuLink && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>{t('pipe.meuLinkTitulo')}</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
            {t('pipe.meuLinkTexto')} <strong>{t('pipe.seuWhatsapp')}</strong> {t('pipe.eEntraCarteira')}
            {!meuLink.temWhatsapp && <strong style={{ color: '#e8a87c' }}> {t('pipe.avisoSemWhatsapp')}</strong>}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ background: '#0003', padding: '8px 12px', borderRadius: 8 }}>{urlCatalogo(meuLink.redeSlug, meuLink.path)}</code>
            <button className="btn" onClick={() => copiar(meuLink.redeSlug, meuLink.path, 'meu')}>{copiado === 'meu' ? t('pipe.copiado') : t('pipe.copiar')}</button>
          </div>
        </div>
      )}
      {!ehVendedora && links.length > 0 && (
        <details className="cartao">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('pipe.linksVendedorasN', { n: links.length })}</summary>
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>{t('pipe.vendedora')}</th><th>Link</th><th>WhatsApp</th><th></th></tr></thead>
            <tbody>
              {links.map((v) => (
                <tr key={v.id}>
                  <td>{v.nome}</td>
                  <td><code style={{ fontSize: 12 }}>{urlCatalogo(v.redeSlug, v.path)}</code></td>
                  <td>{v.temWhatsapp ? <span className="selo ok">{t('pipe.conectado')}</span> : <span className="selo baixo">{t('pipe.semWhatsapp')}</span>}</td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); copiar(v.redeSlug, v.path, v.id) }}>{copiado === v.id ? t('pipe.copiado') : t('pipe.copiarLink')}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* Métricas do funil */}
      {m && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '4px 0 12px' }}>
          <Metr titulo={t('pipe.metr.abertos')} valor={m.abertos} />
          <Metr titulo={t('pipe.metr.atrasados')} valor={m.atrasados} alerta={m.atrasados > 0} />
          <Metr titulo={t('pipe.metr.convertidos')} valor={m.convertidos} />
          <Metr titulo={t('pipe.metr.taxaConversao')} valor={`${m.taxaConversao}%`} />
          <Metr titulo={t('pipe.metr.tempoMedio')} valor={m.tempoMedioRespostaMin != null ? `${m.tempoMedioRespostaMin}min` : '—'} />
        </div>
      )}

      {/* Filtros de busca do funil */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', margin: '0 0 12px' }}>
        <div className="campo" style={{ minWidth: 140, marginBottom: 0 }}>
          <label>{t('pipe.filtroNome')}</label>
          <input value={nomeFiltro} onChange={(e) => setNomeFiltro(e.target.value)} />
        </div>
        <div className="campo" style={{ minWidth: 140, marginBottom: 0 }}>
          <label>{t('pipe.filtroTelefone')}</label>
          <input value={telefoneFiltro} onChange={(e) => setTelefoneFiltro(e.target.value)} />
        </div>
        <div className="campo" style={{ minWidth: 140, marginBottom: 0 }}>
          <label>{t('pipe.filtroCidade')}</label>
          <input value={cidadeFiltro} onChange={(e) => setCidadeFiltro(e.target.value)} />
        </div>
        <div className="campo" style={{ minWidth: 90, marginBottom: 0 }}>
          <label>{t('pipe.filtroEstado')}</label>
          <input value={ufFiltro} maxLength={2} onChange={(e) => setUfFiltro(e.target.value.toUpperCase())} />
        </div>
        {filtroAtivo && (
          <button className="btn secundario" onClick={() => { setNomeFiltro(''); setTelefoneFiltro(''); setCidadeFiltro(''); setUfFiltro('') }}>
            {t('pipe.limparFiltros')}
          </button>
        )}
      </div>

      {/* Legenda + contadores por situação (mapa de gargalos — vendedora e gestor) */}
      {m && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 12px' }}>
          {ordemSituacao.filter((ch) => (m.porSituacao[ch] ?? 0) > 0).map((ch) => (
            <span key={ch} title={labelSituacao(ch, t)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
              padding: '3px 9px', borderRadius: 999, color: corSituacao[ch],
              background: `${corSituacao[ch]}22`, border: `1px solid ${corSituacao[ch]}55`,
            }}>
              <span aria-hidden>{iconeSituacao[ch]}</span>{labelSituacao(ch, t)}
              <strong style={{ marginLeft: 2 }}>{m.porSituacao[ch]}</strong>
            </span>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} measuring={MEDICAO_CONTINUA} onDragStart={aoIniciarArrasto} onDragEnd={aoSoltar}>
        {/* Kanban com arrastar-e-soltar (alça ⠿) — só desktop (≥861px). No celular, uma tela com 6
            colunas de 180px não cabe — vira abas de etapa + lista vertical (funil-mobile abaixo). */}
        <div className="funil-desktop-only">
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 6px' }}>
            {t('pipe.dicaParte1')} <strong>⠿</strong> {t('pipe.dicaParte2')}
          </div>
          <div className="funil-kanban" style={{ display: 'grid', gridTemplateColumns: `repeat(${ETAPAS.length}, minmax(180px, 1fr))`, gap: 10, overflowX: 'auto' }}>
            {ETAPAS.map((etapa) => {
              const cards = pipeFiltrado?.colunas[etapa] ?? []
              return (
                <ColunaDrop key={etapa} etapa={etapa}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 8px', borderBottom: `2px solid ${corEtapa[etapa]}`, marginBottom: 8 }}>
                    <strong style={{ color: corEtapa[etapa] }}>{rotuloEtapa(etapa, t)}</strong>
                    <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{cards.length}</span>
                  </div>
                  {cards.map((c) => (
                    <CardLead key={c.id} c={c} redistribuir={redistribuir} podeRedistribuir={podeRedistribuir} abrirChat={abrirChat}
                      verPedido={(pedido, etapa) => { setPedidoAberto(pedido); setPedidoAbertoEtapa(etapa) }}
                      aoMover={(card) => setCardMoverMobile(card)} arrastavel t={t} />
                  ))}
                  {cards.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 12, padding: 6 }}>—</div>}
                </ColunaDrop>
              )
            })}
          </div>
          <DragOverlay>
            {arrastando ? (
              <div className="cartao" style={{ padding: 10, borderLeft: `4px solid ${corTempoEspera(arrastando) ?? arrastando.situacao.cor}`, boxShadow: '0 8px 24px #0005' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{arrastando.cliente?.nome ?? arrastando.nome ?? '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{t('pipe.solteNumaEtapa')}</div>
              </div>
            ) : null}
          </DragOverlay>
        </div>

        {/* Celular: abas de etapa + lista vertical. Mudar de etapa é por "Mover etapa" (menu), não arrastar. */}
        <div className="funil-mobile">
          <div className="funil-abas">
            {ETAPAS.map((etapa) => {
              const cards = pipeFiltrado?.colunas[etapa] ?? []
              const temAtraso = cards.some((c) => c.atrasado)
              return (
                <button key={etapa} type="button" className={`funil-aba ${etapa === abaMobile ? 'ativa' : ''}`} onClick={() => setAbaMobile(etapa)}>
                  <span className="ponto" style={{ background: corEtapa[etapa] }} />
                  {rotuloEtapa(etapa, t)}
                  <span className={`contagem ${temAtraso ? 'atraso' : ''}`}>{cards.length}</span>
                </button>
              )
            })}
          </div>
          <div className="funil-lista-mobile">
            {(pipeFiltrado?.colunas[abaMobile] ?? []).map((c) => (
              <CardLead key={c.id} c={c} redistribuir={redistribuir} podeRedistribuir={podeRedistribuir} abrirChat={abrirChat}
                verPedido={(pedido, etapa) => { setPedidoAberto(pedido); setPedidoAbertoEtapa(etapa) }}
                aoMover={(card) => setCardMoverMobile(card)} t={t} />
            ))}
            {(pipeFiltrado?.colunas[abaMobile] ?? []).length === 0 && (
              <div style={{ color: 'var(--ink-soft)', fontSize: 13, padding: '20px 6px', textAlign: 'center' }}>—</div>
            )}
          </div>
        </div>
      </DndContext>

      {pedidoAberto && (
        <ModalPedido pedido={pedidoAberto} etapa={pedidoAbertoEtapa} onFechar={() => { setPedidoAberto(null); setPedidoAbertoEtapa(null) }} onEditar={editarPedido} editando={editandoPedido} t={t} />
      )}
      {cardMoverMobile && (
        <SheetMoverEtapa card={cardMoverMobile} onFechar={() => setCardMoverMobile(null)}
          onEscolher={async (etapa) => { await mover(cardMoverMobile, etapa); setCardMoverMobile(null) }} t={t} />
      )}
    </>
  )
}

const real = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

// Pré-visualização do pedido que o cliente montou na vitrine — itens com foto/variação/qtd/preço,
// pra vendedora conferir sem precisar reconstruir a partir do texto corrido do WhatsApp.
function ModalPedido({ pedido, etapa, onFechar, onEditar, editando, t }: {
  pedido: PedidoCatalogo; etapa: Etapa | null; onFechar: () => void; onEditar: (pedido: PedidoCatalogo) => void; editando: boolean
  t: (chave: string, vars?: Record<string, string | number>) => string
}) {
  // A conversão em Orçamento só libera a partir de "Em Atendimento" — enquanto o ciclo ainda está
  // "Entrou", a vendedora precisa atender antes de editar/fechar. Reabrir um orçamento JÁ criado
  // continua liberado (não é mais "editar o pedido", é só ver o que já existe) — exceto depois de
  // "Venda Realizada", que trava o pedido de novo mesmo com orçamento já aberto.
  const bloqueadoAindaNaoAtendido = etapa === 'ENTROU' && !pedido.orcamentoId
  const bloqueadoVendaConcluida = etapa === 'CONVERTIDO'
  const bloqueado = bloqueadoAindaNaoAtendido || bloqueadoVendaConcluida
  const mensagemBloqueio = bloqueadoVendaConcluida ? t('pipe.bloqueadoVendaConcluida') : t('pipe.bloqueadoAteAtendido')
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 92vw)' }}>
        <h2>{t('pipe.pedidoModalTitulo')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '55vh', overflowY: 'auto' }}>
          {pedido.itens.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              {it.fotoUrl
                ? <img src={it.fotoUrl} alt="" style={{ width: 52, height: 68, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                : <div style={{ width: 52, height: 68, borderRadius: 6, background: 'var(--accent-soft)', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{it.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                  {[it.cor, it.estampa, it.tamanho].filter(Boolean).join(' / ')} · {it.modo === 'ATACADO' ? t('pipe.modoAtacado') : t('pipe.modoVarejo')}
                </div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{real(it.precoUnit)} × {it.qtd} = <strong>{real(it.precoUnit * it.qtd)}</strong></div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 12 }}>
          <span>{t('pipe.pedidoPecas')}</span><strong>{pedido.pecas}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, marginTop: 4 }}>
          <span>{t('pipe.pedidoTotal')}</span><strong>{real(Number(pedido.subtotal))}</strong>
        </div>
        {bloqueado && <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 10 }}>{mensagemBloqueio}</p>}
        <div className="acoes">
          <button type="button" className="btn secundario" onClick={onFechar}>{t('comum.fechar')}</button>
          <button type="button" className="btn" disabled={editando || bloqueado} title={bloqueado ? mensagemBloqueio : undefined} onClick={() => onEditar(pedido)}>
            {editando ? t('pipe.abrindoOrcamento') : pedido.orcamentoId ? t('pipe.abrirOrcamento') : t('pipe.editarFecharPedido')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Metr({ titulo, valor, alerta }: { titulo: string; valor: string | number; alerta?: boolean }) {
  return (
    <div className="cartao" style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{titulo}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: alerta ? '#ff6b6b' : undefined }}>{valor}</div>
    </div>
  )
}

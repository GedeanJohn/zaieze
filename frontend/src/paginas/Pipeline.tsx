import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { urlCatalogo } from '../host'
import { useLojaAtiva, SeletorLoja } from '../componentes/SeletorLoja'

type Etapa = 'ENTROU' | 'ATENDIDO' | 'NEGOCIANDO' | 'CONVERTIDO' | 'PERDIDO'
type SituacaoChave =
  | 'ESPERA_NO_PRAZO' | 'ESPERA_APERTADO' | 'ESPERA_ATRASADO'
  | 'ATENDIMENTO_NO_PRAZO' | 'ATENDIMENTO_ATRASADO'
  | 'REDISTRIBUIDO' | 'CONVERTIDO' | 'PERDIDO'
interface Situacao { chave: SituacaoChave; label: string; cor: string }

interface Card {
  id: string; nome?: string | null; telefone?: string | null; status: Etapa; atrasado: boolean
  situacao: Situacao
  redistribuicoes: number; etapaDesde: string; createdAt: string
  vendedora: { id: string; nome: string }
  cliente?: { id: string; nome: string; telefone: string } | null
}
interface Metricas { total: number; abertos: number; atrasados: number; convertidos: number; perdidos: number; taxaConversao: number; tempoMedioRespostaMin: number | null; porSituacao: Partial<Record<SituacaoChave, number>> }
interface Pipeline { colunas: Record<Etapa, Card[]>; metricas: Metricas }
interface LinkVend { id: string; nome: string; slug: string; redeSlug: string; path: string; temWhatsapp: boolean }

const ETAPAS: Etapa[] = ['ENTROU', 'ATENDIDO', 'NEGOCIANDO', 'CONVERTIDO', 'PERDIDO']
const rotuloEtapa: Record<Etapa, string> = { ENTROU: 'Entrou', ATENDIDO: 'Atendido', NEGOCIANDO: 'Negociando', CONVERTIDO: 'Convertido', PERDIDO: 'Perdido' }
const corEtapa: Record<Etapa, string> = { ENTROU: '#e8a87c', ATENDIDO: '#7cc4e8', NEGOCIANDO: '#c9a0ff', CONVERTIDO: '#7ce8a0', PERDIDO: '#888' }

// Escala de cores da SITUAÇÃO (cor + ícone vêm do back; ícone só no front p/ acessibilidade).
const ordemSituacao: SituacaoChave[] = [
  'ESPERA_NO_PRAZO', 'ESPERA_APERTADO', 'ESPERA_ATRASADO',
  'ATENDIMENTO_NO_PRAZO', 'ATENDIMENTO_ATRASADO', 'REDISTRIBUIDO', 'CONVERTIDO', 'PERDIDO',
]
const labelSituacao: Record<SituacaoChave, string> = {
  ESPERA_NO_PRAZO: 'Em espera — no prazo', ESPERA_APERTADO: 'Em espera — apertado', ESPERA_ATRASADO: 'Em espera — atrasado',
  ATENDIMENTO_NO_PRAZO: 'Em atendimento', ATENDIMENTO_ATRASADO: 'Em atendimento — atrasado',
  REDISTRIBUIDO: 'Redistribuído', CONVERTIDO: 'Convertido', PERDIDO: 'Perdido',
}
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
      padding: '1px 7px', borderRadius: 999, color: s.cor,
      background: `${s.cor}22`, border: `1px solid ${s.cor}55`, whiteSpace: 'nowrap',
    }}>
      <span aria-hidden>{iconeSituacao[s.chave]}</span>{s.label}
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

// Card do cliente = item ARRASTÁVEL (alça ⠿). O select continua como alternativa.
function CardLead({ c, mover, redistribuir, podeRedistribuir }: {
  c: Card; mover: (c: Card, etapa: Etapa) => void; redistribuir: (c: Card) => void; podeRedistribuir: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, data: { card: c } })
  const ct = corTempoEspera(c)
  return (
    <div ref={setNodeRef} className="cartao" style={{ padding: 10, marginBottom: 8, borderLeft: `4px solid ${ct ?? c.situacao.cor}`, background: ct ? `${ct}22` : undefined, opacity: isDragging ? 0.4 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <button type="button" {...attributes} {...listeners} title="Arraste para mudar de etapa" aria-label="Arrastar card"
          style={{ cursor: 'grab', touchAction: 'none', border: 'none', background: 'none', color: 'var(--ink-soft)', fontSize: 16, padding: '0 2px', lineHeight: 1.1 }}>⠿</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{c.cliente?.nome ?? c.nome ?? '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{c.cliente?.telefone ?? c.telefone ?? ''}</div>
        </div>
      </div>
      <div style={{ marginTop: 6 }}><BadgeSituacao s={c.situacao} /></div>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
        👤 {c.vendedora.nome}{c.redistribuicoes > 0 && ` · ${c.redistribuicoes}× redistr.`}
      </div>
      <div style={{ fontSize: 11, marginTop: 2, color: c.atrasado ? '#ff6b6b' : 'var(--ink-soft)' }}>
        ⏱ {tempoNaEtapa(c.etapaDesde)} nesta etapa{c.atrasado && ' · atrasado'}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
        <select value={c.status} onChange={(e) => mover(c, e.target.value as Etapa)} style={{ flex: 1, fontSize: 12, padding: 4 }}>
          {ETAPAS.map((et) => <option key={et} value={et}>{rotuloEtapa[et]}</option>)}
        </select>
        {podeRedistribuir && ['ENTROU', 'ATENDIDO', 'NEGOCIANDO'].includes(c.status) && (
          <button className="btn secundario" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => redistribuir(c)}>↪</button>
        )}
      </div>
    </div>
  )
}

export default function Pipeline() {
  const usuario = usuarioLogado()!
  const ehVendedora = usuario.role === 'VENDEDORA'
  const podeRedistribuir = usuario.role === 'GESTOR' || usuario.role === 'GERENTE' || usuario.role === 'SUPER_ADMIN'
  const escopo = useLojaAtiva()

  const [pipe, setPipe] = useState<Pipeline | null>(null)
  const [meuLink, setMeuLink] = useState<LinkVend | null>(null)
  const [links, setLinks] = useState<LinkVend[]>([])
  const [erro, setErro] = useState('')
  const [copiado, setCopiado] = useState('')

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    setErro('')
    try {
      setPipe((await api.get('/leads/pipeline', { params: escopo.params })).data)
      if (ehVendedora) setMeuLink((await api.get('/catalogo/meu-link')).data)
      else setLinks((await api.get('/catalogo/links', { params: escopo.params })).data)
    } catch (err) { setErro(mensagemDeErro(err)) }
  }, [escopo.pronto, escopo.params, ehVendedora])

  useEffect(() => { carregar() }, [carregar])

  async function copiar(redeSlug: string, path: string, chave: string) {
    try { await navigator.clipboard.writeText(urlCatalogo(redeSlug, path)) } catch { /* ignore */ }
    setCopiado(chave); setTimeout(() => setCopiado(''), 1800)
  }
  async function mover(card: Card, etapa: Etapa) {
    if (etapa === card.status) return
    const motivoPerda = etapa === 'PERDIDO' ? (prompt('Motivo da perda (opcional):') ?? undefined) : undefined
    try { await api.patch(`/leads/${card.id}/etapa`, { etapa, motivoPerda }, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }
  async function redistribuir(card: Card) {
    try { await api.post(`/leads/${card.id}/redistribuir`, {}, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }
  async function redistribuirAtrasados() {
    try {
      const { data } = await api.post('/leads/redistribuir-atrasados', {}, { params: escopo.params })
      alert(`${data.redistribuidos} ciclo(s) redistribuído(s).`); carregar()
    } catch (err) { alert(mensagemDeErro(err)) }
  }

  // Drag-and-drop (desktop = mouse; mobile = pressionar e segurar p/ não brigar com o scroll).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
  const [arrastando, setArrastando] = useState<Card | null>(null)
  function aoIniciarArrasto(e: DragStartEvent) { setArrastando((e.active.data.current?.card as Card) ?? null) }
  function aoSoltar(e: DragEndEvent) {
    setArrastando(null)
    const card = e.active.data.current?.card as Card | undefined
    const destino = e.over?.id as Etapa | undefined
    if (card && destino && ETAPAS.includes(destino) && destino !== card.status) mover(card, destino)
  }

  const m = pipe?.metricas
  return (
    <>
      <header>
        <h1>Funil de atendimento &amp; vendas</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          {podeRedistribuir && <button className="btn secundario" onClick={redistribuirAtrasados}>Redistribuir atrasados</button>}
        </div>
      </header>

      {erro && <div className="alerta">{erro}</div>}

      {/* Links do catálogo */}
      {ehVendedora && meuLink && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>Meu link do catálogo</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
            Envie para as suas clientes — quem abrir cai no <strong>seu WhatsApp</strong> e entra na sua carteira.
            {!meuLink.temWhatsapp && <strong style={{ color: '#e8a87c' }}> ⚠️ Conecte seu WhatsApp para receber os contatos.</strong>}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ background: '#0003', padding: '8px 12px', borderRadius: 8 }}>{urlCatalogo(meuLink.redeSlug, meuLink.path)}</code>
            <button className="btn" onClick={() => copiar(meuLink.redeSlug, meuLink.path, 'meu')}>{copiado === 'meu' ? '✓ copiado' : 'Copiar'}</button>
          </div>
        </div>
      )}
      {!ehVendedora && links.length > 0 && (
        <details className="cartao">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Links das vendedoras ({links.length})</summary>
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Vendedora</th><th>Link</th><th>WhatsApp</th><th></th></tr></thead>
            <tbody>
              {links.map((v) => (
                <tr key={v.id}>
                  <td>{v.nome}</td>
                  <td><code style={{ fontSize: 12 }}>{urlCatalogo(v.redeSlug, v.path)}</code></td>
                  <td>{v.temWhatsapp ? <span className="selo ok">conectado</span> : <span className="selo baixo">sem WhatsApp</span>}</td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); copiar(v.redeSlug, v.path, v.id) }}>{copiado === v.id ? '✓ copiado' : 'copiar'}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* Métricas do funil */}
      {m && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '4px 0 12px' }}>
          <Metr titulo="Abertos" valor={m.abertos} />
          <Metr titulo="Atrasados (SLA)" valor={m.atrasados} alerta={m.atrasados > 0} />
          <Metr titulo="Convertidos" valor={m.convertidos} />
          <Metr titulo="Taxa de conversão" valor={`${m.taxaConversao}%`} />
          <Metr titulo="Tempo médio 1ª resposta" valor={m.tempoMedioRespostaMin != null ? `${m.tempoMedioRespostaMin}min` : '—'} />
        </div>
      )}

      {/* Legenda + contadores por situação (mapa de gargalos — vendedora e gestor) */}
      {m && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 12px' }}>
          {ordemSituacao.filter((ch) => (m.porSituacao[ch] ?? 0) > 0).map((ch) => (
            <span key={ch} title={labelSituacao[ch]} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
              padding: '3px 9px', borderRadius: 999, color: corSituacao[ch],
              background: `${corSituacao[ch]}22`, border: `1px solid ${corSituacao[ch]}55`,
            }}>
              <span aria-hidden>{iconeSituacao[ch]}</span>{labelSituacao[ch]}
              <strong style={{ marginLeft: 2 }}>{m.porSituacao[ch]}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Kanban com arrastar-e-soltar (alça ⠿) — desktop e mobile. O select continua como alternativa. */}
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 6px' }}>
        Dica: arraste o card pela alça <strong>⠿</strong> para outra etapa (no celular, pressione e segure). Ou use o seletor no card.
      </div>
      <DndContext sensors={sensors} onDragStart={aoIniciarArrasto} onDragEnd={aoSoltar}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))', gap: 10, overflowX: 'auto' }}>
          {ETAPAS.map((etapa) => {
            const cards = pipe?.colunas[etapa] ?? []
            return (
              <ColunaDrop key={etapa} etapa={etapa}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 8px', borderBottom: `2px solid ${corEtapa[etapa]}`, marginBottom: 8 }}>
                  <strong style={{ color: corEtapa[etapa] }}>{rotuloEtapa[etapa]}</strong>
                  <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{cards.length}</span>
                </div>
                {cards.map((c) => (
                  <CardLead key={c.id} c={c} mover={mover} redistribuir={redistribuir} podeRedistribuir={podeRedistribuir} />
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
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Solte numa etapa</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
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

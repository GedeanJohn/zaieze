import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { urlCatalogo } from '../host'
import { useLojaAtiva, SeletorLoja } from '../componentes/SeletorLoja'

type Etapa = 'ENTROU' | 'ATENDIDO' | 'NEGOCIANDO' | 'CONVERTIDO' | 'PERDIDO'

interface Card {
  id: string; nome?: string | null; telefone?: string | null; status: Etapa; atrasado: boolean
  redistribuicoes: number; etapaDesde: string; createdAt: string
  vendedora: { id: string; nome: string }
  cliente?: { id: string; nome: string; telefone: string } | null
}
interface Metricas { total: number; abertos: number; atrasados: number; convertidos: number; perdidos: number; taxaConversao: number; tempoMedioRespostaMin: number | null }
interface Pipeline { colunas: Record<Etapa, Card[]>; metricas: Metricas }
interface LinkVend { id: string; nome: string; slug: string; redeSlug: string; path: string; temWhatsapp: boolean }

const ETAPAS: Etapa[] = ['ENTROU', 'ATENDIDO', 'NEGOCIANDO', 'CONVERTIDO', 'PERDIDO']
const rotuloEtapa: Record<Etapa, string> = { ENTROU: 'Entrou', ATENDIDO: 'Atendido', NEGOCIANDO: 'Negociando', CONVERTIDO: 'Convertido', PERDIDO: 'Perdido' }
const corEtapa: Record<Etapa, string> = { ENTROU: '#e8a87c', ATENDIDO: '#7cc4e8', NEGOCIANDO: '#c9a0ff', CONVERTIDO: '#7ce8a0', PERDIDO: '#888' }

function tempoNaEtapa(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.floor(ms / 60_000)}min`
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
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

      {/* Kanban */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(180px, 1fr))', gap: 10, overflowX: 'auto' }}>
        {ETAPAS.map((etapa) => {
          const cards = pipe?.colunas[etapa] ?? []
          return (
            <div key={etapa} style={{ background: '#ffffff08', borderRadius: 10, padding: 8, minWidth: 180 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 8px', borderBottom: `2px solid ${corEtapa[etapa]}`, marginBottom: 8 }}>
                <strong style={{ color: corEtapa[etapa] }}>{rotuloEtapa[etapa]}</strong>
                <span style={{ color: 'var(--ink-soft)', fontSize: 12 }}>{cards.length}</span>
              </div>
              {cards.map((c) => (
                <div key={c.id} className="cartao" style={{ padding: 10, marginBottom: 8, borderLeft: `3px solid ${c.atrasado ? '#ff6b6b' : corEtapa[etapa]}` }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.cliente?.nome ?? c.nome ?? '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{c.cliente?.telefone ?? c.telefone ?? ''}</div>
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
              ))}
              {cards.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 12, padding: 6 }}>—</div>}
            </div>
          )
        })}
      </div>
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

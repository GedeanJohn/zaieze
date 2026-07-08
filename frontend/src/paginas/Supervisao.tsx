import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useIdioma } from '../lib/i18n'

type Canal = 'whatsapp' | 'instagram'

interface Conversa {
  canal: Canal
  cliente: { id: string; nome: string; telefone: string | null; segmento: string; vendedoraId: string | null }
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
  midiaUrl?: string | null
  createdAt: string
}

interface Vendedora { id: string; nome: string; role: string }

const POLL_MS = 18000
const TITULO_PADRAO = document.title

function hora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function recibo(status: string, t: (chave: string) => string): string {
  switch (status) {
    case 'ENVIADA': return '✓'
    case 'ENTREGUE': return '✓✓'
    case 'LIDA': return '✓✓'
    case 'FALHA': return t('caixa.falhou')
    case 'SIMULADA': return t('caixa.simulada')
    default: return status.toLowerCase()
  }
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

/** Janela de páginas estilo Google: 1 2 3 … 8 9 (sempre com bordas e vizinhas da atual). */
function paginasVisiveis(total: number, atual: number): (number | '…')[] {
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)
  const marcadas = new Set<number>([1, 2, total - 1, total, atual - 1, atual, atual + 1])
  const ordenadas = [...marcadas].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const saida: (number | '…')[] = []
  let anterior = 0
  for (const p of ordenadas) {
    if (anterior && p - anterior > 1) saida.push('…')
    saida.push(p)
    anterior = p
  }
  return saida
}

/**
 * Supervisão do atendimento: gerente/gestor acompanham (somente leitura) o WhatsApp/Instagram
 * de cada vendedora, uma por vez, navegando por paginação — página N = a N-ésima vendedora,
 * com o nome dela como título. Atualiza sozinho por polling (sem WebSocket na base atual).
 */
export default function Supervisao() {
  const escopo = useLojaAtiva()
  const { t } = useIdioma()

  const [vendedoras, setVendedoras] = useState<Vendedora[]>([])
  const [pagina, setPagina] = useState(1)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [sel, setSel] = useState<Conversa | null>(null)
  const [thread, setThread] = useState<Mensagem[]>([])
  const [busca, setBusca] = useState('')

  const vendedoraAtual = vendedoras[pagina - 1] ?? null
  const selRef = useRef<Conversa | null>(null)
  useEffect(() => { selRef.current = sel }, [sel])

  const carregarVendedoras = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/usuarios', { params: escopo.params })
    const lista = (data as Vendedora[]).filter((u) => u.role === 'VENDEDORA')
    setVendedoras(lista)
    setPagina((p) => Math.min(Math.max(p, 1), Math.max(lista.length, 1)))
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregarVendedoras() }, [carregarVendedoras])

  const carregarConversas = useCallback(async () => {
    if (!escopo.pronto || !vendedoraAtual) { setConversas([]); return }
    const params = { ...escopo.params, vendedoraId: vendedoraAtual.id }
    const [wa, ig] = await Promise.all([
      api.get('/whatsapp/conversas', { params }),
      api.get('/instagram/conversas', { params }).catch(() => ({ data: [] as Omit<Conversa, 'canal'>[] })),
    ])
    const todas: Conversa[] = [
      ...(wa.data as Omit<Conversa, 'canal'>[]).map((c) => ({ ...c, canal: 'whatsapp' as const })),
      ...(ig.data as Omit<Conversa, 'canal'>[]).map((c) => ({ ...c, canal: 'instagram' as const })),
    ].sort((a, b) => new Date(b.ultimaEm).getTime() - new Date(a.ultimaEm).getTime())
    setConversas(todas)
  }, [escopo.pronto, escopo.params, vendedoraAtual])

  // Troca de vendedora (página): reseta a conversa aberta e recarrega a lista dela.
  useEffect(() => { setSel(null); setThread([]); carregarConversas() }, [carregarConversas])

  const abrir = useCallback(async (c: Conversa) => {
    if (!vendedoraAtual) return
    setSel(c)
    const { data } = await api.get(`/${c.canal}/conversas/${c.cliente.id}`, { params: { ...escopo.params, vendedoraId: vendedoraAtual.id } })
    setThread(data)
  }, [escopo.params, vendedoraAtual])

  // Polling: mantém a lista e a conversa aberta atualizadas sem precisar recarregar a página.
  useEffect(() => {
    if (!vendedoraAtual) return
    const id = setInterval(async () => {
      carregarConversas()
      const atual = selRef.current
      if (atual) {
        const { data } = await api.get(`/${atual.canal}/conversas/${atual.cliente.id}`, { params: { ...escopo.params, vendedoraId: vendedoraAtual.id } })
        setThread(data)
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [vendedoraAtual, escopo.params, carregarConversas])

  // "Título da página" = nome da vendedora (aba do navegador), como pedido.
  useEffect(() => {
    document.title = vendedoraAtual ? `${vendedoraAtual.nome} · ${t('superv.titulo')}` : TITULO_PADRAO
    return () => { document.title = TITULO_PADRAO }
  }, [vendedoraAtual, t])

  const q = busca.trim().toLowerCase()
  const lista = q ? conversas.filter((c) => c.cliente.nome.toLowerCase().includes(q) || (c.cliente.telefone ?? '').includes(q)) : conversas
  const paginas = paginasVisiveis(vendedoras.length, pagina)

  return (
    <>
      <header>
        <h1>{t('superv.titulo')}</h1>
        <SeletorLoja escopo={escopo} />
      </header>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14, marginTop: -8 }}>{t('superv.subtitulo')}</p>

      <div className="cartao">
        {vendedoraAtual ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <h2 className="painel-titulo" style={{ margin: 0 }}>{vendedoraAtual.nome}</h2>
            <span className="selo ok">{t('superv.somenteLeitura')}</span>
          </div>
        ) : (
          <div className="cz-aviso">{t('superv.semVendedoras')}</div>
        )}

        {vendedoraAtual && (
          <div className={`chatz${sel ? ' tem-sel' : ''}`}>
            <aside className="cz-lista">
              <div className="cz-lista-top">
                <div className="cz-titulo">{t('caixa.conversas')} <span className="cz-count">{conversas.length}</span></div>
                <input className="cz-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('caixa.buscarConversas')} />
              </div>
              <div className="cz-itens">
                {lista.map((c) => (
                  <button key={`${c.canal}-${c.cliente.id}`} className={`cz-item${sel?.cliente.id === c.cliente.id && sel.canal === c.canal ? ' ativo' : ''}`} onClick={() => abrir(c)}>
                    <span className="cz-avatar-wrap">
                      <span className="cz-avatar">{iniciais(c.cliente.nome)}</span>
                      <span className={`cz-canal ${c.canal}`} title={c.canal === 'instagram' ? 'Instagram' : 'WhatsApp'}>{c.canal === 'instagram' ? '📷' : '💬'}</span>
                    </span>
                    <span className="cz-item-main">
                      <span className="cz-item-top"><strong>{c.cliente.nome}</strong><span className="cz-hora">{hora(c.ultimaEm)}</span></span>
                      <span className="cz-previa">{c.ultimaDirecao === 'ENVIADA' ? '↩ ' : ''}{c.ultimaMensagem}</span>
                    </span>
                    {c.naoLidas > 0 && <span className="cz-badge">{c.naoLidas}</span>}
                  </button>
                ))}
                {lista.length === 0 && <div className="cz-aviso">{conversas.length === 0 ? t('caixa.nenhumaConversaAinda') : t('caixa.nadaEncontrado')}</div>}
              </div>
            </aside>

            <section className="cz-conversa">
              {!sel ? (
                <div className="cz-vazio">{t('caixa.selecioneConversa')}</div>
              ) : (
                <>
                  <div className="cz-conv-top">
                    <button type="button" className="cz-voltar" onClick={() => setSel(null)} aria-label={t('caixa.voltar')}>←</button>
                    <span className="cz-avatar sm">{iniciais(sel.cliente.nome)}</span>
                    <div className="cz-conv-nome">
                      <strong>{sel.cliente.nome}</strong>
                      <span>{sel.canal === 'instagram' ? '📷 Instagram' : sel.cliente.telefone}</span>
                    </div>
                    <span className="selo ok">{t('superv.somenteLeitura')}</span>
                  </div>
                  <div className="cz-bolhas">
                    {thread.map((m) => (
                      <div key={m.id} className={`cz-bolha ${m.direcao === 'ENVIADA' ? 'saida' : 'entrada'}`}>
                        {m.tipoMidia === 'AUDIO' && m.midiaUrl
                          ? <audio className="cz-audio" src={m.midiaUrl} controls preload="none" />
                          : m.tipoMidia === 'IMAGEM' && m.midiaUrl
                            ? <a href={m.midiaUrl} target="_blank" rel="noreferrer"><img className="cz-img" src={m.midiaUrl} alt="" /></a>
                            : <div>{m.texto}</div>}
                        <span className="cz-meta">
                          {hora(m.createdAt)}
                          {m.direcao === 'ENVIADA' && <> · <span style={m.status === 'LIDA' ? { color: '#53bdeb' } : undefined}>{recibo(m.status, t)}</span></>}
                        </span>
                      </div>
                    ))}
                    {thread.length === 0 && <div style={{ color: 'var(--cz-mut)', margin: 'auto' }}>{t('caixa.semMensagens')}</div>}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* Paginação estilo Google: cada número é UMA vendedora. */}
        {vendedoras.length > 1 && (
          <nav className="superv-paginacao" aria-label={t('superv.titulo')}>
            <button type="button" className="superv-pg" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>{t('superv.anterior')}</button>
            {paginas.map((p, i) => p === '…'
              ? <span key={`e${i}`} className="superv-pg-reticencias">…</span>
              : <button key={p} type="button" className={`superv-pg${p === pagina ? ' ativo' : ''}`} onClick={() => setPagina(p)}>{p}</button>)}
            <button type="button" className="superv-pg" disabled={pagina >= vendedoras.length} onClick={() => setPagina((p) => p + 1)}>{t('superv.proxima')}</button>
          </nav>
        )}
      </div>
    </>
  )
}

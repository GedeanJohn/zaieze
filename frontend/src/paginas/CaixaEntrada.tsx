import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Menu, Search, SlidersHorizontal, Sparkles, ChevronRight, MoreHorizontal, Headset, Plus } from 'lucide-react'
import { api, mensagemDeErro } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'
import { IconeWhatsApp, IconeInstagram, IconeMessenger, IconeTelegram, IconeEmail, IconeTodosCanais } from '../componentes/IconesCanal'

type Canal = 'whatsapp' | 'instagram'
// Canais que ainda não têm integração de verdade — aparecem na barra (mockup multicanal), mas
// desabilitados, até termos a conexão oficial da Meta (Messenger) e decidirmos o provedor de e-mail.
type CanalFuturo = 'messenger' | 'email' | 'telegram'
type FiltroCanal = 'todas' | Canal

interface Conversa {
  canal: Canal
  cliente: { id: string; nome: string; telefone: string | null; segmento: string; vendedoraId: string | null }
  vendedoraNome: string | null
  ultimaMensagem: string
  ultimaDirecao: 'ENVIADA' | 'RECEBIDA'
  ultimaEm: string
  mensagens: number
  naoLidas: number
  // capturados do WhatsApp quando a API oficial estiver ligada (hoje ausentes → ocultos)
  online?: boolean
  verificado?: boolean
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

interface ChatStats {
  receitaMes: number; negociosAtivos: number; novosLeads: number; taxaConversao: number; metaMes: number | null; pctMeta: number | null
  conversasAtivas: number; tempoMedioRespostaMin: number | null; satisfacaoPct: number | null
}

// Canais que aparecem na barra do mockup mas ainda não têm integração — ícone + cor de marca,
// pra já deixar o espaço reservado sem fingir que funcionam.
const CANAIS_FUTUROS: { chave: CanalFuturo; rotulo: string; Icone: (p: { size?: number }) => JSX.Element }[] = [
  { chave: 'messenger', rotulo: 'Messenger', Icone: IconeMessenger },
  { chave: 'email', rotulo: 'Email', Icone: IconeEmail },
  { chave: 'telegram', rotulo: 'Telegram', Icone: IconeTelegram },
]

// Mídia recebida pelo WhatsApp pessoal (Baileys) vira só uma etiqueta — sem o arquivo em si
// (a vendedora já vê no próprio celular, dono da conversa; ver baileys.service.ts no backend).
const ROTULO_MIDIA: Record<string, string> = { IMAGEM: '📷 Imagem', AUDIO: '🎤 Áudio', VIDEO: '🎥 Vídeo' }
interface ClienteLite { id: string; nome: string; telefone: string | null; segmento: string }
interface Grupo { id: string; nome: string; membros: number; ultimaMensagem: string | null; ultimaEm: string }
interface Disparo { id: string; texto: string; status: string; createdAt: string }
interface GrupoDetalhe { id: string; nome: string; membros: ClienteLite[]; disparos: Disparo[] }
interface ResultadoDisparo { alcance: number; enviados: number; simulados: number; falhas: number; semConsentimento: number; semVendedora: number }

function hora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Recibo de entrega (WhatsApp): ✓ enviada, ✓✓ entregue/lida (lida = azul, tratado no estilo). */
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

/** Segundos → mm:ss (cronômetro da gravação). */
function mmss(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Iniciais do nome para o avatar. */
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

type Filtro = 'NOVIDADES' | 'NAO_LIDAS' | 'GRUPOS'

export default function CaixaEntrada() {
  const escopo = useLojaAtiva()
  const navigate = useNavigate()
  const { t } = useIdioma()
  const avisar = useToast()
  const [searchParams] = useSearchParams()
  const abriuParam = useRef(false)
  const buscaRef = useRef<HTMLInputElement>(null)
  const [stats, setStats] = useState<ChatStats | null>(null)

  const [conversas, setConversas] = useState<Conversa[]>([])
  const [sel, setSel] = useState<Conversa | null>(null)
  const [thread, setThread] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('NOVIDADES')
  const [canalFiltro, setCanalFiltro] = useState<FiltroCanal>('todas')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Gravação de áudio (mensagem de voz)
  const [gravando, setGravando] = useState(false)
  const [segGrav, setSegGrav] = useState(0)
  const mediaRec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timerGrav = useRef<number | null>(null)


  // Grupos
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoSel, setGrupoSel] = useState<GrupoDetalhe | null>(null)
  const [textoGrupo, setTextoGrupo] = useState('')
  const [resultadoGrupo, setResultadoGrupo] = useState<ResultadoDisparo | null>(null)
  const [modalGrupo, setModalGrupo] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const [wa, ig] = await Promise.all([
      api.get('/whatsapp/conversas', { params: escopo.params }),
      api.get('/instagram/conversas', { params: escopo.params }).catch(() => ({ data: [] as Omit<Conversa, 'canal'>[] })),
    ])
    const todas: Conversa[] = [
      ...(wa.data as Omit<Conversa, 'canal'>[]).map((c) => ({ ...c, canal: 'whatsapp' as const })),
      ...(ig.data as Omit<Conversa, 'canal'>[]).map((c) => ({ ...c, canal: 'instagram' as const })),
    ].sort((a, b) => new Date(b.ultimaEm).getTime() - new Date(a.ultimaEm).getTime())
    setConversas(todas)
  }, [escopo.pronto, escopo.params])

  const carregarGrupos = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/whatsapp/grupos', { params: escopo.params })
    setGrupos(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  // Estatísticas da vendedora (topo do chat)
  useEffect(() => {
    if (!escopo.pronto) return
    api.get('/dashboard/chat-stats', { params: escopo.params }).then(({ data }) => setStats(data)).catch(() => {})
  }, [escopo.pronto, escopo.params])
  useEffect(() => { if (filtro === 'GRUPOS') carregarGrupos() }, [filtro, carregarGrupos])

  const abrir = useCallback(async (c: Conversa) => {
    setGrupoSel(null); setSel(c); setErro(''); setTexto('')
    const { data } = await api.get(`/${c.canal}/conversas/${c.cliente.id}`, { params: escopo.params })
    setThread(data)
  }, [escopo.params])

  // Abertura direta por ?cliente=<id> (vindo do funil): abre a conversa do cliente, mesmo sem
  // mensagens ainda (busca os dados do cliente p/ montar o cabeçalho). Roda uma única vez.
  useEffect(() => {
    const id = searchParams.get('cliente')
    if (!id || !escopo.pronto || abriuParam.current) return
    abriuParam.current = true
    ;(async () => {
      const existente = conversas.find((c) => c.cliente.id === id)
      if (existente) { abrir(existente); return }
      try {
        const { data } = await api.get(`/clientes/${id}`, { params: escopo.params })
        // Sem telefone → só pode ter chegado pelo Instagram.
        const canal: Canal = data.telefone ? 'whatsapp' : 'instagram'
        setGrupoSel(null); setErro(''); setTexto('')
        setSel({
          canal,
          cliente: { id: data.id, nome: data.nome, telefone: data.telefone, segmento: data.segmento, vendedoraId: data.vendedoraId ?? null },
          vendedoraNome: null,
          ultimaMensagem: '', ultimaDirecao: 'ENVIADA', ultimaEm: new Date().toISOString(), mensagens: 0, naoLidas: 0,
        })
        const t = await api.get(`/${canal}/conversas/${id}`, { params: escopo.params })
        setThread(t.data)
      } catch { /* cliente inacessível nesta loja — ignora */ }
    })()
  }, [searchParams, escopo.pronto, escopo.params, conversas, abrir])

  const abrirGrupo = useCallback(async (id: string) => {
    setSel(null); setErro(''); setTextoGrupo(''); setResultadoGrupo(null)
    const { data } = await api.get(`/whatsapp/grupos/${id}`, { params: escopo.params })
    setGrupoSel(data)
  }, [escopo.params])

  async function responder(e: React.FormEvent) {
    e.preventDefault()
    if (!sel || !texto.trim()) return
    setEnviando(true); setErro('')
    try {
      const { data } = await api.post(`/${sel.canal}/conversas/${sel.cliente.id}/responder`, { texto }, { params: escopo.params })
      setThread((t) => [...t, data])
      setTexto('')
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }

  function pararTimer() { if (timerGrav.current) { clearInterval(timerGrav.current); timerGrav.current = null } }

  async function iniciarGravacao() {
    if (!sel) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunks.current = []
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      mr.start()
      mediaRec.current = mr
      setErro(''); setGravando(true); setSegGrav(0)
      timerGrav.current = window.setInterval(() => setSegGrav((s) => s + 1), 1000)
    } catch {
      setErro(t('caixa.microfoneNegado'))
    }
  }

  function enviarGravacao() {
    const mr = mediaRec.current
    if (!mr || !sel) return
    const clienteId = sel.cliente.id
    pararTimer(); setGravando(false)
    mr.onstop = async () => {
      mr.stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' })
      if (blob.size < 1200) { setErro(t('caixa.audioMuitoCurto')); return } // descarta gravações vazias
      setEnviando(true); setErro('')
      try {
        const fd = new FormData()
        fd.append('file', blob, 'audio.webm')
        const { data } = await api.post(`/whatsapp/conversas/${clienteId}/audio`, fd, { params: escopo.params })
        setThread((t) => [...t, data]); carregar()
      } catch (err) {
        setErro(mensagemDeErro(err))
      } finally {
        setEnviando(false)
      }
    }
    mr.stop()
  }

  function cancelarGravacao() {
    const mr = mediaRec.current
    pararTimer(); setGravando(false); chunks.current = []
    if (mr) { mr.onstop = () => mr.stream.getTracks().forEach((t) => t.stop()); mr.stop() }
  }

  async function dispararGrupo(e: React.FormEvent) {
    e.preventDefault()
    if (!grupoSel || !textoGrupo.trim()) return
    setEnviando(true); setErro(''); setResultadoGrupo(null)
    try {
      const { data } = await api.post(`/whatsapp/grupos/${grupoSel.id}/disparar`, { texto: textoGrupo }, { params: escopo.params })
      setResultadoGrupo(data)
      setTextoGrupo('')
      abrirGrupo(grupoSel.id)
      carregarGrupos()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }

  async function excluirGrupo(id: string) {
    if (!confirm(t('caixa.excluirGrupoConfirm'))) return
    await api.delete(`/whatsapp/grupos/${id}`, { params: escopo.params })
    setGrupoSel(null)
    carregarGrupos()
  }


  const totalNaoLidas = conversas.reduce((s, c) => s + (c.naoLidas > 0 ? 1 : 0), 0)
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return conversas.filter((c) => {
      if (canalFiltro !== 'todas' && c.canal !== canalFiltro) return false
      if (filtro === 'NAO_LIDAS' && c.naoLidas === 0) return false
      if (!q) return true
      return c.cliente.nome.toLowerCase().includes(q) || (c.cliente.telefone ?? '').includes(q)
    })
  }, [conversas, busca, filtro, canalFiltro])

  function clicarCanalFuturo(rotulo: string) {
    avisar(`${rotulo}: em breve — chega junto com a conexão oficial da Meta / decisão do provedor de e-mail.`)
  }

  function clicarNovoAtendimento() {
    avisar(t('caixa.novoAtendimentoEmBreve'))
  }

  /** "Chegou agora": mensagem não lida nos últimos 10 minutos — vira a tag "Nova Mensagem" do mockup
   * (diferente do badge numérico, que conta todo não lido, mesmo mais antigo). */
  function ehNovaMensagem(c: Conversa): boolean {
    if (c.naoLidas === 0 || c.ultimaDirecao !== 'RECEBIDA') return false
    return Date.now() - new Date(c.ultimaEm).getTime() < 10 * 60_000
  }

  const gruposFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? grupos.filter((g) => g.nome.toLowerCase().includes(q)) : grupos
  }, [grupos, busca])

  const temSel = !!sel || !!grupoSel

  return (
    <div className={`cz-pagina${temSel ? ' zen' : ''}`}>
      {!temSel && (
        <div className="cz-multicanal-topo">
          <div className="cz-multicanal-linha">
            <button type="button" className="cz-multicanal-icone" onClick={() => window.dispatchEvent(new CustomEvent('zz:abrir-menu'))} aria-label={t('layout.mais')}>
              <Menu size={19} strokeWidth={1.8} />
            </button>
            <div className="cz-multicanal-marca">
              <strong>ZAIEZE</strong>
              <span>MULTICANAL</span>
            </div>
            <div className="cz-multicanal-acoes">
              <button type="button" className="cz-multicanal-icone" title="ZAI.AI" aria-hidden="true">
                <Sparkles size={17} strokeWidth={1.8} />
              </button>
            </div>
          </div>
          <div className="cz-multicanal-arco" aria-hidden="true" />
        </div>
      )}
      {!temSel && (
        <div className="cz-topo">
          <SeletorLoja escopo={escopo} />
        </div>
      )}
      {!temSel && (
        <div className="cz-canais">
          <button type="button" className={`cz-canal-tab${canalFiltro === 'todas' ? ' ativo' : ''}`} title={t('caixa.canalTodas')} onClick={() => setCanalFiltro('todas')}>
            <span className="cz-canal-ico"><IconeTodosCanais size={13} /></span><span className="cz-canal-rotulo">{t('caixa.canalTodas')}</span>
          </button>
          <button type="button" className={`cz-canal-tab${canalFiltro === 'whatsapp' ? ' ativo' : ''}`} title="WhatsApp" onClick={() => setCanalFiltro('whatsapp')}>
            <span className="cz-canal-ico wa"><IconeWhatsApp size={13} /></span><span className="cz-canal-rotulo">WhatsApp</span>
          </button>
          <button type="button" className={`cz-canal-tab${canalFiltro === 'instagram' ? ' ativo' : ''}`} title="Instagram" onClick={() => setCanalFiltro('instagram')}>
            <span className="cz-canal-ico instagram"><IconeInstagram size={13} /></span><span className="cz-canal-rotulo">Instagram</span>
          </button>
          {CANAIS_FUTUROS.map((c) => (
            <button key={c.chave} type="button" className="cz-canal-tab" disabled title={t('caixa.canalEmBreve')} onClick={() => clicarCanalFuturo(c.rotulo)}>
              <span className={`cz-canal-ico ${c.chave}`}><c.Icone size={13} /></span><span className="cz-canal-rotulo">{c.rotulo}</span>
            </button>
          ))}
          <button type="button" className="cz-canal-tab" disabled title={t('caixa.canalEmBreve')} onClick={() => clicarCanalFuturo(t('caixa.canalMais'))}>
            <span className="cz-canal-ico mais"><MoreHorizontal size={15} /></span><span className="cz-canal-rotulo">{t('caixa.canalMais')}</span>
          </button>
        </div>
      )}

      {!temSel && (
        <div className="cz-ai-card">
          <div className="cz-ai-avatar-orbita">
            <svg className="cz-ai-anel" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="30" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" strokeDasharray="1.2 9" />
              <circle cx="14" cy="7" r="2.2" fill="#fff" />
              <circle cx="4" cy="48" r="1.6" fill="#fff" opacity="0.75" />
            </svg>
            <div className="cz-ai-avatar">Z</div>
          </div>
          <div className="cz-ai-info">
            <div className="cz-ai-nome">ZAI.AI <span className="cz-ai-beta">BETA</span></div>
            <div className="cz-ai-sub">{t('caixa.aiSubtitulo')}</div>
            <div className="cz-ai-status"><span className="cz-ai-status-dot" />{t('caixa.aiAtiva')}</div>
          </div>
          <div className="cz-ai-metricas">
            <div className="cz-ai-metrica">
              <span className="cz-ai-metrica-topo">{t('caixa.aiMetConversasTopo')}</span>
              <strong>{stats ? stats.conversasAtivas : '—'}</strong>
              <span className="cz-ai-metrica-baixo">{t('caixa.aiMetConversasBaixo')}</span>
            </div>
            <div className="cz-ai-metrica">
              <span className="cz-ai-metrica-topo">{t('caixa.aiMetTempoTopo')}</span>
              <strong>{stats?.tempoMedioRespostaMin != null ? `${stats.tempoMedioRespostaMin}min` : '—'}</strong>
              <span className="cz-ai-metrica-baixo">{t('caixa.aiMetTempoBaixo')}</span>
            </div>
            <div className="cz-ai-metrica">
              <span className="cz-ai-metrica-topo">{t('caixa.aiMetSatisfacaoTopo')}</span>
              <strong>{stats?.satisfacaoPct != null ? `${stats.satisfacaoPct}%` : '—'}</strong>
              <span className="cz-ai-metrica-baixo">{t('caixa.aiMetSatisfacaoBaixo')}</span>
            </div>
          </div>
          <ChevronRight size={18} className="cz-ai-seta" aria-hidden="true" />
        </div>
      )}

      {!temSel && (
        <div className="cz-busca-topo">
          <Search size={16} strokeWidth={2} />
          <input
            ref={buscaRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={filtro === 'GRUPOS' ? t('caixa.buscarGrupos') : t('caixa.buscarConversas')}
          />
          <button type="button" className="cz-busca-filtro" aria-label={t('caixa.canalTodas')}>
            <SlidersHorizontal size={15} strokeWidth={2} />
          </button>
        </div>
      )}

      <div className={`chatz${temSel ? ' tem-sel' : ''}`}>
        {/* Lista (conversas ou grupos) */}
        <aside className="cz-lista">
          <div className="cz-lista-top">
            <div className="cz-tabs">
              <button type="button" className={`cz-tab${filtro === 'NOVIDADES' ? ' ativo' : ''}`} onClick={() => { setFiltro('NOVIDADES'); setGrupoSel(null) }}>{t('caixa.novidades')}</button>
              <button type="button" className={`cz-tab${filtro === 'NAO_LIDAS' ? ' ativo' : ''}`} onClick={() => { setFiltro('NAO_LIDAS'); setGrupoSel(null) }}>
                {t('caixa.naoLidas')}{totalNaoLidas > 0 && <span className="cz-tab-badge">{totalNaoLidas}</span>}
              </button>
              <button type="button" className={`cz-tab${filtro === 'GRUPOS' ? ' ativo' : ''}`} onClick={() => { setFiltro('GRUPOS'); setSel(null) }}>{t('caixa.grupos')}</button>
            </div>
          </div>

          {filtro === 'GRUPOS' ? (
            <div className="cz-itens">
              <button type="button" className="cz-criar-grupo" onClick={() => setModalGrupo(true)}>{t('caixa.criarGrupo')}</button>
              {gruposFiltrados.map((g) => (
                <button key={g.id} className={`cz-item${grupoSel?.id === g.id ? ' ativo' : ''}`} onClick={() => abrirGrupo(g.id)}>
                  <span className="cz-avatar grupo">{iniciais(g.nome)}</span>
                  <span className="cz-item-main">
                    <span className="cz-item-top"><strong>{g.nome}</strong><span className="cz-hora">{g.ultimaMensagem ? hora(g.ultimaEm) : ''}</span></span>
                    <span className="cz-previa">{g.ultimaMensagem ?? `${g.membros} ${t(g.membros === 1 ? 'caixa.membro' : 'caixa.membros')}`}</span>
                  </span>
                </button>
              ))}
              {gruposFiltrados.length === 0 && <div className="cz-aviso">{grupos.length === 0 ? t('caixa.nenhumGrupoAinda') : t('caixa.nadaEncontrado')}</div>}
            </div>
          ) : (
            <div className="cz-itens">
              {lista.map((c) => (
                <button key={`${c.canal}-${c.cliente.id}`} className={`cz-item${sel?.cliente.id === c.cliente.id && sel.canal === c.canal ? ' ativo' : ''}`} onClick={() => abrir(c)}>
                  <span className={`cz-avatar-wrap ${c.canal}`}>
                    <span className="cz-avatar">{iniciais(c.cliente.nome)}</span>
                    {c.online && <span className="cz-online" />}
                    <span className={`cz-canal ${c.canal}`} title={c.canal === 'instagram' ? 'Instagram' : 'WhatsApp'}>
                      {c.canal === 'instagram' ? <IconeInstagram size={9} /> : <IconeWhatsApp size={9} />}
                    </span>
                  </span>
                  <span className="cz-item-main">
                    <span className="cz-item-top">
                      <span className="cz-item-nome-tags">
                        <strong>{c.cliente.nome}{c.verificado && <span className="cz-verificado" title="Verificado">✔</span>}</strong>
                        {(c.cliente.segmento === 'VIP' || ehNovaMensagem(c)) && (
                          <span className="cz-tags">
                            {c.cliente.segmento === 'VIP' && <span className="cz-tag vip">VIP</span>}
                            {ehNovaMensagem(c) && <span className="cz-tag novo">{t('caixa.novaMensagem')}</span>}
                          </span>
                        )}
                      </span>
                      <span className="cz-hora">{hora(c.ultimaEm)}</span>
                    </span>
                    <span className="cz-previa">{c.ultimaDirecao === 'ENVIADA' ? '↩ ' : ''}{c.ultimaMensagem}</span>
                    <span className="cz-item-rodape"><Headset size={11} strokeWidth={2} />{c.vendedoraNome ?? '—'} / {c.cliente.segmento}</span>
                  </span>
                  {c.naoLidas > 0
                    ? <span className="cz-badge">{c.naoLidas}</span>
                    : <span className="cz-badge-ok" title={t('caixa.tudoEmDia')}>✓</span>}
                </button>
              ))}
              {lista.length === 0 && <div className="cz-aviso">{conversas.length === 0 ? t('caixa.nenhumaConversaAinda') : t('caixa.nadaEncontrado')}</div>}
            </div>
          )}
          <button type="button" className="cz-novo-atendimento" onClick={clicarNovoAtendimento}>
            <Plus size={16} strokeWidth={2.4} />{t('caixa.novoAtendimento')}
          </button>
        </aside>

        {/* Painel direito: conversa OU grupo */}
        <section className="cz-conversa">
          {grupoSel ? (
            <>
              <div className="cz-conv-top">
                <button type="button" className="cz-voltar" onClick={() => setGrupoSel(null)} aria-label={t('caixa.voltar')}>←</button>
                <span className="cz-avatar sm grupo">{iniciais(grupoSel.nome)}</span>
                <div className="cz-conv-nome">
                  <strong>{grupoSel.nome}</strong>
                  <span>{grupoSel.membros.length} {t(grupoSel.membros.length === 1 ? 'caixa.membro' : 'caixa.membros')} · {t('caixa.listaTransmissao')}</span>
                </div>
                <button className="cz-btn perigo" onClick={() => excluirGrupo(grupoSel.id)}>🗑 {t('comum.excluir')}</button>
              </div>

              <div className="cz-bolhas cz-grupo-corpo">
                <div className="cz-grupo-membros">
                  {grupoSel.membros.map((m) => (
                    <span key={m.id} className="cz-chip">{m.nome}</span>
                  ))}
                  {grupoSel.membros.length === 0 && <span className="cz-aviso">{t('caixa.grupoSemMembros')}</span>}
                </div>

                {resultadoGrupo && (
                  <div className="cz-resultado">
                    {t('caixa.disparoResumo', { enviados: resultadoGrupo.enviados, simulados: resultadoGrupo.simulados, falhas: resultadoGrupo.falhas })}
                    {resultadoGrupo.semConsentimento > 0 && ` · ${t('caixa.semConsentimentoSufixo', { n: resultadoGrupo.semConsentimento })}`}
                  </div>
                )}

                <div className="cz-dia">{t('caixa.disparosDoGrupo')}</div>
                {grupoSel.disparos.map((d) => (
                  <div key={d.id} className="cz-bolha saida">
                    <div>{d.texto}</div>
                    <span className="cz-meta">{hora(d.createdAt)} · {d.status.toLowerCase()}</span>
                  </div>
                ))}
                {grupoSel.disparos.length === 0 && <div className="cz-aviso" style={{ margin: 'auto' }}>{t('caixa.nenhumDisparoAinda')}</div>}
              </div>

              {erro && <div className="cz-alerta">{erro}</div>}
              <form className="cz-responder" onSubmit={dispararGrupo}>
                <input value={textoGrupo} onChange={(e) => setTextoGrupo(e.target.value)} placeholder={t('caixa.mensagemParaTodos')} />
                <button className="cz-enviar" disabled={enviando || !textoGrupo.trim()} aria-label={t('caixa.disparar')}>{enviando ? '…' : '➤'}</button>
              </form>
            </>
          ) : !sel ? (
            <div className="cz-vazio">{filtro === 'GRUPOS' ? t('caixa.selecioneGrupoOuCrie') : t('caixa.selecioneConversa')}</div>
          ) : (
            <>
              <div className="cz-conv-top">
                <button type="button" className="cz-voltar" onClick={() => setSel(null)} aria-label={t('caixa.voltar')}>←</button>
                <span className="cz-avatar sm">{iniciais(sel.cliente.nome)}</span>
                <div className="cz-conv-nome">
                  <strong>{sel.cliente.nome}</strong>
                  <span>{sel.canal === 'instagram' ? '📷 Instagram' : sel.cliente.telefone}</span>
                </div>
                <button className="cz-btn cz-btn-venda" onClick={() => navigate(`/vendas?cliente=${sel.cliente.id}`)} title={t('caixa.registrarVenda')}>🛒<span className="cz-btn-txt"> {t('caixa.registrarVenda')}</span></button>
              </div>

              <div className="cz-bolhas">
                {thread.map((m) => (
                  <div key={m.id} className={`cz-bolha ${m.direcao === 'ENVIADA' ? 'saida' : 'entrada'}`}>
                    {m.tipoMidia === 'AUDIO' && m.midiaUrl
                      ? <audio className="cz-audio" src={m.midiaUrl} controls preload="none" />
                      : m.tipoMidia === 'IMAGEM' && m.midiaUrl
                        ? <a href={m.midiaUrl} target="_blank" rel="noreferrer"><img className="cz-img" src={m.midiaUrl} alt="" /></a>
                        : m.tipoMidia && !m.midiaUrl
                          // Cliente enviou mídia pelo WhatsApp pessoal (Baileys) — só a etiqueta,
                          // sem baixar o arquivo (a vendedora já vê no próprio celular, dono da conversa).
                          ? (
                            <div>
                              <span className="cz-etiqueta-midia">{ROTULO_MIDIA[m.tipoMidia] ?? m.tipoMidia}</span>
                              {!['[imagem]', '[áudio]', '[vídeo]'].includes(m.texto) && <div className="cz-etiqueta-legenda">{m.texto}</div>}
                            </div>
                          )
                          : <div>{m.texto}</div>}
                    <span className="cz-meta">
                      {hora(m.createdAt)}
                      {m.direcao === 'ENVIADA' && <> · <span style={m.status === 'LIDA' ? { color: '#53bdeb' } : undefined}>{recibo(m.status, t)}</span></>}
                    </span>
                  </div>
                ))}
                {thread.length === 0 && <div style={{ color: 'var(--cz-mut)', margin: 'auto' }}>{t('caixa.semMensagens')}</div>}
              </div>

              {erro && <div className="cz-alerta">{erro}</div>}
              {gravando ? (
                <div className="cz-gravando">
                  <button type="button" className="cz-grav-lixo" onClick={cancelarGravacao} aria-label={t('caixa.cancelarGravacao')}>🗑</button>
                  <span className="cz-grav-rec"><span className="cz-grav-dot" />{t('caixa.gravando', { tempo: mmss(segGrav) })}</span>
                  <button type="button" className="cz-enviar" onClick={enviarGravacao} disabled={enviando} aria-label={t('caixa.enviarAudio')}>{enviando ? '…' : '➤'}</button>
                </div>
              ) : (
                <form className="cz-responder" onSubmit={responder}>
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={t('caixa.digiteMensagem')} />
                  {texto.trim() || sel.canal === 'instagram'
                    ? <button className="cz-enviar" disabled={enviando || !texto.trim()} aria-label={t('caixa.enviar')}>{enviando ? '…' : '➤'}</button>
                    : <button type="button" className="cz-mic" onClick={iniciarGravacao} disabled={enviando} aria-label={t('caixa.gravarAudio')}>
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>
                      </button>}
                </form>
              )}
            </>
          )}
        </section>
      </div>

      {modalGrupo && (
        <ModalCriarGrupo
          escopo={escopo}
          onFechar={() => setModalGrupo(false)}
          onCriado={() => { setModalGrupo(false); carregarGrupos() }}
        />
      )}
    </div>
  )
}

/** Modal de criação de grupo: nome + seleção de clientes da carteira. */
function ModalCriarGrupo({ escopo, onFechar, onCriado }: { escopo: ReturnType<typeof useLojaAtiva>; onFechar: () => void; onCriado: () => void }) {
  const { t } = useIdioma()
  const [nome, setNome] = useState('')
  const [clientes, setClientes] = useState<ClienteLite[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/clientes', { params: escopo.params })
        setClientes((data as Array<{ id: string; nome: string; telefone: string | null; segmento: string }>).map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone, segmento: c.segmento })))
      } catch (e) { setErro(mensagemDeErro(e)) }
    })()
  }, [escopo.params])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? clientes.filter((c) => c.nome.toLowerCase().includes(q) || (c.telefone ?? '').includes(q)) : clientes
  }, [clientes, busca])

  function alternar(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function salvar() {
    if (!nome.trim()) { setErro(t('caixa.deNomeAoGrupo')); return }
    setSalvando(true); setErro('')
    try {
      await api.post('/whatsapp/grupos', { nome, clienteIds: [...sel] }, { params: escopo.params })
      onCriado()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="cz-modal-fundo" onClick={onFechar}>
      <div className="cz-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cz-modal-top">
          <strong>{t('caixa.novoGrupo')}</strong>
          <button className="cz-modal-x" onClick={onFechar} aria-label={t('comum.fechar')}>×</button>
        </div>
        <input className="cz-busca" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t('caixa.nomeGrupoPlaceholder')} autoFocus />
        <div className="cz-modal-sub">{t('caixa.membrosLabel')} <span className="cz-count">{sel.size}</span></div>
        <input className="cz-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('caixa.buscarCliente')} />
        <div className="cz-modal-clientes">
          {filtrados.map((c) => (
            <label key={c.id} className={`cz-cliente-op${sel.has(c.id) ? ' sel' : ''}`}>
              <input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} />
              <span className="cz-avatar sm">{iniciais(c.nome)}</span>
              <span className="cz-cliente-nome"><strong>{c.nome}</strong><span>{c.telefone ?? t('caixa.semWhatsapp')}</span></span>
            </label>
          ))}
          {filtrados.length === 0 && <div className="cz-aviso">{t('caixa.nenhumClienteEncontrado')}</div>}
        </div>
        {erro && <div className="cz-alerta">{erro}</div>}
        <div className="cz-modal-acoes">
          <button className="cz-btn fantasma" onClick={onFechar}>{t('comum.cancelar')}</button>
          <button className="cz-btn" disabled={salvando || !nome.trim()} onClick={salvar}>{salvando ? t('caixa.criando') : t('caixa.criarGrupoBtn')}</button>
        </div>
      </div>
    </div>
  )
}

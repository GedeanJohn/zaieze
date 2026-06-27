import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, mensagemDeErro, usuarioLogado, atualizarUsuarioLocal } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface Conversa {
  cliente: { id: string; nome: string; telefone: string; segmento: string; vendedoraId: string | null }
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

interface ClienteLite { id: string; nome: string; telefone: string; segmento: string }
interface Grupo { id: string; nome: string; membros: number; ultimaMensagem: string | null; ultimaEm: string }
interface Disparo { id: string; texto: string; status: string; createdAt: string }
interface GrupoDetalhe { id: string; nome: string; membros: ClienteLite[]; disparos: Disparo[] }
interface ResultadoDisparo { alcance: number; enviados: number; simulados: number; falhas: number; semConsentimento: number; semVendedora: number }

function hora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
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
  const [searchParams] = useSearchParams()
  const me = usuarioLogado()
  const abriuParam = useRef(false)

  const [conversas, setConversas] = useState<Conversa[]>([])
  const [sel, setSel] = useState<Conversa | null>(null)
  const [thread, setThread] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('NOVIDADES')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Gravação de áudio (mensagem de voz)
  const [gravando, setGravando] = useState(false)
  const [segGrav, setSegGrav] = useState(0)
  const mediaRec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const timerGrav = useRef<number | null>(null)

  // Perfil (foto da vendedora no cabeçalho)
  const [fotoUrl, setFotoUrl] = useState<string | null>(me?.fotoUrl ?? null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Grupos
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [grupoSel, setGrupoSel] = useState<GrupoDetalhe | null>(null)
  const [textoGrupo, setTextoGrupo] = useState('')
  const [resultadoGrupo, setResultadoGrupo] = useState<ResultadoDisparo | null>(null)
  const [modalGrupo, setModalGrupo] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/whatsapp/conversas', { params: escopo.params })
    setConversas(data)
  }, [escopo.pronto, escopo.params])

  const carregarGrupos = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/whatsapp/grupos', { params: escopo.params })
    setGrupos(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (filtro === 'GRUPOS') carregarGrupos() }, [filtro, carregarGrupos])

  const abrir = useCallback(async (c: Conversa) => {
    setGrupoSel(null); setSel(c); setErro(''); setTexto('')
    const { data } = await api.get(`/whatsapp/conversas/${c.cliente.id}`, { params: escopo.params })
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
        setGrupoSel(null); setErro(''); setTexto('')
        setSel({
          cliente: { id: data.id, nome: data.nome, telefone: data.telefone, segmento: data.segmento, vendedoraId: data.vendedoraId ?? null },
          ultimaMensagem: '', ultimaDirecao: 'ENVIADA', ultimaEm: new Date().toISOString(), mensagens: 0, naoLidas: 0,
        })
        const t = await api.get(`/whatsapp/conversas/${id}`, { params: escopo.params })
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
      const { data } = await api.post(`/whatsapp/conversas/${sel.cliente.id}/responder`, { texto }, { params: escopo.params })
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
      setErro('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
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
      if (blob.size < 1200) { setErro('Áudio muito curto.'); return } // descarta gravações vazias
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
    if (!confirm('Excluir este grupo? Os clientes não são apagados.')) return
    await api.delete(`/whatsapp/grupos/${id}`, { params: escopo.params })
    setGrupoSel(null)
    carregarGrupos()
  }

  async function enviarFoto(arquivo: File) {
    setEnviandoFoto(true); setErro('')
    try {
      const fd = new FormData()
      fd.append('file', arquivo)
      const { data } = await api.post('/usuarios/me/foto', fd)
      setFotoUrl(data.fotoUrl)
      atualizarUsuarioLocal({ fotoUrl: data.fotoUrl })
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviandoFoto(false)
    }
  }

  const totalNaoLidas = conversas.reduce((s, c) => s + (c.naoLidas > 0 ? 1 : 0), 0)
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return conversas.filter((c) => {
      if (filtro === 'NAO_LIDAS' && c.naoLidas === 0) return false
      if (!q) return true
      return c.cliente.nome.toLowerCase().includes(q) || c.cliente.telefone.includes(q)
    })
  }, [conversas, busca, filtro])

  const gruposFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? grupos.filter((g) => g.nome.toLowerCase().includes(q)) : grupos
  }, [grupos, busca])

  const temSel = !!sel || !!grupoSel

  return (
    <div className={`cz-pagina${temSel ? ' zen' : ''}`}>
      <div className="cz-cabec">
        <h1 className="cz-marca"><span className="cz-marca-icone">💬</span> Chat Zaieze</h1>

        {/* Perfil da vendedora (foto exibida no cabeçalho) */}
        <div className="cz-perfil">
          <button type="button" className="cz-perfil-avatar" onClick={() => fileRef.current?.click()} disabled={enviandoFoto} title="Trocar foto de perfil">
            {fotoUrl ? <img src={fotoUrl} alt="" /> : <span className="cz-avatar">{iniciais(me?.nome ?? 'Você')}</span>}
            <span className="cz-perfil-cam">{enviandoFoto ? '…' : '📷'}</span>
          </button>
          <div className="cz-perfil-info">
            <span className="cz-perfil-rotulo">Você</span>
            <strong>{me?.nome ?? 'Minha conta'}</strong>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFoto(f); e.target.value = '' }} />
        </div>

        <SeletorLoja escopo={escopo} />
      </div>

      <div className={`chatz${temSel ? ' tem-sel' : ''}`}>
        {/* Lista (conversas ou grupos) */}
        <aside className="cz-lista">
          <div className="cz-lista-top">
            <div className="cz-titulo">
              {filtro === 'GRUPOS' ? <>Grupos <span className="cz-count">{grupos.length}</span></> : <>Conversas <span className="cz-count">{conversas.length}</span></>}
            </div>
            <input className="cz-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={filtro === 'GRUPOS' ? 'Buscar grupos…' : 'Buscar conversas…'} />
            <div className="cz-tabs">
              <button type="button" className={`cz-tab${filtro === 'NOVIDADES' ? ' ativo' : ''}`} onClick={() => { setFiltro('NOVIDADES'); setGrupoSel(null) }}>Novidades</button>
              <button type="button" className={`cz-tab${filtro === 'NAO_LIDAS' ? ' ativo' : ''}`} onClick={() => { setFiltro('NAO_LIDAS'); setGrupoSel(null) }}>
                Não Lidas{totalNaoLidas > 0 && <span className="cz-tab-badge">{totalNaoLidas}</span>}
              </button>
              <button type="button" className={`cz-tab${filtro === 'GRUPOS' ? ' ativo' : ''}`} onClick={() => { setFiltro('GRUPOS'); setSel(null) }}>Grupos</button>
            </div>
          </div>

          {filtro === 'GRUPOS' ? (
            <div className="cz-itens">
              <button type="button" className="cz-criar-grupo" onClick={() => setModalGrupo(true)}>＋ Criar grupo</button>
              {gruposFiltrados.map((g) => (
                <button key={g.id} className={`cz-item${grupoSel?.id === g.id ? ' ativo' : ''}`} onClick={() => abrirGrupo(g.id)}>
                  <span className="cz-avatar grupo">{iniciais(g.nome)}</span>
                  <span className="cz-item-main">
                    <span className="cz-item-top"><strong>{g.nome}</strong><span className="cz-hora">{g.ultimaMensagem ? hora(g.ultimaEm) : ''}</span></span>
                    <span className="cz-previa">{g.ultimaMensagem ?? `${g.membros} ${g.membros === 1 ? 'membro' : 'membros'}`}</span>
                  </span>
                </button>
              ))}
              {gruposFiltrados.length === 0 && <div className="cz-aviso">{grupos.length === 0 ? 'Nenhum grupo ainda. Crie o primeiro.' : 'Nada encontrado.'}</div>}
            </div>
          ) : (
            <div className="cz-itens">
              {lista.map((c) => (
                <button key={c.cliente.id} className={`cz-item${sel?.cliente.id === c.cliente.id ? ' ativo' : ''}`} onClick={() => abrir(c)}>
                  <span className="cz-avatar-wrap">
                    <span className="cz-avatar">{iniciais(c.cliente.nome)}</span>
                    {c.online && <span className="cz-online" />}
                  </span>
                  <span className="cz-item-main">
                    <span className="cz-item-top">
                      <strong>{c.cliente.nome}{c.verificado && <span className="cz-verificado" title="Verificado">✔</span>}</strong>
                      <span className="cz-hora">{hora(c.ultimaEm)}</span>
                    </span>
                    <span className="cz-previa">{c.ultimaDirecao === 'ENVIADA' ? '↩ ' : ''}{c.ultimaMensagem}</span>
                  </span>
                  {c.naoLidas > 0 && <span className="cz-badge">{c.naoLidas}</span>}
                </button>
              ))}
              {lista.length === 0 && <div className="cz-aviso">{conversas.length === 0 ? 'Nenhuma conversa ainda.' : 'Nada encontrado.'}</div>}
            </div>
          )}
        </aside>

        {/* Painel direito: conversa OU grupo */}
        <section className="cz-conversa">
          {grupoSel ? (
            <>
              <div className="cz-conv-top">
                <button type="button" className="cz-voltar" onClick={() => setGrupoSel(null)} aria-label="Voltar">←</button>
                <span className="cz-avatar sm grupo">{iniciais(grupoSel.nome)}</span>
                <div className="cz-conv-nome">
                  <strong>{grupoSel.nome}</strong>
                  <span>{grupoSel.membros.length} {grupoSel.membros.length === 1 ? 'membro' : 'membros'} · lista de transmissão</span>
                </div>
                <button className="cz-btn perigo" onClick={() => excluirGrupo(grupoSel.id)}>🗑 Excluir</button>
              </div>

              <div className="cz-bolhas cz-grupo-corpo">
                <div className="cz-grupo-membros">
                  {grupoSel.membros.map((m) => (
                    <span key={m.id} className="cz-chip">{m.nome}</span>
                  ))}
                  {grupoSel.membros.length === 0 && <span className="cz-aviso">Grupo sem membros.</span>}
                </div>

                {resultadoGrupo && (
                  <div className="cz-resultado">
                    Disparo: {resultadoGrupo.enviados} enviadas · {resultadoGrupo.simulados} simuladas · {resultadoGrupo.falhas} falhas
                    {resultadoGrupo.semConsentimento > 0 && ` · ${resultadoGrupo.semConsentimento} sem consentimento`}
                  </div>
                )}

                <div className="cz-dia">Disparos do grupo</div>
                {grupoSel.disparos.map((d) => (
                  <div key={d.id} className="cz-bolha saida">
                    <div>{d.texto}</div>
                    <span className="cz-meta">{hora(d.createdAt)} · {d.status.toLowerCase()}</span>
                  </div>
                ))}
                {grupoSel.disparos.length === 0 && <div className="cz-aviso" style={{ margin: 'auto' }}>Nenhum disparo enviado ainda.</div>}
              </div>

              {erro && <div className="cz-alerta">{erro}</div>}
              <form className="cz-responder" onSubmit={dispararGrupo}>
                <input value={textoGrupo} onChange={(e) => setTextoGrupo(e.target.value)} placeholder="Mensagem para todos os membros…" />
                <button className="cz-enviar" disabled={enviando || !textoGrupo.trim()} aria-label="Disparar">{enviando ? '…' : '➤'}</button>
              </form>
            </>
          ) : !sel ? (
            <div className="cz-vazio">{filtro === 'GRUPOS' ? 'Selecione um grupo ou crie um novo.' : 'Selecione uma conversa.'}</div>
          ) : (
            <>
              <div className="cz-conv-top">
                <button type="button" className="cz-voltar" onClick={() => setSel(null)} aria-label="Voltar">←</button>
                <span className="cz-avatar sm">{iniciais(sel.cliente.nome)}</span>
                <div className="cz-conv-nome">
                  <strong>{sel.cliente.nome}</strong>
                  <span>{sel.cliente.telefone}</span>
                </div>
                <button className="cz-btn" onClick={() => navigate(`/vendas?cliente=${sel.cliente.id}`)}>🛒 Registrar venda</button>
              </div>

              <div className="cz-bolhas">
                {thread.map((m) => (
                  <div key={m.id} className={`cz-bolha ${m.direcao === 'ENVIADA' ? 'saida' : 'entrada'}`}>
                    {m.tipoMidia === 'AUDIO' && m.midiaUrl
                      ? <audio className="cz-audio" src={m.midiaUrl} controls preload="none" />
                      : <div>{m.texto}</div>}
                    <span className="cz-meta">{hora(m.createdAt)}{m.direcao === 'ENVIADA' ? ` · ${m.status.toLowerCase()}` : ''}</span>
                  </div>
                ))}
                {thread.length === 0 && <div style={{ color: 'var(--cz-mut)', margin: 'auto' }}>Sem mensagens.</div>}
              </div>

              {erro && <div className="cz-alerta">{erro}</div>}
              {gravando ? (
                <div className="cz-gravando">
                  <button type="button" className="cz-grav-lixo" onClick={cancelarGravacao} aria-label="Cancelar gravação">🗑</button>
                  <span className="cz-grav-rec"><span className="cz-grav-dot" />Gravando… {mmss(segGrav)}</span>
                  <button type="button" className="cz-enviar" onClick={enviarGravacao} disabled={enviando} aria-label="Enviar áudio">{enviando ? '…' : '➤'}</button>
                </div>
              ) : (
                <form className="cz-responder" onSubmit={responder}>
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite sua mensagem…" />
                  {texto.trim()
                    ? <button className="cz-enviar" disabled={enviando} aria-label="Enviar">{enviando ? '…' : '➤'}</button>
                    : <button type="button" className="cz-mic" onClick={iniciarGravacao} disabled={enviando} aria-label="Gravar áudio">🎤</button>}
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
        setClientes((data as Array<{ id: string; nome: string; telefone: string; segmento: string }>).map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone, segmento: c.segmento })))
      } catch (e) { setErro(mensagemDeErro(e)) }
    })()
  }, [escopo.params])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? clientes.filter((c) => c.nome.toLowerCase().includes(q) || c.telefone.includes(q)) : clientes
  }, [clientes, busca])

  function alternar(id: string) {
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function salvar() {
    if (!nome.trim()) { setErro('Dê um nome ao grupo.'); return }
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
          <strong>Novo grupo</strong>
          <button className="cz-modal-x" onClick={onFechar} aria-label="Fechar">×</button>
        </div>
        <input className="cz-busca" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do grupo (ex.: Clientes VIP)" autoFocus />
        <div className="cz-modal-sub">Membros <span className="cz-count">{sel.size}</span></div>
        <input className="cz-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" />
        <div className="cz-modal-clientes">
          {filtrados.map((c) => (
            <label key={c.id} className={`cz-cliente-op${sel.has(c.id) ? ' sel' : ''}`}>
              <input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} />
              <span className="cz-avatar sm">{iniciais(c.nome)}</span>
              <span className="cz-cliente-nome"><strong>{c.nome}</strong><span>{c.telefone}</span></span>
            </label>
          ))}
          {filtrados.length === 0 && <div className="cz-aviso">Nenhum cliente encontrado.</div>}
        </div>
        {erro && <div className="cz-alerta">{erro}</div>}
        <div className="cz-modal-acoes">
          <button className="cz-btn fantasma" onClick={onFechar}>Cancelar</button>
          <button className="cz-btn" disabled={salvando || !nome.trim()} onClick={salvar}>{salvando ? 'Criando…' : 'Criar grupo'}</button>
        </div>
      </div>
    </div>
  )
}

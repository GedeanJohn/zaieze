import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, mensagemDeErro } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface Conversa {
  cliente: { id: string; nome: string; telefone: string; segmento: string; vendedoraId: string | null }
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
  createdAt: string
}

function hora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Iniciais do nome para o avatar. */
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

type Filtro = 'TODAS' | 'NAO_LIDAS'

export default function CaixaEntrada() {
  const escopo = useLojaAtiva()
  const navigate = useNavigate()

  const [conversas, setConversas] = useState<Conversa[]>([])
  const [sel, setSel] = useState<Conversa | null>(null)
  const [thread, setThread] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('TODAS')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/whatsapp/conversas', { params: escopo.params })
    setConversas(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  const abrir = useCallback(async (c: Conversa) => {
    setSel(c); setErro(''); setTexto('')
    const { data } = await api.get(`/whatsapp/conversas/${c.cliente.id}`, { params: escopo.params })
    setThread(data)
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

  const totalNaoLidas = conversas.reduce((s, c) => s + (c.naoLidas > 0 ? 1 : 0), 0)
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return conversas.filter((c) => {
      if (filtro === 'NAO_LIDAS' && c.naoLidas === 0) return false
      if (!q) return true
      return c.cliente.nome.toLowerCase().includes(q) || c.cliente.telefone.includes(q)
    })
  }, [conversas, busca, filtro])

  return (
    <>
      <header>
        <h1>💬 Chat Zaieze</h1>
        <SeletorLoja escopo={escopo} />
      </header>

      <div className={`chatz${sel ? ' tem-sel' : ''}`}>
        {/* Lista de conversas */}
        <aside className="cz-lista">
          <div className="cz-lista-top">
            <div className="cz-titulo">Conversas <span className="cz-count">{conversas.length}</span></div>
            <input className="cz-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversas…" />
            <div className="cz-tabs">
              <button type="button" className={`cz-tab${filtro === 'TODAS' ? ' ativo' : ''}`} onClick={() => setFiltro('TODAS')}>Todas</button>
              <button type="button" className={`cz-tab${filtro === 'NAO_LIDAS' ? ' ativo' : ''}`} onClick={() => setFiltro('NAO_LIDAS')}>
                Não lidas{totalNaoLidas > 0 ? ` ${totalNaoLidas}` : ''}
              </button>
            </div>
          </div>
          <div className="cz-itens">
            {lista.map((c) => (
              <button key={c.cliente.id} className={`cz-item${sel?.cliente.id === c.cliente.id ? ' ativo' : ''}`} onClick={() => abrir(c)}>
                <span className="cz-avatar">{iniciais(c.cliente.nome)}</span>
                <span className="cz-item-main">
                  <span className="cz-item-top"><strong>{c.cliente.nome}</strong><span className="cz-hora">{hora(c.ultimaEm)}</span></span>
                  <span className="cz-previa">{c.ultimaDirecao === 'ENVIADA' ? '↩ ' : ''}{c.ultimaMensagem}</span>
                </span>
                {c.naoLidas > 0 && <span className="cz-badge">{c.naoLidas}</span>}
              </button>
            ))}
            {lista.length === 0 && <div style={{ color: 'var(--cz-mut)', padding: 14, fontSize: 13 }}>
              {conversas.length === 0 ? 'Nenhuma conversa ainda.' : 'Nada encontrado.'}
            </div>}
          </div>
        </aside>

        {/* Conversa */}
        <section className="cz-conversa">
          {!sel ? (
            <div className="cz-vazio">Selecione uma conversa.</div>
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
                    <div>{m.texto}</div>
                    <span className="cz-meta">{hora(m.createdAt)}{m.direcao === 'ENVIADA' ? ` · ${m.status.toLowerCase()}` : ''}</span>
                  </div>
                ))}
                {thread.length === 0 && <div style={{ color: 'var(--cz-mut)', margin: 'auto' }}>Sem mensagens.</div>}
              </div>

              {erro && <div className="cz-alerta">{erro}</div>}
              <form className="cz-responder" onSubmit={responder}>
                <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite sua mensagem…" />
                <button className="cz-enviar" disabled={enviando || !texto.trim()} aria-label="Enviar">{enviando ? '…' : '➤'}</button>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  )
}

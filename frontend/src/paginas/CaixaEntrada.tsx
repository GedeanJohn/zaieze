import { useCallback, useEffect, useState } from 'react'
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

export default function CaixaEntrada() {
  const escopo = useLojaAtiva()
  const navigate = useNavigate()

  const [conversas, setConversas] = useState<Conversa[]>([])
  const [sel, setSel] = useState<Conversa | null>(null)
  const [thread, setThread] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState('')
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

  return (
    <>
      <header>
        <h1>📥 Caixa de entrada</h1>
        <SeletorLoja escopo={escopo} />
      </header>

      <div className={`inbox${sel ? ' com-sel' : ''}`}>
        <div className="inbox-lista cartao">
          {conversas.map((c) => (
            <button key={c.cliente.id} className={`inbox-item ${sel?.cliente.id === c.cliente.id ? 'ativo' : ''}`} onClick={() => abrir(c)}>
              <div className="inbox-item-top">
                <strong>{c.cliente.nome}</strong>
                <span className="inbox-hora">{hora(c.ultimaEm)}</span>
              </div>
              <div className="inbox-previa">
                {c.ultimaDirecao === 'ENVIADA' ? '↩ ' : ''}{c.ultimaMensagem}
              </div>
              <div className="inbox-item-bottom">
                <span className={`selo ${c.cliente.segmento}`}>{c.cliente.segmento}</span>
                {c.naoLidas > 0 && <span className="inbox-badge">{c.naoLidas}</span>}
              </div>
            </button>
          ))}
          {conversas.length === 0 && <div style={{ color: 'var(--ink-soft)', padding: 12 }}>Nenhuma conversa ainda.</div>}
        </div>

        <div className="inbox-conversa cartao">
          {!sel ? (
            <div style={{ color: 'var(--ink-soft)', margin: 'auto' }}>Selecione uma conversa.</div>
          ) : (
            <>
              <div className="inbox-conversa-topo">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <button type="button" className="inbox-voltar" onClick={() => setSel(null)} aria-label="Voltar para a lista">←</button>
                  <div style={{ minWidth: 0 }}>
                    <strong>{sel.cliente.nome}</strong>
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{sel.cliente.telefone}</div>
                  </div>
                </div>
                <button className="btn" onClick={() => navigate(`/vendas?cliente=${sel.cliente.id}`)}>
                  🛒 Registrar venda online
                </button>
              </div>

              <div className="inbox-bolhas">
                {thread.map((m) => (
                  <div key={m.id} className={`bolha ${m.direcao === 'ENVIADA' ? 'saida' : 'entrada'}`}>
                    <div>{m.texto}</div>
                    <div className="bolha-meta">{hora(m.createdAt)}{m.direcao === 'ENVIADA' ? ` · ${m.status.toLowerCase()}` : ''}</div>
                  </div>
                ))}
                {thread.length === 0 && <div style={{ color: 'var(--ink-soft)' }}>Sem mensagens.</div>}
              </div>

              {erro && <div className="alerta">{erro}</div>}
              <form className="inbox-responder" onSubmit={responder}>
                <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma resposta…" />
                <button className="btn" disabled={enviando || !texto.trim()}>{enviando ? 'Enviando…' : 'Enviar'}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  )
}

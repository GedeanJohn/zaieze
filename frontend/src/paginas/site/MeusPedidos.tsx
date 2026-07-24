import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { api, formataReal, mensagemDeErro } from '../../api'
import { EtapasEntrega, type StatusEntrega } from '../../componentes/EtapasEntrega'

interface PedidoAberto {
  id: string; status: 'ENTROU' | 'ATENDIDO' | 'NEGOCIANDO'; createdAt: string
  pecas: number | null; subtotal: string | null
  statusOrcamento: 'RASCUNHO' | 'AGUARDANDO_APROVACAO_DESCONTO' | 'ENVIADO' | 'ALTERACAO_SOLICITADA' | 'CONVERTIDO' | 'CANCELADO' | null
  tokenOrcamento: string | null
}
interface PedidoFechado {
  id: string; tokenPublico: string; createdAt: string; total: string
  statusEntrega: StatusEntrega; pecas: number
}

const CHAVE_TELEFONE = 'zz_meu_telefone'
const CHAVE_SESSAO = 'zz_pedido_sessao'
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function textoAberto(p: PedidoAberto): string {
  if (p.status === 'ENTROU') return 'Recebemos seu pedido — aguardando atendimento.'
  if (p.status === 'ATENDIDO') return 'Sua vendedora já está com seu pedido.'
  if (p.statusOrcamento === 'ENVIADO') return 'Orçamento enviado — aguardando sua aprovação.'
  if (p.statusOrcamento === 'ALTERACAO_SOLICITADA') return 'Você pediu alterações — aguardando resposta da vendedora.'
  return 'Sua vendedora está preparando seu orçamento.'
}

/** Sessão verificada (telefone + token) — em localStorage se "lembrar neste aparelho" foi
 *  marcado (sobrevive a fechar o navegador), senão em sessionStorage (só durante esta aba). */
function lerSessaoSalva(): { telefone: string; token: string } | null {
  const raw = localStorage.getItem(CHAVE_SESSAO) ?? sessionStorage.getItem(CHAVE_SESSAO)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}
function salvarSessao(telefone: string, token: string, lembrar: boolean) {
  const raw = JSON.stringify({ telefone, token })
  if (lembrar) localStorage.setItem(CHAVE_SESSAO, raw)
  else sessionStorage.setItem(CHAVE_SESSAO, raw)
}
function limparSessao() {
  localStorage.removeItem(CHAVE_SESSAO)
  sessionStorage.removeItem(CHAVE_SESSAO)
}

type Etapa = 'telefone' | 'codigo' | 'resultados'

/** "Ver Carrinho" (pedidos em aberto) e "Ver Pedidos" (fechados, com etapas de entrega) do perfil
 *  público da vendedora. Sem login: confirma o dono do WhatsApp com um código de 6 dígitos
 *  enviado pela própria ZAIEZE (mesmo canal do "esqueci minha senha") antes de mostrar qualquer
 *  pedido — sem isso, bastava digitar qualquer número pra ver os pedidos dele. */
export default function MeusPedidos({ redeSlug, vendSlug, abaInicial, acento, onClose }: {
  redeSlug: string; vendSlug: string; abaInicial: 'abertos' | 'fechados'; acento: string; onClose: () => void
}) {
  const navigate = useNavigate()
  const [etapa, setEtapa] = useState<Etapa>('telefone')
  const [telefone, setTelefone] = useState(() => localStorage.getItem(CHAVE_TELEFONE) ?? '')
  const [codigo, setCodigo] = useState('')
  const [aceiteTermo, setAceiteTermo] = useState(false)
  const [lembrar, setLembrar] = useState(true)
  const [termoAberto, setTermoAberto] = useState(false)
  const [termoTexto, setTermoTexto] = useState('')
  const [enviandoCodigo, setEnviandoCodigo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState<'abertos' | 'fechados'>(abaInicial)
  const [abertos, setAbertos] = useState<PedidoAberto[]>([])
  const [fechados, setFechados] = useState<PedidoFechado[]>([])

  async function buscarComToken(token: string) {
    try {
      const { data } = await api.post(`/catalogo/publico/${redeSlug}/${vendSlug}/meus-pedidos`, { token })
      setAbertos(data.abertos); setFechados(data.fechados)
      setEtapa('resultados')
      return true
    } catch {
      limparSessao()
      return false
    }
  }

  // Já verificou antes neste aparelho (ou nesta aba)? Pula direto pros resultados.
  useEffect(() => {
    const sessao = lerSessaoSalva()
    if (!sessao) { setCarregando(false); return }
    setTelefone(sessao.telefone)
    buscarComToken(sessao.token).finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function abrirTermo() {
    setTermoAberto(true)
    if (termoTexto) return
    try {
      const { data } = await api.get('/catalogo/publico/termo-cliente')
      setTermoTexto(data.texto)
    } catch {
      setTermoTexto('Não deu pra carregar o termo agora. Tente de novo em alguns instantes.')
    }
  }

  async function enviarCodigo() {
    if (telefone.trim().length < 8) { setErro('Informe um WhatsApp válido.'); return }
    if (!aceiteTermo) { setErro('É preciso aceitar o termo pra continuar.'); return }
    setEnviandoCodigo(true); setErro('')
    try {
      await api.post(`/catalogo/publico/${redeSlug}/${vendSlug}/verificar-telefone/enviar`, { telefone })
      localStorage.setItem(CHAVE_TELEFONE, telefone)
      setEtapa('codigo')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviandoCodigo(false)
    }
  }

  async function confirmarCodigo() {
    if (codigo.trim().length !== 6) { setErro('Digite o código de 6 dígitos.'); return }
    setConfirmando(true); setErro('')
    try {
      const { data } = await api.post(`/catalogo/publico/${redeSlug}/${vendSlug}/verificar-telefone/confirmar`, {
        telefone, codigo: codigo.trim(), aceiteTermo: true,
      })
      salvarSessao(telefone, data.token, lembrar)
      const ok = await buscarComToken(data.token)
      if (!ok) setErro('Verificado, mas não deu pra carregar os pedidos agora. Tente de novo.')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setConfirmando(false)
    }
  }

  function trocarNumero() {
    setEtapa('telefone'); setCodigo(''); setErro('')
  }

  function abrirPedido(tokenPublico: string) {
    navigate(`/pedido/publico/${tokenPublico}`)
  }
  function abrirOrcamento(token: string) {
    navigate(`/orcamento/publico/${token}`)
  }

  return (
    <div className="pv-modal-fundo" onClick={onClose}>
      <div className="pv-modal" style={{ width: 'min(480px, 100%)', textAlign: 'left' }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pv-modal-fechar" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        <h3 className="pv-modal-nome" style={{ textAlign: 'center' }}>Meus pedidos</h3>

        {carregando ? (
          <p className="pv-modal-vazio">Carregando…</p>
        ) : etapa === 'telefone' ? (
          <>
            <p className="pv-modal-vazio" style={{ textAlign: 'left', marginBottom: 12 }}>Informe o WhatsApp que você usou pra comprar — vamos mandar um código de confirmação por lá.</p>
            <input className="pv-avaliacao-input" placeholder="Seu WhatsApp (com DDD)" value={telefone}
              onChange={(e) => setTelefone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviarCodigo()} />
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#d8d3ca', margin: '10px 0' }}>
              <input type="checkbox" checked={aceiteTermo} onChange={(e) => setAceiteTermo(e.target.checked)} style={{ marginTop: 2 }} />
              <span>Li e aceito <button type="button" className="pv-avaliar-link" style={{ fontSize: 12 }} onClick={abrirTermo}>o termo de responsabilidade</button>.</span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#d8d3ca', marginBottom: 14 }}>
              <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} />
              Lembrar neste aparelho
            </label>
            {erro && <p className="pv-modal-vazio" style={{ color: '#e5484d' }}>{erro}</p>}
            <button type="button" className="pv-modal-enviar" disabled={enviandoCodigo} onClick={enviarCodigo}>
              {enviandoCodigo ? 'Enviando…' : 'Enviar código por WhatsApp'}
            </button>
          </>
        ) : etapa === 'codigo' ? (
          <>
            <p className="pv-modal-vazio" style={{ textAlign: 'left', marginBottom: 12 }}>Enviamos um código de 6 dígitos pro WhatsApp <strong>{telefone}</strong>.</p>
            <input className="pv-avaliacao-input" placeholder="000000" maxLength={6} inputMode="numeric" value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && confirmarCodigo()} />
            {erro && <p className="pv-modal-vazio" style={{ color: '#e5484d' }}>{erro}</p>}
            <button type="button" className="pv-modal-enviar" disabled={confirmando} onClick={confirmarCodigo}>
              {confirmando ? 'Confirmando…' : 'Confirmar código'}
            </button>
            <button type="button" className="pv-avaliar-link" style={{ marginTop: 10 }} onClick={trocarNumero}>Trocar número / reenviar código</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button type="button" className={`pv-tab${aba === 'abertos' ? ' ativa' : ''}`} style={aba === 'abertos' ? { borderColor: acento, color: acento } : undefined} onClick={() => setAba('abertos')}>
                Em aberto {abertos.length > 0 && `(${abertos.length})`}
              </button>
              <button type="button" className={`pv-tab${aba === 'fechados' ? ' ativa' : ''}`} style={aba === 'fechados' ? { borderColor: acento, color: acento } : undefined} onClick={() => setAba('fechados')}>
                Fechados {fechados.length > 0 && `(${fechados.length})`}
              </button>
            </div>

            {aba === 'abertos' && (
              abertos.length === 0
                ? <p className="pv-modal-vazio">Nenhum pedido em aberto no momento.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {abertos.map((p) => (
                      <div key={p.id} className="pv-pedidoItem">
                        <div style={{ fontSize: 12, color: '#9a9a9a' }}>{dataBR(p.createdAt)}</div>
                        <div style={{ fontSize: 14, margin: '4px 0' }}>{textoAberto(p)}</div>
                        {p.pecas != null && p.subtotal != null && (
                          <div style={{ fontSize: 12, color: '#c9c4ba' }}>{p.pecas} peça(s) · {formataReal(Number(p.subtotal))}</div>
                        )}
                        {p.tokenOrcamento && p.statusOrcamento === 'ENVIADO' && (
                          <button type="button" className="pv-modal-enviar" style={{ marginTop: 8, background: acento }} onClick={() => abrirOrcamento(p.tokenOrcamento!)}>
                            Ver orçamento
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
            )}

            {aba === 'fechados' && (
              fechados.length === 0
                ? <p className="pv-modal-vazio">Nenhum pedido fechado ainda.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {fechados.map((p) => (
                      <div key={p.id} className="pv-pedidoItem">
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span>Pedido {p.id.slice(-6).toUpperCase()} · {dataBR(p.createdAt)}</span>
                          <strong>{formataReal(Number(p.total))}</strong>
                        </div>
                        <div style={{ margin: '10px 0' }}><EtapasEntrega atual={p.statusEntrega} cor={acento} /></div>
                        <button type="button" className="pv-avaliar-link" onClick={() => abrirPedido(p.tokenPublico)}>Ver comprovante completo</button>
                      </div>
                    ))}
                  </div>
                )
            )}
          </>
        )}
      </div>

      {termoAberto && (
        <div className="pv-modal-fundo" onClick={() => setTermoAberto(false)}>
          <div className="pv-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pv-modal-fechar" onClick={() => setTermoAberto(false)} aria-label="Fechar"><X size={18} /></button>
            <h3 className="pv-modal-nome">Termo de responsabilidade</h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#d8d3ca', textAlign: 'left' }}>{termoTexto || 'Carregando…'}</p>
            <button type="button" className="pv-modal-enviar" onClick={() => setTermoAberto(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { api } from '../../api'
import type { ItemPedido } from './Catalogo'

/**
 * Agente 2 — "Vendedora Online" (atende o comprador no catálogo da loja).
 * Roteirizado (sem LLM): qualifica (varejo/atacado, o que procura, tamanho), captura contato
 * e faz HANDOFF para a vendedora dona — cria o lead e abre o WhatsApp dela com um resumo.
 */

interface Props {
  redeSlug: string
  vendSlug: string
  marcaNome: string
  vendedora: string // primeiro nome
  pedidoMinimoAtacado?: number
  produtoId?: string
  produtoNome?: string
  resumoInicial?: string // pedido já montado no carrinho — pula a qualificação e vai direto ao contato
  itensCarrinho?: ItemPedido[] // snapshot do carrinho — vai junto no /lead pra vendedora ver formatado no Funil
  onClose: () => void
}

type Msg = { de: 'bot' | 'user'; texto: string }
type R = Record<string, string>

export default function AgenteLoja({ redeSlug, vendSlug, marcaNome, vendedora, pedidoMinimoAtacado, produtoId, produtoNome, resumoInicial, itensCarrinho, onClose }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [passo, setPasso] = useState('boasvindas')
  const [resp, setResp] = useState<R>({})
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  function montar(id: string, r: R): { modo: 'botoes' | 'input' | 'fim'; campo?: string; msgs: string[]; placeholder?: string; opcoes?: { texto: string; vai: string }[] } {
    switch (id) {
      case 'boasvindas':
        return {
          modo: 'botoes',
          msgs: [
            `Oi! 👋 Bem-vindo(a) à ${marcaNome}.`,
            `Sou a assistente da ${vendedora} e te ajudo a achar a peça certa.${produtoNome ? ` Vi que você curtiu a ${produtoNome}. 😍` : ''}`,
            'Quer uma ajudinha rápida?',
          ],
          opcoes: [{ texto: 'Sim, quero ajuda', vai: 'perfil' }, { texto: `Falar direto com a ${vendedora}`, vai: 'handoff' }],
        }
      case 'perfil':
        return { modo: 'botoes', campo: 'perfil', msgs: ['Você está comprando para uso próprio ou para revender?'], opcoes: [{ texto: 'Para mim (varejo)', vai: 'procura' }, { texto: 'Para revender (atacado)', vai: 'procura' }] }
      case 'procura': {
        const m: string[] = []
        if (r.perfil === 'Para revender (atacado)') m.push(`Perfeito! No atacado o pedido mínimo é de ${pedidoMinimoAtacado ?? 6} peças, com preço especial. 😉`)
        m.push('O que você está procurando hoje? (ex.: vestido de festa, conjunto fitness, blusa…)')
        return { modo: 'input', campo: 'procura', msgs: m, placeholder: 'Descreva o que procura' }
      }
      case 'pedido':
        return { modo: 'input', campo: 'nome', msgs: [`Vi o seu pedido! 🛒 Vou passar pra ${vendedora} confirmar os itens e fechar com você. Como é o seu nome?`], placeholder: 'Seu nome' }
      case 'tamanho':
        return { modo: 'input', campo: 'tamanho', msgs: ['Qual tamanho você costuma usar? (se não souber, escreva "não sei")'], placeholder: 'Ex.: M, 40, G…' }
      case 'nome':
        return { modo: 'input', campo: 'nome', msgs: ['Show! Como é o seu nome?'], placeholder: 'Seu nome' }
      case 'telefone':
        return { modo: 'input', campo: 'telefone', msgs: ['E o seu WhatsApp com DDD? Assim a vendedora já te chama por lá.'], placeholder: '(62) 99999-9999' }
      default:
        return { modo: 'fim', msgs: [] }
    }
  }

  const proximo: Record<string, string> = { pedido: 'telefone', procura: 'tamanho', tamanho: 'nome', nome: 'telefone', telefone: 'fim' }

  function montarResumo(r: R): string {
    // Pedido montado no carrinho: usa o resumo do pedido + o contato.
    if (resumoInicial) return `${resumoInicial}\n\n— ${r.nome ? r.nome : 'Cliente'}`
    const perfil = r.perfil === 'Para revender (atacado)' ? 'Quero comprar no ATACADO' : 'Compra para mim (varejo)'
    return [
      `Oi ${vendedora}! Sou ${r.nome ?? ''}.`,
      `${perfil}.`,
      r.procura ? `Procuro: ${r.procura}.` : '',
      r.tamanho && r.tamanho.toLowerCase() !== 'não sei' ? `Tamanho: ${r.tamanho}.` : '',
      produtoNome ? `Me interessei pela peça: ${produtoNome}.` : '',
    ].filter(Boolean).join(' ')
  }

  async function finalizar(r: R) {
    setEnviando(true)
    setMsgs((m) => [...m, { de: 'bot', texto: `Perfeito, ${r.nome ?? ''}! Vou te conectar com a ${vendedora} para finalizar seu pedido 💛` }])
    try {
      const { data } = await api.post(`/catalogo/publico/${redeSlug}/${vendSlug}/lead`, {
        nome: r.nome || undefined, telefone: r.telefone || undefined, produtoId, resumo: montarResumo(r),
        itens: itensCarrinho,
      })
      if (data.whatsappUrl) { window.location.href = data.whatsappUrl; return }
      setMsgs((m) => [...m, { de: 'bot', texto: 'Recebemos seu contato! A vendedora vai te chamar em breve. 💛' }])
    } catch {
      setMsgs((m) => [...m, { de: 'bot', texto: 'Tive um probleminha pra abrir o WhatsApp. Tente novamente em instantes.' }])
    } finally { setEnviando(false); setPasso('finalizado') }
  }

  function irPara(id: string, r: R) {
    if (id === 'handoff') { void finalizar(r); return }
    if (id === 'fim') { void finalizar(r); return }
    const p = montar(id, r)
    setMsgs((m) => [...m, ...p.msgs.map((t) => ({ de: 'bot' as const, texto: t }))])
    setPasso(id)
  }

  useEffect(() => { irPara(resumoInicial ? 'pedido' : 'boasvindas', {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const p = montar(passo, resp)

  function escolher(opTexto: string, vai: string, campo?: string) {
    const r = campo ? { ...resp, [campo]: opTexto } : resp
    if (campo) setResp(r)
    setMsgs((m) => [...m, { de: 'user', texto: opTexto }])
    irPara(vai, r)
  }

  function enviarTexto() {
    const val = texto.trim()
    if (!val || p.modo !== 'input' || !p.campo) return
    const r = { ...resp, [p.campo]: val }
    setResp(r)
    setMsgs((m) => [...m, { de: 'user', texto: val }])
    setTexto('')
    irPara(proximo[passo] ?? 'fim', r)
  }

  return (
    <div className="ag-fundo" onClick={onClose}>
      <div className="ag-painel" onClick={(e) => e.stopPropagation()}>
        <div className="ag-topo">
          <div><strong>{marcaNome}</strong> · atendimento</div>
          <button className="ag-fechar" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="ag-corpo">
          {msgs.map((m, i) => <div key={i} className={`ag-bolha ${m.de}`}>{m.texto}</div>)}
          <div ref={fimRef} />
        </div>
        <div className="ag-acoes">
          {passo === 'finalizado' ? (
            <div style={{ fontSize: 13, color: '#999', textAlign: 'center' }}>{enviando ? 'Abrindo o WhatsApp…' : 'Atendimento encaminhado 💛'}</div>
          ) : p.modo === 'botoes' ? (
            <div className="ag-botoes">
              {p.opcoes!.map((o) => <button key={o.texto} className="ag-opcao" onClick={() => escolher(o.texto, o.vai, p.campo)}>{o.texto}</button>)}
            </div>
          ) : p.modo === 'input' ? (
            <form className="ag-input" onSubmit={(e) => { e.preventDefault(); enviarTexto() }}>
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={p.placeholder} autoFocus disabled={enviando} />
              <button type="submit" disabled={enviando}>Enviar</button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}

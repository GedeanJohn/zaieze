import { useEffect, useRef, useState } from 'react'

/**
 * Agente 1 — "Vendedor de planos" da ZAIEZE (chat guiado na landing).
 * Fluxo ROTEIRIZADO (sem LLM): qualifica o lead pelas etapas, calcula o score
 * (Quente/Morno/Frio) e faz handoff pro WhatsApp comercial com um RESUMO.
 */

const WHATSAPP_COMERCIAL = '5562982196505'

const OPCOES = {
  segmento: ['Moda Feminina', 'Moda Masculina', 'Moda Infantil', 'Fitness', 'Plus Size', 'Moda Praia', 'Atacado', 'Varejo', 'Outro'],
  tamanho: ['Apenas eu', '2 a 5 vendedores', '6 a 15 vendedores', 'Mais de 15 vendedores'],
  volume: ['Até 100', '100 a 500', '500 a 2.000', 'Mais de 2.000'],
  dor: ['Perco clientes sem resposta', 'Minha equipe esquece follow-up', 'Não sei qual vendedor vende mais', 'Clientes compram uma vez e somem', 'Tenho estoque parado', 'Todas as opções acima'],
}

type Mensagem = { de: 'bot' | 'user'; texto: string }
type Respostas = Record<string, string>
type Passo =
  | { modo: 'botoes'; campo?: string; msgs: string[]; opcoes: { texto: string; vai: string }[] }
  | { modo: 'input'; campo: string; msgs: string[]; placeholder: string; vai: string }
  | { modo: 'fim'; msgs: string[] }

// Detecta intenção de compra em texto livre → transfere direto pro humano.
const REGEX_COMPRA = /contrat|valor|pre[çc]|quanto custa|implanta|demonstra|or[çc]amento|assinar|testar|plano/i

function classificar(r: Respostas): 'QUENTE' | 'MORNO' | 'FRIO' {
  const temEquipe = r.tamanho && r.tamanho !== 'Apenas eu'
  const volumeOk = ['100 a 500', '500 a 2.000', 'Mais de 2.000'].includes(r.volume ?? '')
  const dorOk = ['Minha equipe esquece follow-up', 'Clientes compram uma vez e somem', 'Todas as opções acima'].includes(r.dor ?? '')
  if (temEquipe && volumeOk && dorOk) return 'QUENTE'
  if (temEquipe || volumeOk) return 'MORNO'
  return 'FRIO'
}

function resumoWhatsapp(r: Respostas, score: string): string {
  const selo = score === 'QUENTE' ? '🔥 LEAD QUENTE' : score === 'MORNO' ? '🟡 LEAD MORNO' : '🔵 LEAD FRIO'
  return [
    `${selo} — novo contato pelo site ZAIEZE`,
    `Nome: ${r.nome ?? '—'}`,
    `Empresa/marca: ${r.empresa ?? '—'}`,
    `Segmento: ${r.segmento ?? '—'}`,
    `Vendedores: ${r.tamanho ?? '—'}`,
    `Atendimentos/mês: ${r.volume ?? '—'}`,
    `Principal dor: ${r.dor ?? '—'}`,
    r.impacto ? `Impacto desejado: ${r.impacto}` : '',
    `Cidade: ${r.cidade ?? '—'}`,
    `Telefone: ${r.telefone ?? '—'}`,
    `E-mail: ${r.email ?? '—'}`,
  ].filter(Boolean).join('\n')
}

function abrirWhatsapp(r: Respostas, score: string) {
  window.open(`https://wa.me/${WHATSAPP_COMERCIAL}?text=${encodeURIComponent(resumoWhatsapp(r, score))}`, '_blank')
}

export default function AgenteZaieze({ onClose }: { onClose: () => void }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [passoId, setPassoId] = useState('boasvindas')
  const [respostas, setRespostas] = useState<Respostas>({})
  const [texto, setTexto] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)

  // Constrói cada passo (com texto dinâmico a partir das respostas já dadas).
  function montarPasso(id: string, r: Respostas): Passo {
    const nome = r.nome?.split(/\s+/)[0] ?? ''
    switch (id) {
      case 'boasvindas':
        return {
          modo: 'botoes',
          msgs: ['Olá 👋 Seja bem-vindo à Zaieze.', 'Ajudamos lojas e marcas de moda a vender mais pelo WhatsApp com IA, carteira por vendedora e recuperação automática de clientes.', 'Posso fazer 3 perguntas rápidas para entender sua operação?'],
          opcoes: [{ texto: 'Sim, pode perguntar', vai: 'nome' }, { texto: 'Quero falar com um especialista', vai: 'transferir' }],
        }
      case 'nome':
        return { modo: 'input', campo: 'nome', msgs: ['Qual é o seu nome?'], placeholder: 'Seu nome', vai: 'empresa' }
      case 'empresa':
        return { modo: 'input', campo: 'empresa', msgs: [`Muito prazer, ${nome} 😊`, 'Qual o nome da sua empresa ou marca?'], placeholder: 'Nome da empresa/marca', vai: 'segmento' }
      case 'segmento':
        return { modo: 'botoes', campo: 'segmento', msgs: ['Hoje você trabalha com:'], opcoes: OPCOES.segmento.map((o) => ({ texto: o, vai: 'tamanho' })) }
      case 'tamanho':
        return { modo: 'botoes', campo: 'tamanho', msgs: ['Quantas pessoas vendem hoje na sua empresa?'], opcoes: OPCOES.tamanho.map((o) => ({ texto: o, vai: 'volume' })) }
      case 'volume':
        return { modo: 'botoes', campo: 'volume', msgs: ['Em média, quantos clientes entram em contato pelo WhatsApp por mês?'], opcoes: OPCOES.volume.map((o) => ({ texto: o, vai: 'dor' })) }
      case 'dor':
        return { modo: 'botoes', campo: 'dor', msgs: ['Qual destas situações mais acontece hoje?'], opcoes: OPCOES.dor.map((o) => ({ texto: o, vai: 'gatilho' })) }
      case 'gatilho': {
        const msgs: string[] = []
        if (r.dor === 'Perco clientes sem resposta') msgs.push('Entendi. Essa é uma das maiores causas de perda de vendas na moda — o cliente chama fora do horário, não tem retorno e compra do concorrente. A Zaieze mantém atendimento ativo 24h.')
        if (r.dor === 'Clientes compram uma vez e somem') msgs.push('Esse é um problema muito comum: a maioria das lojas investe para conquistar, mas não tem recuperação automática. A Zaieze identifica inativos e cria ações de reativação automáticas.')
        msgs.push('Com base no que você me contou, a Zaieze pode ajudar a:\n✅ Organizar clientes por vendedor\n✅ Recuperar clientes que pararam de comprar\n✅ Automatizar atendimentos no WhatsApp\n✅ Acompanhar o desempenho da equipe\n✅ Girar estoque parado\n✅ Centralizar tudo num painel')
        msgs.push('Se sua equipe pudesse recuperar só 5 clientes perdidos por semana, qual impacto isso teria no seu faturamento?')
        return { modo: 'input', campo: 'impacto', msgs, placeholder: 'Pode escrever livremente…', vai: 'cidade' }
      }
      case 'cidade':
        return { modo: 'input', campo: 'cidade', msgs: ['Faz bastante sentido pra sua operação! Para eu te direcionar ao especialista certo, me informe alguns dados.', '📍 Qual a sua cidade?'], placeholder: 'Cidade', vai: 'telefone' }
      case 'telefone':
        return { modo: 'input', campo: 'telefone', msgs: ['📱 Melhor telefone (com DDD)?'], placeholder: '(62) 99999-9999', vai: 'email' }
      case 'email':
        return { modo: 'input', campo: 'email', msgs: ['📧 E o seu melhor e-mail?'], placeholder: 'voce@empresa.com', vai: 'fim' }
      default:
        return { modo: 'fim', msgs: [] }
    }
  }

  // Empurra as mensagens do bot do passo e ajusta o estado.
  function irPara(id: string, rAtual: Respostas) {
    if (id === 'transferir') {
      const nome = rAtual.nome?.split(/\s+/)[0] ?? ''
      const score = classificar(rAtual)
      setMensagens((m) => [...m, { de: 'bot', texto: `${nome ? `Excelente, ${nome}. ` : ''}Vou te conectar agora com um especialista da Zaieze para apresentar os planos e montar uma proposta pra sua operação. 🚀` }])
      setPassoId('finalizado')
      abrirWhatsapp(rAtual, score)
      return
    }
    if (id === 'fim') {
      const score = classificar(rAtual)
      const msgFinal = score === 'QUENTE'
        ? 'Perfeito! Pelo seu perfil, vou te conectar agora com um especialista da Zaieze para uma demonstração personalizada. 🚀'
        : score === 'MORNO'
          ? 'Show! Enquanto um especialista analisa sua operação, vou te levar ao WhatsApp para uma demonstração rápida da plataforma. 😉'
          : 'Obrigado! Vou te levar ao nosso WhatsApp com conteúdos de como vender mais e recuperar clientes automaticamente. 💬'
      setMensagens((m) => [...m, { de: 'bot', texto: msgFinal }])
      setPassoId('finalizado')
      abrirWhatsapp(rAtual, score)
      return
    }
    const p = montarPasso(id, rAtual)
    setMensagens((m) => [...m, ...p.msgs.map((t) => ({ de: 'bot' as const, texto: t }))])
    setPassoId(id)
  }

  // Inicia a conversa ao abrir.
  useEffect(() => { irPara('boasvindas', {}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens])

  const passo = montarPasso(passoId, respostas)

  function escolher(opcaoTexto: string, vai: string, campo?: string) {
    const r = campo ? { ...respostas, [campo]: opcaoTexto } : respostas
    if (campo) setRespostas(r)
    setMensagens((m) => [...m, { de: 'user', texto: opcaoTexto }])
    irPara(vai, r)
  }

  function enviarTexto() {
    const val = texto.trim()
    if (!val || passo.modo !== 'input') return
    const r = { ...respostas, [passo.campo]: val }
    setRespostas(r)
    setMensagens((m) => [...m, { de: 'user', texto: val }])
    setTexto('')
    // Intenção de compra a qualquer momento → transfere
    if (REGEX_COMPRA.test(val)) { irPara('transferir', r); return }
    irPara(passo.vai, r)
  }

  return (
    <div className="ag-fundo" onClick={onClose}>
      <div className="ag-painel" onClick={(e) => e.stopPropagation()}>
        <div className="ag-topo">
          <div><strong>ZAIEZE</strong> · atendimento</div>
          <button className="ag-fechar" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className="ag-corpo">
          {mensagens.map((m, i) => (
            <div key={i} className={`ag-bolha ${m.de}`}>{m.texto.split('\n').map((l, j) => <div key={j}>{l}</div>)}</div>
          ))}
          <div ref={fimRef} />
        </div>

        <div className="ag-acoes">
          {passoId === 'finalizado' ? (
            <button className="ag-zap" onClick={() => abrirWhatsapp(respostas, classificar(respostas))}>📲 Abrir o WhatsApp</button>
          ) : passo.modo === 'botoes' ? (
            <div className="ag-botoes">
              {passo.opcoes.map((o) => (
                <button key={o.texto} className="ag-opcao" onClick={() => escolher(o.texto, o.vai, passo.campo)}>{o.texto}</button>
              ))}
            </div>
          ) : passo.modo === 'input' ? (
            <form className="ag-input" onSubmit={(e) => { e.preventDefault(); enviarTexto() }}>
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={passo.placeholder} autoFocus />
              <button type="submit">Enviar</button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}

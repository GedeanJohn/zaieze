import { env } from '../../env'
import { temAssentoVendedoraPagante } from '../vendedora-billing/assinatura-vendedora-rede.service'

// Modelo de IA: Haiku 4.5 (claude-haiku-4-5), via API oficial da Anthropic
// (créditos comprados direto na Anthropic — NÃO usamos AWS Bedrock).
// $1/$5 por 1M tokens (in/out), contexto 200K. Trocar aqui se mudar de modelo.
const MODELO_IA = 'claude-haiku-4-5'

// Mensagens-modelo por segmento (fallback quando não há ANTHROPIC_API_KEY)
const FALLBACK: Record<string, string> = {
  VIP: 'Oi {primeiroNome}! 💎 Como cliente VIP da {loja}, separei novidades exclusivas pensando em você. Posso te mostrar? — {vendedora}',
  FREQUENTE: 'Oi {primeiroNome}! 😊 Chegaram peças novas na {loja} com a sua cara. Quer dar uma espiada? — {vendedora}',
  INATIVO: 'Oi {primeiroNome}, que saudade! 🧡 Faz {diasSemCompra} dias desde sua última visita à {loja} — tenho novidades e um mimo especial pra você. — {vendedora}',
  NOVO: 'Oi {primeiroNome}! 👗 Que bom ter você na {loja}. Quer que eu te avise das novidades em primeira mão? — {vendedora}',
  ATACADO: 'Oi {primeiroNome}! 📦 Novidades no atacado da {loja} com condições especiais. Quer receber o catálogo? — {vendedora}',
  GERAL: 'Oi {primeiroNome}! Acabaram de chegar novidades na {loja} 😍 Quer dar uma olhada? — {vendedora}',
}

/**
 * Provador virtual / montador de looks (módulo 13): sugere uma combinação a partir
 * da peça base e dos complementos. Usa Claude quando há chave; senão, texto-modelo.
 */
export async function sugerirLook(base: string, complementos: string[]): Promise<{ texto: string; viaIa: boolean }> {
  const lista = complementos.join(', ')
  const fallback = complementos.length
    ? `Que produção! ✨ A ${base} fica perfeita combinada com ${lista}. Finalize com um acessório que valorize o seu estilo e arrase!`
    : `A ${base} é a estrela do look — aposte em acessórios que combinem com o seu estilo! ✨`
  if (!env.ANTHROPIC_API_KEY) return { texto: fallback, viaIa: false }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: MODELO_IA,
      max_tokens: 400,
      system: 'Você é um(a) consultor(a) de moda. Monte um look combinando a peça base com os complementos informados, em português do Brasil, 2 a 3 frases, tom animado, 1 emoji. Responda só a sugestão.',
      messages: [{ role: 'user', content: `Peça base: ${base}. Complementos disponíveis: ${lista || 'nenhum'}. Monte o look.` }],
    })
    let texto = ''
    for (const b of resp.content) if (b.type === 'text') texto += b.text
    texto = texto.trim()
    return { texto: texto || fallback, viaIa: true }
  } catch {
    return { texto: fallback, viaIa: false }
  }
}

/**
 * Sugere uma mensagem de campanha. Usa Claude (Haiku 4.5) quando há ANTHROPIC_API_KEY E a rede
 * tem pelo menos 1 cadeira de vendedora paga ativa (sem add-on próprio, então só libera pra quem
 * já é assinante — ver temAssentoVendedoraPagante); caso contrário, mensagem-modelo do segmento.
 */
export async function sugerirMensagem(opts: { redeId: string; segmento?: string | null; contexto?: string }): Promise<{ texto: string; viaIa: boolean }> {
  const seg = opts.segmento ?? 'GERAL'
  const fallback = FALLBACK[seg] ?? FALLBACK.GERAL
  if (!env.ANTHROPIC_API_KEY) return { texto: fallback, viaIa: false }
  if (!(await temAssentoVendedoraPagante(opts.redeId))) return { texto: fallback, viaIa: false }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: MODELO_IA,
      max_tokens: 400,
      system:
        'Você escreve mensagens curtas e calorosas de WhatsApp para clientes de uma loja de moda, em português do Brasil. ' +
        'Use EXATAMENTE estes placeholders entre chaves quando fizer sentido: {primeiroNome}, {loja}, {vendedora}, {diasSemCompra}, {totalGasto}, {link}. ' +
        'O {link} é o link do catálogo da vendedora — inclua um convite curto para ver o catálogo com {link} quando combinar. ' +
        'No máximo 2 frases e 1 emoji, tom de vendedora próxima e gentil. Responda apenas com a mensagem, sem aspas nem explicações.',
      messages: [
        {
          role: 'user',
          content: `Crie a mensagem de campanha para o segmento de cliente "${seg}".${opts.contexto ? ' Contexto adicional: ' + opts.contexto : ''}`,
        },
      ],
    })
    let texto = ''
    for (const b of resp.content) if (b.type === 'text') texto += b.text
    texto = texto.trim()
    return { texto: texto || fallback, viaIa: true }
  } catch {
    return { texto: fallback, viaIa: false }
  }
}

/**
 * Radar de Oportunidades (add-on): explica por que um produto parado × carteira de clientes é
 * uma boa oportunidade. Incluído na mensalidade do add-on (Haiku é barato/previsível) — não
 * consome crédito de IA Captador, diferente da prospecção de empresas novas (Google Places).
 */
export async function explicarOportunidade(opts: {
  produto: string
  categoria: string | null
  diasParado: number
  valorParado: number
  clientesAlvo: number
}): Promise<{ texto: string; viaIa: boolean }> {
  const fallback = `${opts.produto} está parado há ${opts.diasParado} dias (R$ ${opts.valorParado.toFixed(2)} em estoque) e ${opts.clientesAlvo} cliente(s) da carteira já compraram ${opts.categoria ? `a categoria ${opts.categoria}` : 'produtos parecidos'} — boa chance de recompra.`
  if (!env.ANTHROPIC_API_KEY) return { texto: fallback, viaIa: false }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const resp = await client.messages.create({
      model: MODELO_IA,
      max_tokens: 200,
      system:
        'Você é um(a) consultor(a) comercial de uma loja de moda. Explique em 1-2 frases, português do Brasil, ' +
        'por que vale a pena a vendedora oferecer este produto parado para estes clientes da carteira. ' +
        'Seja direto e prático, sem enrolação. Responda apenas a explicação, sem aspas.',
      messages: [{
        role: 'user',
        content: `Produto: ${opts.produto}. Categoria: ${opts.categoria ?? 'não informada'}. Parado há ${opts.diasParado} dias, R$ ${opts.valorParado.toFixed(2)} em estoque. ${opts.clientesAlvo} cliente(s) da carteira já compraram essa categoria (ou são VIP/Frequente).`,
      }],
    })
    let texto = ''
    for (const b of resp.content) if (b.type === 'text') texto += b.text
    texto = texto.trim()
    return { texto: texto || fallback, viaIa: true }
  } catch {
    return { texto: fallback, viaIa: false }
  }
}

/**
 * Modo Foco de Vendas: sugere UMA resposta para a última mensagem do cliente, a partir do
 * histórico recente da conversa — a vendedora decide se usa, edita ou ignora (nunca é enviada
 * automaticamente; quem chama esta função só mostra a sugestão numa UI de aprovação). Sem add-on
 * próprio, então só chama a IA de verdade se a rede tiver pelo menos 1 cadeira paga ativa.
 */
export async function sugerirRespostaAtendimento(opts: {
  redeId: string
  cliente: { nome: string; segmento: string }
  loja: string
  vendedora: string
  ultimasMensagens: { direcao: 'ENVIADA' | 'RECEBIDA'; texto: string }[]
}): Promise<{ texto: string; viaIa: boolean }> {
  const ultimaDoCliente = [...opts.ultimasMensagens].reverse().find((m) => m.direcao === 'RECEBIDA')
  const fallback = ultimaDoCliente
    ? `Oi ${opts.cliente.nome.split(' ')[0]}! Deixa eu verificar isso pra você e já te retorno 😊`
    : `Oi ${opts.cliente.nome.split(' ')[0]}! Tudo bem? Como posso te ajudar hoje? 😊`
  if (!env.ANTHROPIC_API_KEY) return { texto: fallback, viaIa: false }
  if (opts.ultimasMensagens.length === 0) return { texto: fallback, viaIa: false }
  if (!(await temAssentoVendedoraPagante(opts.redeId))) return { texto: fallback, viaIa: false }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    const historico = opts.ultimasMensagens
      .map((m) => `${m.direcao === 'RECEBIDA' ? 'Cliente' : 'Vendedora'}: ${m.texto}`)
      .join('\n')
    const resp = await client.messages.create({
      model: MODELO_IA,
      max_tokens: 300,
      system:
        'Você ajuda uma vendedora de loja de moda a responder o cliente no WhatsApp. Sugira APENAS UMA resposta ' +
        'curta e natural em português do Brasil para a mensagem mais recente do cliente, considerando o histórico. ' +
        'NUNCA invente preço, estoque, prazo de entrega ou desconto que não foram informados no histórico — se precisar ' +
        'desses dados, sugira que a vendedora vá conferir. A vendedora vai revisar e editar antes de enviar, então seja ' +
        'apenas um rascunho útil, não uma versão final. Responda só com o texto da sugestão, sem aspas, sem explicações.',
      messages: [{
        role: 'user',
        content: `Loja: ${opts.loja}. Vendedora: ${opts.vendedora}. Cliente: ${opts.cliente.nome} (segmento ${opts.cliente.segmento}).\n\nHistórico recente:\n${historico}\n\nSugira a próxima resposta da vendedora.`,
      }],
    })
    let texto2 = ''
    for (const b of resp.content) if (b.type === 'text') texto2 += b.text
    texto2 = texto2.trim()
    return { texto: texto2 || fallback, viaIa: true }
  } catch {
    return { texto: fallback, viaIa: false }
  }
}

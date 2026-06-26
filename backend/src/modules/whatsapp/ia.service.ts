import { env } from '../../env'

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
 * Sugere uma mensagem de campanha. Usa Claude (Haiku 4.5) quando há
 * ANTHROPIC_API_KEY; caso contrário, devolve a mensagem-modelo do segmento.
 */
export async function sugerirMensagem(opts: { segmento?: string | null; contexto?: string }): Promise<{ texto: string; viaIa: boolean }> {
  const seg = opts.segmento ?? 'GERAL'
  const fallback = FALLBACK[seg] ?? FALLBACK.GERAL
  if (!env.ANTHROPIC_API_KEY) return { texto: fallback, viaIa: false }

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

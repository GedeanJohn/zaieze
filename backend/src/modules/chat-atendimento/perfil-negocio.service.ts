import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { decifrar } from '../whatsapp/meta.service'

/**
 * Job periódico do Chat de Atendimento: lê o Instagram Business JÁ CONECTADO da marca
 * (reaproveita Rede.igTokenCifrado/igBusinessAccountId — sem novo OAuth) + o segmento
 * cadastrado, e gera/atualiza o "perfil de negócio" + o "roteiro" (árvore de decisão) que o
 * motor de regras usa em tempo real, sem chamar IA por atendimento (ver roteiro_schema.md).
 *
 * ⚠️ Nunca chamado durante uma conversa em andamento — só no job (boot + 24h, reprocessa uma
 * rede só se a última geração tiver mais de REPROCESSAR_APOS_DIAS).
 */

const REPROCESSAR_APOS_DIAS = 7
const MODELO_IA = 'claude-haiku-4-5'

export interface PerfilNegocio {
  tomDeVoz: string
  tipoPecaPredominante: string
  publicoAlvoAparente: string
  ticketAparente: string
  palavrasChaveRecorrentes: string[]
}

export interface Roteiro {
  versao: number
  saudacao: { tom: 'descontraido' | 'neutro' | 'sobrio'; mensagem: string }
  saudacaoFallback: string
  perguntasQualificacao: { campo: 'peca' | 'tamanho' | 'faixaPreco'; pergunta: string; opcional?: boolean }[]
  palavrasChaveSegmento: string[]
  gatilhosHandoffDireto: string[]
  // Editáveis pelo gestor (ver roteiroOverride) — placeholder {nome_vendedora} substituído em tempo real.
  mensagemConclusao: string
  mensagemHandoffHumano: string
}

const GATILHOS_HANDOFF_PADRAO = ['troca', 'devolução', 'devolucao', 'reclamação', 'reclamacao', 'já comprei', 'ja comprei', 'meu pedido']

const PERGUNTAS_PADRAO: Roteiro['perguntasQualificacao'] = [
  { campo: 'peca', pergunta: 'Me conta, você tá procurando o quê? Alguma peça específica em mente?' },
  { campo: 'tamanho', pergunta: 'Perfeito! Qual tamanho você usa?' },
  { campo: 'faixaPreco', pergunta: 'Tem alguma faixa de preço em mente, ou quer ver as opções disponíveis?', opcional: true },
]

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${env.META_API_VERSION}/${path}`
}

export const MENSAGEM_CONCLUSAO_PADRAO = 'Perfeito! Já anotei tudo, a {nome_vendedora} já já te responde por aqui 💛'
export const MENSAGEM_HANDOFF_PADRAO = 'Isso aqui eu prefiro que a {nome_vendedora} veja com você direto — já te conecto. 🙌'

/** Roteiro neutro (sem Instagram conectado, ou falha na leitura/geração por IA). */
function roteiroNeutro(nomeSegmento: string): Roteiro {
  return {
    versao: 1,
    saudacao: { tom: 'neutro', mensagem: 'Olá! Bem-vindo(a) à {nome_loja}. Como posso te ajudar hoje?' },
    saudacaoFallback: 'Olá! Bem-vindo(a) à {nome_loja}. Como posso te ajudar hoje?',
    perguntasQualificacao: PERGUNTAS_PADRAO,
    palavrasChaveSegmento: [nomeSegmento.toLowerCase()],
    gatilhosHandoffDireto: GATILHOS_HANDOFF_PADRAO,
    mensagemConclusao: MENSAGEM_CONCLUSAO_PADRAO,
    mensagemHandoffHumano: MENSAGEM_HANDOFF_PADRAO,
  }
}

interface DadosInstagram { biografia: string; legendas: string[]; seguidores: number; totalPosts: number }

/** Lê biografia + legendas dos posts recentes via Graph API, usando o token já conectado. */
async function lerInstagram(rede: { igBusinessAccountId: string; igTokenCifrado: string }): Promise<DadosInstagram | null> {
  try {
    const token = decifrar(rede.igTokenCifrado)
    const perfilResp = await fetch(graphUrl(`${rede.igBusinessAccountId}?fields=biography,followers_count,media_count`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!perfilResp.ok) return null
    const perfil = (await perfilResp.json()) as { biography?: string; followers_count?: number; media_count?: number }

    const mediaResp = await fetch(graphUrl(`${rede.igBusinessAccountId}/media?fields=caption&limit=30`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    const media = mediaResp.ok ? ((await mediaResp.json()) as { data?: { caption?: string }[] }) : { data: [] }
    const legendas = (media.data ?? []).map((m) => m.caption).filter((c): c is string => !!c)

    return { biografia: perfil.biography ?? '', legendas, seguidores: perfil.followers_count ?? 0, totalPosts: perfil.media_count ?? 0 }
  } catch {
    return null
  }
}

/** Um único prompt de IA resume Instagram + segmento em perfil de negócio + roteiro (JSON). */
async function gerarPerfilERoteiro(segmento: string, subsegmento: string | null, dados: DadosInstagram): Promise<{ perfil: PerfilNegocio; roteiro: Roteiro } | null> {
  if (!env.ANTHROPIC_API_KEY) return null
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

    const prompt = `Você analisa o Instagram de uma loja de moda para gerar dois JSONs: um "perfil de negócio" e um "roteiro" de atendimento inicial no WhatsApp/Instagram.

Segmento cadastrado: ${segmento}${subsegmento ? ` / ${subsegmento}` : ''}
Biografia do Instagram: ${dados.biografia || '(vazia)'}
Legendas recentes (até 30): ${dados.legendas.slice(0, 30).join(' | ') || '(sem posts)'}
Seguidores: ${dados.seguidores}

Responda APENAS com um JSON válido, sem markdown, no formato:
{
  "perfil": { "tomDeVoz": string, "tipoPecaPredominante": string, "publicoAlvoAparente": string, "ticketAparente": string, "palavrasChaveRecorrentes": string[] },
  "roteiro": {
    "versao": 1,
    "saudacao": { "tom": "descontraido"|"neutro"|"sobrio", "mensagem": string (deve conter o placeholder {nome_loja}) },
    "saudacaoFallback": string (deve conter {nome_loja}),
    "perguntasQualificacao": [
      { "campo": "peca", "pergunta": string },
      { "campo": "tamanho", "pergunta": string },
      { "campo": "faixaPreco", "pergunta": string, "opcional": true }
    ],
    "palavrasChaveSegmento": string[] (termos que um cliente usaria pra descrever o que procura, no vocabulário da loja),
    "gatilhosHandoffDireto": string[] (inclua ao menos: troca, devolução, reclamação),
    "mensagemConclusao": string (mensagem de transição quando termina a qualificação, deve conter o placeholder {nome_vendedora}, tom natural — nunca soa robótico),
    "mensagemHandoffHumano": string (mensagem quando o assunto foge do escopo de qualificação, deve conter {nome_vendedora})
  }
}

Regras: mensagens curtas (até ~3 linhas), tom de WhatsApp, emoji com parcimônia (mais se o tom for descontraído, menos se for sóbrio). Nunca invente estoque/preço real.`

    const resp = await client.messages.create({
      model: MODELO_IA,
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })
    const texto = resp.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim()
    const json = JSON.parse(texto.replace(/^```json\s*|\s*```$/g, ''))
    if (!json.perfil || !json.roteiro) return null
    const roteiro: Roteiro = {
      ...json.roteiro,
      mensagemConclusao: json.roteiro.mensagemConclusao || MENSAGEM_CONCLUSAO_PADRAO,
      mensagemHandoffHumano: json.roteiro.mensagemHandoffHumano || MENSAGEM_HANDOFF_PADRAO,
    }
    return { perfil: json.perfil as PerfilNegocio, roteiro }
  } catch {
    return null
  }
}

/** Gera/atualiza o perfil+roteiro de UMA rede. Nunca lança — falha vira fallback neutro. */
export async function gerarPerfilNegocioDaRede(redeId: string): Promise<void> {
  const rede = await prisma.rede.findUnique({
    where: { id: redeId },
    select: {
      igConectado: true, igBusinessAccountId: true, igTokenCifrado: true,
      categorias: { take: 1, select: { nome: true } },
    },
  })
  if (!rede) return

  // Segmento: melhor esforço a partir da 1ª categoria cadastrada; sem isso, cai no genérico "moda".
  const segmento = rede.categorias[0]?.nome ?? 'moda'

  const proximaAtualizacaoEm = new Date(Date.now() + REPROCESSAR_APOS_DIAS * 86_400_000)

  if (!(rede.igConectado && rede.igBusinessAccountId && rede.igTokenCifrado)) {
    await prisma.perfilNegocioRede.upsert({
      where: { redeId },
      create: { redeId, instagramStatus: 'nao_conectado', roteiro: roteiroNeutro(segmento) as never, geradoEm: new Date(), proximaAtualizacaoEm },
      update: { instagramStatus: 'nao_conectado', roteiro: roteiroNeutro(segmento) as never, geradoEm: new Date(), proximaAtualizacaoEm },
    })
    return
  }

  const dados = await lerInstagram({ igBusinessAccountId: rede.igBusinessAccountId, igTokenCifrado: rede.igTokenCifrado })
  if (!dados) {
    await prisma.perfilNegocioRede.upsert({
      where: { redeId },
      create: { redeId, instagramStatus: 'indisponivel', roteiro: roteiroNeutro(segmento) as never, geradoEm: new Date(), proximaAtualizacaoEm },
      update: { instagramStatus: 'indisponivel', roteiro: roteiroNeutro(segmento) as never, geradoEm: new Date(), proximaAtualizacaoEm },
    })
    return
  }

  const gerado = await gerarPerfilERoteiro(segmento, null, dados)
  if (!gerado) {
    await prisma.perfilNegocioRede.upsert({
      where: { redeId },
      create: { redeId, instagramStatus: 'conectado', roteiro: roteiroNeutro(segmento) as never, geradoEm: new Date(), proximaAtualizacaoEm },
      update: { instagramStatus: 'conectado', roteiro: roteiroNeutro(segmento) as never, geradoEm: new Date(), proximaAtualizacaoEm },
    })
    return
  }

  await prisma.perfilNegocioRede.upsert({
    where: { redeId },
    create: {
      redeId, instagramStatus: 'conectado',
      perfilNegocio: gerado.perfil as never, roteiro: gerado.roteiro as never,
      fonteDados: { seguidores: dados.seguidores, postsAnalisados: dados.legendas.length, periodoAnalisado: 'últimos posts disponíveis' } as never,
      geradoEm: new Date(), proximaAtualizacaoEm,
    },
    update: {
      instagramStatus: 'conectado',
      perfilNegocio: gerado.perfil as never, roteiro: gerado.roteiro as never,
      fonteDados: { seguidores: dados.seguidores, postsAnalisados: dados.legendas.length, periodoAnalisado: 'últimos posts disponíveis' } as never,
      geradoEm: new Date(), proximaAtualizacaoEm,
    },
  })
}

/**
 * Varredura periódica (boot + 24h): reprocessa só redes que tenham ao menos uma
 * AssinaturaChatAtendimento ATIVA (evita gastar Instagram/IA em rede sem interessado) e cujo
 * perfil esteja vencido (nunca gerado, ou proximaAtualizacaoEm no passado).
 */
export async function atualizarPerfisNegocioVencidos(): Promise<number> {
  const redesComAssinaturaAtiva = await prisma.assinaturaChatAtendimento.findMany({
    where: { status: 'ATIVA' },
    select: { redeId: true },
    distinct: ['redeId'],
  })
  const redeIds = redesComAssinaturaAtiva.map((a) => a.redeId)
  if (redeIds.length === 0) return 0

  const agora = new Date()
  const vencidos = await prisma.rede.findMany({
    where: {
      id: { in: redeIds },
      OR: [{ perfilNegocio: null }, { perfilNegocio: { proximaAtualizacaoEm: { lte: agora } } }],
    },
    select: { id: true },
  })

  for (const r of vencidos) await gerarPerfilNegocioDaRede(r.id)
  return vencidos.length
}

/** Roteiro efetivo pra usar no motor — override do gestor tem prioridade total sobre o gerado
 *  por IA; sempre retorna algo (nunca null), mesmo sem cache ainda. */
export async function roteiroEfetivoDaRede(redeId: string, segmentoFallback = 'moda'): Promise<Roteiro> {
  const p = await prisma.perfilNegocioRede.findUnique({ where: { redeId }, select: { roteiro: true, roteiroOverride: true } })
  return (p?.roteiroOverride as unknown as Roteiro) ?? (p?.roteiro as unknown as Roteiro) ?? roteiroNeutro(segmentoFallback)
}

/**
 * Roteiro + metadados pra tela de edição do gestor: o efetivo (override ?? gerado ?? neutro),
 * se está personalizado (override presente) e o segmento cadastrado (fallback do neutro).
 */
export async function roteiroParaEdicao(redeId: string): Promise<{ roteiro: Roteiro; personalizado: boolean; instagramStatus: string }> {
  const rede = await prisma.rede.findUnique({ where: { id: redeId }, select: { categorias: { take: 1, select: { nome: true } } } })
  const segmento = rede?.categorias[0]?.nome ?? 'moda'
  const p = await prisma.perfilNegocioRede.findUnique({ where: { redeId }, select: { roteiro: true, roteiroOverride: true, instagramStatus: true } })
  const roteiro = (p?.roteiroOverride as unknown as Roteiro) ?? (p?.roteiro as unknown as Roteiro) ?? roteiroNeutro(segmento)
  return { roteiro, personalizado: !!p?.roteiroOverride, instagramStatus: p?.instagramStatus ?? 'nao_conectado' }
}

/** Salva a personalização manual do gestor — passa a valer imediatamente e o job periódico
 *  nunca mais sobrescreve até um `resetarRoteiroOverride`. */
export async function salvarRoteiroOverride(redeId: string, roteiro: Roteiro): Promise<void> {
  await prisma.perfilNegocioRede.upsert({
    where: { redeId },
    create: { redeId, roteiroOverride: roteiro as never },
    update: { roteiroOverride: roteiro as never },
  })
}

/** Remove a personalização — volta a usar o roteiro gerado por IA (ou neutro, se nunca gerado). */
export async function resetarRoteiroOverride(redeId: string): Promise<void> {
  await prisma.perfilNegocioRede.update({ where: { redeId }, data: { roteiroOverride: null as never } }).catch(() => {})
}

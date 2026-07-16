import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { env } from '../../env'
import { prisma } from '../../lib/prisma'
import { addonAtivo } from '../addons/addon.service'
import { enviarTexto } from '../whatsapp/meta.service'
import { enviarTextoIg } from '../instagram/instagram.service'
import { ferramentasDisponiveis, executarFerramenta, type ContextoIA } from './vendedora-zaieze.tools'

// Mesmo modelo usado no restante do sistema (backend/src/modules/whatsapp/ia.service.ts) —
// via API oficial da Anthropic, não Bedrock. Trocar aqui se mudar de modelo.
const MODELO_IA = 'claude-haiku-4-5'
const MAX_RODADAS_FERRAMENTA = 4
const HISTORICO_MAX = 20

interface DadosPagamento {
  chavePixTipo: string | null
  chavePix: string | null
  linkPagamentoCartao: string | null
}

/** Defesa em profundidade: o link vem do banco (já validado no cadastro), mas nunca reforça um
 *  esquema perigoso (ex.: "javascript:") numa mensagem que a IA copia direto pro cliente. */
function linkPagamentoSeguro(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null
}

function montarSistema(pagamento: DadosPagamento, provadorAtivo: boolean): string {
  const formasDisponiveis: string[] = []
  if (pagamento.chavePix) formasDisponiveis.push(`- PIX (chave ${pagamento.chavePixTipo ?? ''}): ${pagamento.chavePix}`)
  const linkCartao = linkPagamentoSeguro(pagamento.linkPagamentoCartao)
  if (linkCartao) formasDisponiveis.push(`- Cartão de crédito: mande este link de pagamento — ${linkCartao}`)
  const blocoPagamento = formasDisponiveis.length > 0
    ? `Formas de pagamento que você PODE informar ao cliente (exatamente como estão aqui, não invente outras):\n${formasDisponiveis.join('\n')}`
    : 'A loja ainda não cadastrou PIX nem link de pagamento por cartão — se o cliente perguntar como pagar, use "transferir_para_humano".'

  const blocoProvador = provadorAtivo
    ? '\nVocê TEM a ferramenta "gerar_provador" disponível: se o cliente perguntar como uma peça ficaria nele(a)/pedir pra "ver como fica", use-a.'
    : ''

  return `Você é a Vendedora ZAIEZE, atendente virtual de uma loja de moda no WhatsApp/Instagram.
Fale em português do Brasil, tom caloroso e direto, poucas frases por mensagem, sem parecer um robô lendo script.
Regras rígidas:
- NUNCA invente produto, preço, cor ou estoque — sempre confirme com as ferramentas antes de afirmar algo.
- NUNCA aplique desconto.
- NUNCA invente forma de pagamento, chave PIX ou link — use SOMENTE o que está listado abaixo.
- Só chame "fechar_venda" depois que o cliente confirmar os itens E indicar que já pagou (PIX/transferência/link) ou está mandando o comprovante.
- Se o cliente pedir algo fora do que você resolve (reclamação, negociação, trocar/cancelar pedido antigo, boleto, dúvida que você não sabe), use "transferir_para_humano".
- Pagamento é sempre combinado FORA do sistema — você nunca processa pagamento, só informa a forma certa e aguarda a confirmação do cliente.

${blocoPagamento}${blocoProvador}`
}

/** Loja + Usuario sintético da Vendedora ZAIEZE para a rede, se o addon estiver ativo e
 *  configurado (loja padrão definida). null quando o produto não se aplica a esta rede. */
export async function contextoVendedoraIa(redeId: string): Promise<{ lojaId: string; usuarioIaId: string } | null> {
  if (!(await addonAtivo(redeId, 'VENDEDORA_ZAIEZE'))) return null
  const rede = await prisma.rede.findUnique({ where: { id: redeId }, select: { id: true, slug: true, lojaVendedoraIaId: true } })
  if (!rede?.lojaVendedoraIaId) return null
  const usuarioIaId = await provisionarUsuarioIa(rede, rede.lojaVendedoraIaId)
  return { lojaId: rede.lojaVendedoraIaId, usuarioIaId }
}

/** true se este Usuario é a vendedora sintética (qualquer loja) — usado pra decidir se o
 *  atendimento de um cliente já existente deve passar pela IA. */
export async function usuarioEhAgenteIa(usuarioId: string | null | undefined): Promise<boolean> {
  if (!usuarioId) return false
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { ehAgenteIa: true } })
  return !!u?.ehAgenteIa
}

/** Cria (1x por loja) o Usuario sintético que representa a Vendedora ZAIEZE — mesmo padrão da
 *  "vendedora virtual" do Mercado Livre (mercadolivre.service.ts), sem senha utilizável. */
export async function provisionarUsuarioIa(rede: { id: string; slug: string }, lojaId: string): Promise<string> {
  const existente = await prisma.usuario.findFirst({ where: { lojaId, ehAgenteIa: true }, select: { id: true } })
  if (existente) return existente.id
  const usuario = await prisma.usuario.create({
    data: {
      lojaId,
      nome: 'Vendedora ZAIEZE',
      email: `vendedora-zaieze@${rede.slug}.zaieze.internal`,
      senhaHash: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
      role: 'VENDEDORA',
      ehAgenteIa: true,
    },
    select: { id: true },
  })
  return usuario.id
}

interface HistoricoItem { role: 'user' | 'assistant'; texto: string }

async function carregarHistorico(clienteId: string, canal: 'WHATSAPP' | 'INSTAGRAM'): Promise<HistoricoItem[]> {
  if (canal === 'WHATSAPP') {
    const msgs = await prisma.mensagemWhatsapp.findMany({
      where: { clienteId }, orderBy: { createdAt: 'desc' }, take: HISTORICO_MAX, select: { direcao: true, texto: true },
    })
    return msgs.reverse().map((m) => ({ role: m.direcao === 'RECEBIDA' ? 'user' as const : 'assistant' as const, texto: m.texto }))
  }
  const msgs = await prisma.mensagemInstagram.findMany({
    where: { clienteId }, orderBy: { createdAt: 'desc' }, take: HISTORICO_MAX, select: { direcao: true, texto: true },
  })
  return msgs.reverse().map((m) => ({ role: m.direcao === 'RECEBIDA' ? 'user' as const : 'assistant' as const, texto: m.texto }))
}

/** Roda a conversa com o Claude (tool-calling) até ele responder com texto final ou estourar o
 *  limite de rodadas de ferramenta. Sem ANTHROPIC_API_KEY (ou em qualquer erro), cai num aviso
 *  de fallback — nunca deixa o cliente sem resposta nenhuma. */
async function gerarResposta(ctx: ContextoIA, historico: HistoricoItem[], pagamento: DadosPagamento, provadorAtivo: boolean): Promise<string> {
  const fallback = 'Recebi sua mensagem! Já já alguém da equipe te responde por aqui. 🙏'
  if (!env.ANTHROPIC_API_KEY) return fallback

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

    type Bloco = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown } | { type: 'tool_result'; tool_use_id: string; content: string }
    const mensagens: { role: 'user' | 'assistant'; content: string | Bloco[] }[] =
      historico.map((h) => ({ role: h.role, content: h.texto }))

    for (let rodada = 0; rodada < MAX_RODADAS_FERRAMENTA; rodada++) {
      const resp = await client.messages.create({
        model: MODELO_IA,
        max_tokens: 700,
        system: montarSistema(pagamento, provadorAtivo),
        tools: ferramentasDisponiveis(provadorAtivo),
        messages: mensagens as never,
      })

      const usosDeFerramenta = resp.content.filter((b) => b.type === 'tool_use')
      const textoFinal = resp.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim()

      if (usosDeFerramenta.length === 0) return textoFinal || fallback

      mensagens.push({ role: 'assistant', content: resp.content as unknown as Bloco[] })
      const resultados: Bloco[] = []
      for (const uso of usosDeFerramenta) {
        const u = uso as { id: string; name: string; input: unknown }
        const resultado = await executarFerramenta(u.name, u.input, ctx)
        resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(resultado) })
      }
      mensagens.push({ role: 'user', content: resultados })

      // Se fechou a venda com sucesso, não precisa de mais rodadas de ferramenta — só a
      // próxima resposta em texto (o loop segue e o Claude já tem o resultado no contexto).
    }
    return fallback
  } catch {
    return fallback
  }
}

/** Ponto de entrada chamado pelos webhooks (WhatsApp/Instagram) depois de gravar a mensagem
 *  recebida: gera e envia a resposta da Vendedora ZAIEZE. Nunca lança — falhas viram log. */
export async function responderVendedoraZaieze(params: { clienteId: string; canal: 'WHATSAPP' | 'INSTAGRAM' }): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: params.clienteId },
    select: { id: true, lojaId: true, telefone: true, igScopedId: true, vendedoraId: true, loja: { select: { redeId: true, rede: true } } },
  })
  if (!cliente || !cliente.vendedoraId) return

  const ctx: ContextoIA = { redeId: cliente.loja.redeId, lojaId: cliente.lojaId, usuarioIaId: cliente.vendedoraId, clienteId: cliente.id }
  const historico = await carregarHistorico(cliente.id, params.canal)
  const pagamento: DadosPagamento = {
    chavePixTipo: cliente.loja.rede.chavePixTipo, chavePix: cliente.loja.rede.chavePix,
    linkPagamentoCartao: cliente.loja.rede.linkPagamentoCartao,
  }
  const provadorAtivo = await addonAtivo(cliente.loja.redeId, 'PROVADOR')
  const texto = await gerarResposta(ctx, historico, pagamento, provadorAtivo)

  if (params.canal === 'WHATSAPP' && cliente.telefone) {
    const r = await enviarTexto({ rede: cliente.loja.rede, telefone: cliente.telefone, texto })
    await prisma.mensagemWhatsapp.create({
      data: {
        lojaId: cliente.lojaId, clienteId: cliente.id, vendedoraId: cliente.vendedoraId,
        direcao: 'ENVIADA', status: r.status, origem: 'VENDEDORA_IA', telefone: cliente.telefone, texto,
        waMessageId: r.waMessageId ?? null,
      },
    })
  } else if (params.canal === 'INSTAGRAM' && cliente.igScopedId) {
    const r = await enviarTextoIg({ rede: cliente.loja.rede, igScopedId: cliente.igScopedId, texto })
    await prisma.mensagemInstagram.create({
      data: {
        lojaId: cliente.lojaId, clienteId: cliente.id, vendedoraId: cliente.vendedoraId,
        direcao: 'ENVIADA', status: r.status, origem: 'VENDEDORA_IA', igScopedId: cliente.igScopedId, texto,
        igMessageId: r.igMessageId ?? null,
      },
    })
  }
}

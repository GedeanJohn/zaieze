import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { redeIdDe } from '../../plugins/auth'
import { criarPreapproval, mpConfigurado } from '../assinaturas/mercadopago.service'
import {
  precoChatAtendimento, proximoCicloFimChatAtendimento,
  solicitarCancelamentoChatAtendimento, reativarChatAtendimento, atribuirVendedoraChatAtendimento,
} from './assinatura-chat-atendimento.service'
import { roteiroParaEdicao, salvarRoteiroOverride, resetarRoteiroOverride, type Roteiro } from './perfil-negocio.service'

const num = (v: unknown) => Number(v ?? 0)

function urlTenant(slug: string): string {
  return `${env.TENANT_SCHEME}://${slug}.${env.DOMINIO_BASE}`
}

/**
 * Chat de Atendimento — add-on de pré-atendimento roteirizado. Comprado PELO GESTOR (dono =
 * Rede), que escolhe qual vendedora cada assinatura atende (atribuição/reatribuição livre). O
 * gestor pode comprar mais de uma, mas cada assinatura vale só para uma vendedora por vez.
 */
export async function chatAtendimentoRoutes(app: FastifyInstance) {
  // Preço vigente — público (exibido na tela de contratação do gestor E na landing pública,
  // mesmo padrão de GET /addons e GET /assinaturas/planos).
  app.get('/preco', async () => ({ preco: await precoChatAtendimento() }))

  // Todas as assinaturas da rede logada + nome da vendedora atribuída (se houver).
  app.get('/minhas', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const assinaturas = await prisma.assinaturaChatAtendimento.findMany({
      where: { redeId },
      orderBy: { createdAt: 'asc' },
      include: { vendedora: { select: { id: true, nome: true } } },
    })
    return {
      assinaturas: assinaturas.map((a) => ({
        id: a.id, status: a.status, valor: num(a.valor), simulada: a.simulada,
        cicloFimEm: a.cicloFimEm, cancelamentoSolicitadoEm: a.cancelamentoSolicitadoEm,
        vendedoraId: a.vendedoraId, vendedoraNome: a.vendedora?.nome ?? null,
      })),
    }
  })

  // Vendedoras da rede disponíveis para atribuição (todas — o seletor mostra quem já está ocupada).
  app.get('/vendedoras', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const vendedoras = await prisma.usuario.findMany({
      where: { role: 'VENDEDORA', ativo: true, loja: { redeId } },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    })
    return { vendedoras }
  })

  // Contrata (checkout) — o gestor já está logado, só falta o pagamento. Pode já indicar a
  // vendedora (opcional) ou deixar para atribuir depois em /:id/atribuir.
  const checkoutSchema = z.object({ vendedoraId: z.string().optional() })
  app.post('/checkout', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { vendedoraId } = checkoutSchema.parse(request.body ?? {})
    const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { slug: true } })
    const gestor = await prisma.usuario.findFirst({ where: { redeId, role: 'GESTOR' }, orderBy: { createdAt: 'asc' }, select: { email: true } })

    if (vendedoraId) {
      const vendedoraValida = await prisma.usuario.findFirst({ where: { id: vendedoraId, role: 'VENDEDORA', loja: { redeId } }, select: { id: true } })
      if (!vendedoraValida) return reply.code(422).send({ erro: 'Vendedora não encontrada nesta rede.' })
      const jaAtribuida = await prisma.assinaturaChatAtendimento.findFirst({ where: { vendedoraId, status: { in: ['ATIVA', 'PENDENTE'] } } })
      if (jaAtribuida) return reply.code(422).send({ erro: 'Essa vendedora já está atribuída a outra assinatura do Chat de Atendimento.' })
    }

    const valor = await precoChatAtendimento()
    const simulada = !mpConfigurado()

    if (simulada) {
      const a = await prisma.assinaturaChatAtendimento.create({
        data: { redeId, vendedoraId: vendedoraId ?? null, valor, simulada: true, status: 'ATIVA', cicloFimEm: proximoCicloFimChatAtendimento() },
      })
      return reply.code(201).send({ simulado: true, id: a.id, mensagem: 'Chat de Atendimento ativado (modo simulado) — já está no ar.' })
    }

    const pre = await criarPreapproval({
      reason: 'ZAIEZE — Chat de Atendimento',
      valor,
      email: gestor?.email ?? '',
      redeSlug: rede.slug,
      backUrl: `${urlTenant(rede.slug)}/chat-atendimento`,
    })
    const a = await prisma.assinaturaChatAtendimento.create({
      data: { redeId, vendedoraId: vendedoraId ?? null, valor, status: 'PENDENTE', mpPreapprovalId: pre.id },
    })
    return reply.code(201).send({ simulado: false, id: a.id, initPoint: pre.initPoint })
  })

  // Atribui/reatribui a vendedora de uma assinatura já existente.
  app.post('/:id/atribuir', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }
    const { vendedoraId } = z.object({ vendedoraId: z.string().nullable() }).parse(request.body)
    const r = await atribuirVendedoraChatAtendimento(id, redeId, vendedoraId)
    if (!r.ok) return reply.code(422).send({ erro: r.erro })
    return { ok: true }
  })

  app.post('/:id/cancelar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }
    const a = await prisma.assinaturaChatAtendimento.findUnique({ where: { id } })
    if (!a || a.redeId !== redeId) return reply.code(404).send({ erro: 'Assinatura não encontrada.' })
    const origem = request.user.role === 'SUPER_ADMIN' ? 'ADMIN' : 'GESTOR'
    const r = await solicitarCancelamentoChatAtendimento(id, origem)
    return { ok: true, acessoAte: r.acessoAte }
  })

  app.post('/:id/reativar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }
    const a = await prisma.assinaturaChatAtendimento.findUnique({ where: { id } })
    if (!a || a.redeId !== redeId) return reply.code(404).send({ erro: 'Assinatura não encontrada.' })
    const ok = await reativarChatAtendimento(id)
    if (!ok) return reply.code(422).send({ erro: 'Assinatura já encerrada — assine novamente.' })
    return { ok: true }
  })

  // ─────────── Roteiro (saudação, perguntas, mensagens) — editável pelo gestor ───────────
  // Personalização tem prioridade total sobre o gerado por IA; uma vez salva, o job periódico
  // nunca mais sobrescreve (ver perfil-negocio.service.ts).

  app.get('/roteiro', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    return roteiroParaEdicao(redeId)
  })

  const roteiroSchema = z.object({
    saudacao: z.object({ tom: z.enum(['descontraido', 'neutro', 'sobrio']), mensagem: z.string().min(1) }),
    saudacaoFallback: z.string().min(1),
    perguntasQualificacao: z.array(z.object({
      campo: z.enum(['peca', 'tamanho', 'faixaPreco']), pergunta: z.string().min(1), opcional: z.boolean().optional(),
    })).min(1),
    palavrasChaveSegmento: z.array(z.string()),
    gatilhosHandoffDireto: z.array(z.string()),
    mensagemConclusao: z.string().min(1),
    mensagemHandoffHumano: z.string().min(1),
  })
  app.put('/roteiro', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const corpo = roteiroSchema.parse(request.body)
    const roteiro: Roteiro = { versao: 1, ...corpo }
    await salvarRoteiroOverride(redeId, roteiro)
    return { ok: true }
  })

  app.post('/roteiro/resetar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    await resetarRoteiroOverride(redeId)
    return { ok: true }
  })
}

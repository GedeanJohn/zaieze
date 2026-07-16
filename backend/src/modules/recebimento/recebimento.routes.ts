import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { redeIdDeQualquer } from '../../plugins/auth'

const TIPOS_CHAVE_PIX = ['EMAIL', 'CPF', 'TELEFONE', 'ALEATORIA'] as const

const configSchema = z.object({
  chavePixTipo: z.enum(TIPOS_CHAVE_PIX).nullish(),
  chavePix: z.string().trim().max(140).nullish(),
  // Link de cobrança de um gateway externo do próprio lojista (Mercado Pago, PagSeguro etc.) —
  // ZAIEZE não processa cartão, só repassa esse link pro cliente. Só aceita http(s) (defesa
  // contra esquema perigoso tipo "javascript:", já que isso é reenviado em mensagens depois).
  linkPagamentoCartao: z.string().trim().max(500).nullish()
    .refine((v) => !v || /^https?:\/\//i.test(v), { message: 'Link precisa começar com http:// ou https://' }),
})

/**
 * Recebimento das vendas: dados que o gestor cadastra pra loja receber diretamente do cliente
 * (PIX ou link de cobrança externo por cartão) — pagamento sempre FORA do sistema. Consumido
 * hoje pela Vendedora ZAIEZE (informa o cliente ao fechar o pedido), mas não é exclusivo do
 * add-on: qualquer gestor pode configurar, mesmo sem a Vendedora ZAIEZE ativa.
 */
export async function recebimentoRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const rede = await prisma.rede.findUniqueOrThrow({
      where: { id: redeId },
      select: { chavePixTipo: true, chavePix: true, linkPagamentoCartao: true },
    })
    return rede
  })

  app.put('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const parsed = configSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(422).send({ erro: parsed.error.issues[0]?.message ?? 'Dados inválidos' })
    const body = parsed.data

    return prisma.rede.update({
      where: { id: redeId },
      data: {
        chavePixTipo: body.chavePixTipo ?? null,
        chavePix: body.chavePix ?? null,
        linkPagamentoCartao: body.linkPagamentoCartao ?? null,
      },
      select: { chavePixTipo: true, chavePix: true, linkPagamentoCartao: true },
    })
  })
}

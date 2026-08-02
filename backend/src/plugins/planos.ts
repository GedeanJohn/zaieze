import type { FastifyReply, FastifyRequest } from 'fastify'
import type { TipoAddon } from '@prisma/client'
import { addonAtivo } from '../modules/addons/addon.service'

/**
 * preHandler que bloqueia a rota quando a rede não tem uma assinatura de ADD-ON ativa —
 * recurso vendido À PARTE do assento de vendedora (Provador, Vendedora ZAIEZE, Estoque
 * Inteligente, Radar). SUPER_ADMIN (operador do SaaS) passa sempre.
 */
export function requireAddon(tipo: TipoAddon) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({ erro: 'Token ausente ou inválido' })
    }
    if (request.user.role === 'SUPER_ADMIN') return
    const redeId = request.user.redeId
    if (!redeId) return reply.code(403).send({ erro: 'Sem rede vinculada' })
    if (!(await addonAtivo(redeId, tipo))) {
      return reply.code(403).send({
        erro: 'Recurso disponível apenas com a assinatura deste add-on. Assine em Planos.',
        addonNecessario: tipo,
      })
    }
  }
}

// addonAtivo (import acima) já existe em addon.service.ts e é reexportado por conveniência —
// utilizável fora de um preHandler do Fastify (ex.: dentro do processamento de um webhook).
export { addonAtivo }

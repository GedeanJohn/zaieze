import jwt from '@fastify/jwt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Role } from '@prisma/client'
import { env } from '../env'
import { prisma } from '../lib/prisma'

/**
 * Auth JWT + RBAC.
 * Hierarquia: SUPER_ADMIN (SaaS) → GESTOR (rede/marca) → GERENTE (loja) → VENDEDORA (carteira).
 *
 * Isolamento multi-tenant: o escopo vem SEMPRE do token (nunca do body):
 * - GERENTE/VENDEDORA: lojaId do token.
 * - GESTOR: informa ?lojaId= e a posse é validada contra a rede do token.
 * - SUPER_ADMIN: informa ?lojaId= livremente.
 */
export async function registrarAuth(app: FastifyInstance) {
  await app.register(jwt, { secret: env.JWT_SECRET })

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({ erro: 'Token ausente ou inválido' })
    }
  })

  app.decorate('authorize', (...roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify()
      } catch {
        return reply.code(401).send({ erro: 'Token ausente ou inválido' })
      }
      if (!roles.includes(request.user.role)) {
        return reply.code(403).send({ erro: 'Sem permissão para esta operação' })
      }
    }
  })
}

function erroHttp(statusCode: number, mensagem: string): Error {
  return Object.assign(new Error(mensagem), { statusCode })
}

/** Resolve o lojaId efetivo da requisição, validando a hierarquia. */
export async function lojaIdDe(request: FastifyRequest): Promise<string> {
  const user = request.user
  const q = request.query as { lojaId?: string }

  if (user.role === 'SUPER_ADMIN') {
    if (!q?.lojaId) throw erroHttp(400, 'SUPER_ADMIN deve informar ?lojaId=')
    return q.lojaId
  }

  // GESTOR e ESTOQUISTA operam no nível da rede: precisam indicar a loja e a posse é validada
  if (user.role === 'GESTOR' || user.role === 'ESTOQUISTA') {
    if (!q?.lojaId) throw erroHttp(400, 'Informe ?lojaId= (loja da sua rede)')
    const loja = await prisma.loja.findFirst({ where: { id: q.lojaId, redeId: user.redeId ?? '__nenhuma__' } })
    if (!loja) throw erroHttp(403, 'Loja não pertence à sua rede')
    return loja.id
  }

  if (!user.lojaId) throw erroHttp(403, 'Usuário sem loja vinculada')
  return user.lojaId
}

/** Resolve o redeId efetivo (operações de rede: lojas, dashboard consolidado). */
export function redeIdDe(request: FastifyRequest): string {
  const user = request.user
  if (user.role === 'SUPER_ADMIN') {
    const q = request.query as { redeId?: string }
    if (!q?.redeId) throw erroHttp(400, 'SUPER_ADMIN deve informar ?redeId=')
    return q.redeId
  }
  if (!user.redeId) throw erroHttp(403, 'Usuário sem rede vinculada')
  return user.redeId
}

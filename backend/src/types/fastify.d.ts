import '@fastify/jwt'
import type { Role, Plano } from '@prisma/client'

export interface JwtUser {
  sub: string
  redeId: string | null
  lojaId: string | null
  role: Role
  nome: string
  plano: Plano | null
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUser
    user: JwtUser
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
    authorize: (
      ...roles: Role[]
    ) => (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>
  }
}

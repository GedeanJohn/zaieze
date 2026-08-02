import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { redeIdDe } from '../../plugins/auth'
import { normalizarTelefone } from '../../lib/telefone'

const criarSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  senha: z.string().min(6),
  // Obrigatório: é pra onde vai a senha provisória do "esqueci minha senha".
  telefone: z.string().min(8, 'Informe o WhatsApp com DDD').transform(normalizarTelefone),
})

const atualizarSchema = z.object({
  nome: z.string().min(2).optional(),
  email: z.string().email().optional(),
  senha: z.string().min(6).optional(),
  telefone: z.string().nullish().transform((v) => (v ? normalizarTelefone(v) : v)),
  ativo: z.boolean().optional(),
})

const selecao = { id: true, nome: true, email: true, telefone: true, ativo: true, createdAt: true } as const

/** Estoquistas da rede — geridos pelo GESTOR (papel de nível de rede). */
export async function estoquistasRoutes(app: FastifyInstance) {

  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request) => {
    const redeId = redeIdDe(request)
    return prisma.usuario.findMany({ where: { redeId, role: 'ESTOQUISTA' }, orderBy: { nome: 'asc' }, select: selecao })
  })

  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const body = criarSchema.parse(request.body)
    try {
      const u = await prisma.usuario.create({
        data: {
          redeId,
          role: 'ESTOQUISTA',
          nome: body.nome,
          email: body.email.toLowerCase(),
          senhaHash: await bcrypt.hash(body.senha, 10),
          telefone: body.telefone,
        },
        select: selecao,
      })
      return reply.code(201).send(u)
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') return reply.code(409).send({ erro: 'Já existe um usuário com este e-mail' })
      throw e
    }
  })

  app.patch('/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }
    const body = atualizarSchema.parse(request.body)

    const existente = await prisma.usuario.findFirst({ where: { id, redeId, role: 'ESTOQUISTA' } })
    if (!existente) return reply.code(404).send({ erro: 'Gestor de estoque não encontrado na sua rede' })

    const { senha, email, ...resto } = body
    try {
      return await prisma.usuario.update({
        where: { id },
        data: {
          ...resto,
          ...(email ? { email: email.toLowerCase() } : {}),
          ...(senha ? { senhaHash: await bcrypt.hash(senha, 10) } : {}),
        },
        select: selecao,
      })
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') return reply.code(409).send({ erro: 'E-mail já usado por outro usuário' })
      throw e
    }
  })
}

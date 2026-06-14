import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'

const criarUsuarioSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  senha: z.string().min(6),
  role: z.enum(['GERENTE', 'VENDEDORA']).default('VENDEDORA'),
  equipeId: z.string().optional(),
  telefone: z.string().optional(),
  slugCatalogo: z.string().regex(/^[a-z0-9-]+$/).optional(),
  metaMensal: z.coerce.number().nonnegative().optional(),
  comissaoPadrao: z.coerce.number().min(0).max(100).optional(),
})

const atualizarUsuarioSchema = criarUsuarioSchema.partial().extend({
  senha: z.string().min(6).optional(),
  equipeId: z.string().nullish(),
  ativo: z.boolean().optional(),
})

const selecaoPublica = {
  id: true, nome: true, email: true, role: true, telefone: true,
  slugCatalogo: true, metaMensal: true, comissaoPadrao: true, ativo: true, createdAt: true,
  equipe: { select: { id: true, nome: true } },
} as const

/** Equipe da loja (gerente + vendedoras). Limite de vendedoras por plano da rede. */
export async function usuariosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    return prisma.usuario.findMany({
      where: { lojaId },
      orderBy: [{ role: 'asc' }, { nome: 'asc' }],
      select: { ...selecaoPublica, _count: { select: { carteira: true } } },
    })
  })

  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarUsuarioSchema.parse(request.body)

    // GERENTE só cria VENDEDORA; criar outro GERENTE é ato do GESTOR
    if (body.role === 'GERENTE' && request.user.role === 'GERENTE') {
      return reply.code(403).send({ erro: 'Apenas o gestor da rede pode denominar gerentes' })
    }

    // Vendedoras ilimitadas em todos os planos — a diferenciação é por funcionalidade, não por quantidade.

    // Equipe precisa pertencer à mesma loja
    if (body.equipeId) {
      const equipe = await prisma.equipe.findFirst({ where: { id: body.equipeId, lojaId } })
      if (!equipe) return reply.code(422).send({ erro: 'Equipe inválida para esta loja' })
    }

    const usuario = await prisma.usuario.create({
      data: {
        lojaId,
        nome: body.nome,
        email: body.email.toLowerCase(),
        senhaHash: await bcrypt.hash(body.senha, 10),
        role: body.role,
        equipeId: body.equipeId,
        telefone: body.telefone,
        slugCatalogo: body.slugCatalogo,
        metaMensal: body.metaMensal,
        comissaoPadrao: body.comissaoPadrao,
      },
      select: selecaoPublica,
    })
    return reply.code(201).send(usuario)
  })

  app.patch('/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = atualizarUsuarioSchema.parse(request.body)

    const existente = await prisma.usuario.findFirst({ where: { id, lojaId } })
    if (!existente) return reply.code(404).send({ erro: 'Usuário não encontrado nesta loja' })

    if (body.equipeId) {
      const equipe = await prisma.equipe.findFirst({ where: { id: body.equipeId, lojaId } })
      if (!equipe) return reply.code(422).send({ erro: 'Equipe inválida para esta loja' })
    }

    const { senha, email, role, ...resto } = body
    if (role && role !== existente.role && request.user.role === 'GERENTE') {
      return reply.code(403).send({ erro: 'Apenas o gestor da rede pode alterar papéis' })
    }

    return prisma.usuario.update({
      where: { id },
      data: {
        ...resto,
        ...(role ? { role } : {}),
        ...(email ? { email: email.toLowerCase() } : {}),
        ...(senha ? { senhaHash: await bcrypt.hash(senha, 10) } : {}),
      },
      select: selecaoPublica,
    })
  })
}

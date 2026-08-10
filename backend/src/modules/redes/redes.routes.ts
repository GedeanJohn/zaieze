import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'

const criarRedeSchema = z.object({
  nome: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  plano: z.enum(['START', 'PRO', 'ELITE']).default('START'),
  // gestor da marca criado junto com a rede
  gestor: z.object({
    nome: z.string().min(2),
    email: z.string().email(),
    senha: z.string().min(6),
  }),
})

const atualizarRedeSchema = z.object({
  nome: z.string().min(2).optional(),
  plano: z.enum(['START', 'PRO', 'ELITE']).optional(),
  ativo: z.boolean().optional(),
})

/** Gestão de redes (marcas) — exclusiva do SUPER_ADMIN (onboarding do SaaS). */
export async function redesRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN')] }, async () => {
    return prisma.rede.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { lojas: true, usuarios: true } },
        usuarios: { where: { role: 'GESTOR' }, select: { id: true, nome: true, email: true } },
      },
    })
  })

  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN')] }, async (request, reply) => {
    const body = criarRedeSchema.parse(request.body)
    const rede = await prisma.rede.create({
      data: {
        nome: body.nome,
        slug: body.slug,
        plano: body.plano,
        usuarios: {
          create: {
            nome: body.gestor.nome,
            email: body.gestor.email.toLowerCase(),
            senhaHash: await bcrypt.hash(body.gestor.senha, 10),
            role: 'GESTOR',
          },
        },
      },
      include: { usuarios: { select: { id: true, nome: true, email: true, role: true } } },
    })
    return reply.code(201).send(rede)
  })

  app.patch('/:id', { preHandler: [app.authorize('SUPER_ADMIN')] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = atualizarRedeSchema.parse(request.body)
    return prisma.rede.update({ where: { id }, data: body })
  })

  // Gestor consulta a própria rede
  app.get('/minha', { preHandler: [app.authorize('GESTOR')] }, async (request) => {
    return prisma.rede.findUniqueOrThrow({
      where: { id: request.user.redeId! },
      include: { _count: { select: { lojas: true } } },
    })
  })

  // Pública (sem login): dados mínimos pra identificar a loja na tela de login do tenant
  // (<slug>.zaieze.com/login) — só nome/logo, nada sensível.
  app.get('/publico/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const rede = await prisma.rede.findUnique({
      where: { slug: slug.toLowerCase() },
      select: { nome: true, logoUrl: true },
    })
    if (!rede) return reply.code(404).send({ message: 'Loja não encontrada' })
    return rede
  })
}

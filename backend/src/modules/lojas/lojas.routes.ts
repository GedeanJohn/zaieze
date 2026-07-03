import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { redeIdDe } from '../../plugins/auth'
import { normalizarTelefone } from '../../lib/telefone'

const criarLojaSchema = z.object({
  nome: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'slug deve ter apenas letras minúsculas, números e hífens'),
  cnpj: z.string().optional(),
  telefone: z.string().optional(),
  // gerente denominado pelo gestor na criação da loja
  gerente: z.object({
    nome: z.string().min(2),
    email: z.string().email(),
    senha: z.string().min(6),
    // Obrigatório: é pra onde vai a senha provisória do "esqueci minha senha".
    telefone: z.string().min(8, 'Informe o WhatsApp do gerente com DDD').transform(normalizarTelefone),
  }),
})

const atualizarLojaSchema = z.object({
  nome: z.string().min(2).optional(),
  cnpj: z.string().nullish(),
  telefone: z.string().nullish(),
  limiteAtacado: z.coerce.number().positive().optional(),
  ativo: z.boolean().optional(),
})

const incluirLoja = {
  _count: { select: { usuarios: true, clientes: true, equipes: true } },
  usuarios: {
    where: { role: 'GERENTE' as const },
    select: { id: true, nome: true, email: true },
  },
}

/** Lojas da rede — o GESTOR cria a loja e denomina um gerente. */
export async function lojasRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE')] }, async (request) => {
    const redeId = redeIdDe(request)
    return prisma.loja.findMany({
      where: { redeId },
      orderBy: { createdAt: 'asc' },
      include: incluirLoja,
    })
  })

  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const body = criarLojaSchema.parse(request.body)

    // Lojas ilimitadas em todos os planos — a diferenciação é por funcionalidade, não por quantidade.
    const loja = await prisma.loja.create({
      data: {
        redeId,
        nome: body.nome,
        slug: body.slug,
        cnpj: body.cnpj,
        telefone: body.telefone,
        usuarios: {
          create: {
            nome: body.gerente.nome,
            email: body.gerente.email.toLowerCase(),
            senhaHash: await bcrypt.hash(body.gerente.senha, 10),
            telefone: body.gerente.telefone,
            role: 'GERENTE',
          },
        },
      },
      include: incluirLoja,
    })
    return reply.code(201).send(loja)
  })

  app.patch('/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }
    const body = atualizarLojaSchema.parse(request.body)

    const existente = await prisma.loja.findFirst({ where: { id, redeId } })
    if (!existente) return reply.code(404).send({ erro: 'Loja não encontrada na sua rede' })

    return prisma.loja.update({ where: { id }, data: body, include: incluirLoja })
  })

  // Gerente/vendedora consultam a própria loja
  app.get('/minha', { preHandler: [app.authorize('GERENTE', 'VENDEDORA')] }, async (request) => {
    return prisma.loja.findUniqueOrThrow({
      where: { id: request.user.lojaId! },
      include: {
        rede: { select: { nome: true, plano: true } },
        _count: { select: { usuarios: true, clientes: true, equipes: true } },
      },
    })
  })
}

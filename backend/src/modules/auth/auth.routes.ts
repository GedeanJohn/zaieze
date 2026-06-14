import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
  // slug do tenant (subdomínio wildcard); quando presente, a conta precisa pertencer a esta rede
  redeSlug: z.string().optional(),
})

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const usuario = await prisma.usuario.findUnique({
      where: { email: body.email.toLowerCase() },
      include: {
        loja: { select: { id: true, nome: true, slug: true, ativo: true, rede: { select: { id: true, nome: true, slug: true, plano: true, ativo: true } } } },
        rede: { select: { id: true, nome: true, slug: true, plano: true, ativo: true } },
      },
    })

    if (!usuario || !usuario.ativo || !(await bcrypt.compare(body.senha, usuario.senhaHash))) {
      return reply.code(401).send({ erro: 'E-mail ou senha inválidos' })
    }
    if (usuario.loja && (!usuario.loja.ativo || !usuario.loja.rede.ativo)) {
      return reply.code(403).send({ erro: 'Loja ou rede desativada' })
    }
    if (usuario.rede && !usuario.rede.ativo) {
      return reply.code(403).send({ erro: 'Rede desativada' })
    }

    // redeId do gestor vem direto; do gerente/vendedora, via loja
    const redeId = usuario.redeId ?? usuario.loja?.rede.id ?? null
    const rede = usuario.rede ?? usuario.loja?.rede ?? null

    // Isolamento por subdomínio (wildcard): a conta só entra no seu próprio tenant.
    // SUPER_ADMIN (operador do SaaS) acessa de qualquer endereço.
    if (body.redeSlug && usuario.role !== 'SUPER_ADMIN' && rede?.slug !== body.redeSlug) {
      return reply.code(403).send({ erro: 'Esta conta não pertence a este endereço.' })
    }

    const token = app.jwt.sign(
      { sub: usuario.id, redeId, lojaId: usuario.lojaId, role: usuario.role, nome: usuario.nome, plano: rede?.plano ?? null },
      { expiresIn: '12h' },
    )

    return {
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
        rede: rede ? { id: rede.id, nome: rede.nome, plano: rede.plano } : null,
        loja: usuario.loja ? { id: usuario.loja.id, nome: usuario.loja.nome, slug: usuario.loja.slug } : null,
      },
    }
  })

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    return prisma.usuario.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: {
        id: true, nome: true, email: true, role: true, telefone: true,
        metaMensal: true, comissaoPadrao: true,
        equipe: { select: { id: true, nome: true } },
        rede: { select: { id: true, nome: true, plano: true } },
        loja: { select: { id: true, nome: true, slug: true, rede: { select: { id: true, nome: true, plano: true } } } },
      },
    })
  })
}

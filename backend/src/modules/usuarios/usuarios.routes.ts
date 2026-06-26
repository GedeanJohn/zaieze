import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { ETAPAS_ABERTAS } from '../leads/leads.service'

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
  waNumero: true, waConectado: true,
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

  // Minha conta: QUALQUER papel (inclusive GESTOR/super-admin) edita os próprios dados.
  // É o que permite transferir a titularidade quando a marca é vendida (troca nome+email+senha).
  app.patch('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const meId = request.user.sub
    const body = z.object({ nome: z.string().min(2).optional(), email: z.string().email().optional(), senha: z.string().min(6).optional() }).parse(request.body)
    if (body.email) {
      const email = body.email.toLowerCase()
      if (await prisma.usuario.findFirst({ where: { email, id: { not: meId } }, select: { id: true } })) {
        return reply.code(409).send({ erro: 'E-mail já usado por outro usuário' })
      }
    }
    return prisma.usuario.update({
      where: { id: meId },
      data: {
        ...(body.nome ? { nome: body.nome } : {}),
        ...(body.email ? { email: body.email.toLowerCase() } : {}),
        ...(body.senha ? { senhaHash: await bcrypt.hash(body.senha, 10) } : {}),
      },
      select: { id: true, nome: true, email: true, role: true },
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

  // CENÁRIO 1 — Substituir a pessoa MANTENDO a carteira: reusa o mesmo registro
  // (carteira/leads/vendas/slug continuam), troca nome+email+senha e zera o WhatsApp
  // (o novo titular conecta o número dele).
  app.post('/:id/substituir', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = z.object({ nome: z.string().min(2), email: z.string().email(), senha: z.string().min(6) }).parse(request.body)

    const existente = await prisma.usuario.findFirst({ where: { id, lojaId } })
    if (!existente) return reply.code(404).send({ erro: 'Usuário não encontrado nesta loja' })
    const email = body.email.toLowerCase()
    if (await prisma.usuario.findFirst({ where: { email, id: { not: id } }, select: { id: true } })) {
      return reply.code(409).send({ erro: 'E-mail já usado por outro usuário' })
    }
    return prisma.usuario.update({
      where: { id },
      data: {
        nome: body.nome, email, senhaHash: await bcrypt.hash(body.senha, 10),
        waInstancia: null, waConectado: false, waQrcode: null, ativo: true,
      },
      select: selecaoPublica,
    })
  })

  // CENÁRIO 2 — Desligar: transfere a carteira (clientes + leads abertos) para outra
  // vendedora e desativa a pessoa. Sem destino → só desativa.
  app.post('/:id/desligar', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = z.object({ paraVendedoraId: z.string().optional() }).parse(request.body ?? {})

    const existente = await prisma.usuario.findFirst({ where: { id, lojaId } })
    if (!existente) return reply.code(404).send({ erro: 'Usuário não encontrado nesta loja' })

    let clientes = 0, leads = 0
    if (body.paraVendedoraId) {
      if (body.paraVendedoraId === id) return reply.code(422).send({ erro: 'Escolha outra vendedora para receber a carteira' })
      const destino = await prisma.usuario.findFirst({ where: { id: body.paraVendedoraId, lojaId, role: 'VENDEDORA', ativo: true } })
      if (!destino) return reply.code(422).send({ erro: 'Vendedora de destino inválida' })
      const c = await prisma.cliente.updateMany({ where: { lojaId, vendedoraId: id }, data: { vendedoraId: body.paraVendedoraId } })
      const l = await prisma.lead.updateMany({ where: { lojaId, vendedoraId: id, status: { in: ETAPAS_ABERTAS } }, data: { vendedoraId: body.paraVendedoraId } })
      clientes = c.count; leads = l.count
    }
    await prisma.usuario.update({ where: { id }, data: { ativo: false } })
    return { ok: true, clientesTransferidos: clientes, leadsTransferidos: leads }
  })
}

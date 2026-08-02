import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Prisma, Role } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { normalizarTelefone } from '../../lib/telefone'
import { solicitarAssentoVendedora, resolverConviteAceito } from '../vendedora-billing/assinatura-vendedora.service'

/**
 * Convites por link (onboarding). Quem convida gera um link; a pessoa abre, CRIA A PRÓPRIA SENHA
 * e só então o Usuario é criado (escopo — rede/loja/equipe/papel — vem do convite). Token expira em 7 dias.
 * Envio por WhatsApp = link wa.me com a mensagem pronta (quem convida dispara do próprio WhatsApp).
 */

// Quem pode convidar cada papel.
const PODE_CONVIDAR: Record<string, Role[]> = {
  SUPER_ADMIN: ['GESTOR', 'ESTOQUISTA', 'GERENTE', 'VENDEDORA'],
  GESTOR: ['ESTOQUISTA', 'GERENTE', 'VENDEDORA'],
  GERENTE: ['VENDEDORA'],
}

const criarSchema = z.object({
  nome: z.string().min(2),
  email: z.string().email(),
  // Obrigatório: é pra onde vai a senha provisória do "esqueci minha senha".
  telefone: z.string().min(8, 'Informe o WhatsApp com DDD').transform(normalizarTelefone),
  role: z.enum(['GESTOR', 'ESTOQUISTA', 'GERENTE', 'VENDEDORA']),
  lojaId: z.string().optional(),
  equipeId: z.string().optional(),
  redeId: z.string().optional(), // só usado pelo SUPER_ADMIN
})

const DIAS_VALIDADE = 7

export async function convitesRoutes(app: FastifyInstance) {
  // Cria um convite e devolve o link + a URL de WhatsApp pronta.
  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const body = criarSchema.parse(request.body)
    const permitidos = PODE_CONVIDAR[request.user.role] ?? []
    if (!permitidos.includes(body.role)) return reply.code(403).send({ erro: 'Você não pode convidar esse papel.' })

    let redeId = request.user.redeId ?? body.redeId ?? null
    let lojaId = request.user.role === 'GERENTE' ? (request.user.lojaId ?? null) : (body.lojaId ?? null)

    // Papéis de rede não levam loja; papéis de loja exigem loja.
    if (body.role === 'GESTOR' || body.role === 'ESTOQUISTA') lojaId = null
    if ((body.role === 'GERENTE' || body.role === 'VENDEDORA') && !lojaId) return reply.code(422).send({ erro: 'Informe a loja do convidado.' })

    if (lojaId) {
      const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { redeId: true } })
      if (!loja) return reply.code(422).send({ erro: 'Loja inválida.' })
      if (!redeId) redeId = loja.redeId
      if (redeId && loja.redeId !== redeId) return reply.code(403).send({ erro: 'Loja não pertence à sua rede.' })
    }
    if (!redeId) return reply.code(422).send({ erro: 'Rede não identificada (informe redeId/loja).' })

    const email = body.email.toLowerCase()
    if (await prisma.usuario.findUnique({ where: { email }, select: { id: true } })) {
      return reply.code(409).send({ erro: 'Já existe um usuário com este e-mail.' })
    }

    // VENDEDORA é o único papel cobrado (assento por conta de vendedora) — delega pro módulo de
    // billing, que cria o Convite E a assinatura na mesma transação. Se quem convida é o GERENTE,
    // fica aguardando aprovação do GESTOR antes de qualquer cobrança (ver
    // assinatura-vendedora.service.ts).
    if (body.role === 'VENDEDORA') {
      const r = await solicitarAssentoVendedora({
        redeId, lojaId: lojaId!, equipeId: body.equipeId ?? null,
        nome: body.nome, email, telefone: body.telefone,
        solicitadoPorId: request.user.sub, solicitadoPorRole: request.user.role,
      })
      if (!r.ok) return reply.code(422).send({ erro: r.erro })
      if (r.aguardandoAprovacao) {
        return reply.code(202).send({ aguardandoAprovacao: true, assinaturaId: r.assinaturaId, mensagem: 'Solicitação enviada para aprovação do gestor.' })
      }
      const assinatura = await prisma.assinaturaVendedora.findUniqueOrThrow({ where: { id: r.assinaturaId }, include: { convite: true } })
      const convite = assinatura.convite!
      const rede = await prisma.rede.findUnique({ where: { id: redeId }, select: { slug: true, nome: true } })
      const link = `${env.TENANT_SCHEME}://${rede?.slug}.${env.DOMINIO_BASE}/convite/${convite.token}`
      const primeiro = convite.nome.split(/\s+/)[0]
      const msg = `Olá ${primeiro}! Você foi convidado(a) para o ${rede?.nome ?? 'sistema'} (ModaCRM). Crie seu acesso aqui: ${link}`
      const whatsappUrl = `https://wa.me/${convite.telefone}?text=${encodeURIComponent(msg)}`
      return reply.code(201).send({ link, whatsappUrl, expiraEm: convite.expiraEm, nome: convite.nome, role: 'VENDEDORA', simulado: r.simulado, initPoint: r.initPoint })
    }

    const token = randomBytes(24).toString('hex')
    const expiraEm = new Date(Date.now() + DIAS_VALIDADE * 86_400_000)
    await prisma.convite.create({
      data: { token, nome: body.nome.trim(), email, telefone: body.telefone, role: body.role, redeId, lojaId, equipeId: body.equipeId ?? null, criadoPorId: request.user.sub, expiraEm },
    })

    const rede = await prisma.rede.findUnique({ where: { id: redeId }, select: { slug: true, nome: true } })
    const link = `${env.TENANT_SCHEME}://${rede?.slug}.${env.DOMINIO_BASE}/convite/${token}`
    const primeiro = body.nome.trim().split(/\s+/)[0]
    const msg = `Olá ${primeiro}! Você foi convidado(a) para o ${rede?.nome ?? 'sistema'} (ModaCRM). Crie seu acesso aqui: ${link}`
    const whatsappUrl = `https://wa.me/${body.telefone}?text=${encodeURIComponent(msg)}`
    return reply.code(201).send({ link, whatsappUrl, expiraEm, nome: body.nome, role: body.role })
  })

  // Lista convites pendentes (não usados e não expirados) do escopo do solicitante.
  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request) => {
    const where: Prisma.ConviteWhereInput = { usado: false, expiraEm: { gt: new Date() } }
    if (request.user.role !== 'SUPER_ADMIN') where.redeId = request.user.redeId
    if (request.user.role === 'GERENTE') where.lojaId = request.user.lojaId
    return prisma.convite.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, nome: true, email: true, role: true, lojaId: true, expiraEm: true, createdAt: true },
    })
  })

  // Revoga (apaga) um convite pendente.
  app.delete('/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const c = await prisma.convite.findUnique({ where: { id } })
    if (!c) return reply.code(404).send({ erro: 'Convite não encontrado' })
    if (request.user.role !== 'SUPER_ADMIN' && c.redeId !== request.user.redeId) return reply.code(403).send({ erro: 'Fora da sua rede' })
    await prisma.convite.delete({ where: { id } })
    return { ok: true }
  })

  // ─────────── PÚBLICO (sem auth) ───────────

  // Dados do convite para a tela "criar minha senha".
  app.get('/:token', async (request) => {
    const { token } = request.params as { token: string }
    const c = await prisma.convite.findUnique({ where: { token } })
    if (!c) return { valido: false, motivo: 'inexistente' as const }
    const expirado = c.expiraEm.getTime() < Date.now()
    const rede = c.redeId ? await prisma.rede.findUnique({ where: { id: c.redeId }, select: { nome: true } }) : null
    return { valido: !c.usado && !expirado, usado: c.usado, expirado, nome: c.nome, email: c.email, role: c.role, redeNome: rede?.nome ?? null }
  })

  // Aceita o convite: cria o usuário com a senha escolhida e marca o convite como usado.
  app.post('/:token/aceitar', async (request, reply) => {
    const { token } = request.params as { token: string }
    const { senha } = z.object({ senha: z.string().min(6) }).parse(request.body)

    const c = await prisma.convite.findUnique({ where: { token } })
    if (!c || c.usado || c.expiraEm.getTime() < Date.now()) return reply.code(410).send({ erro: 'Convite inválido ou expirado.' })
    if (await prisma.usuario.findUnique({ where: { email: c.email }, select: { id: true } })) {
      return reply.code(409).send({ erro: 'Este e-mail já tem conta. Faça login.' })
    }

    const usuario = await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({
        data: {
          nome: c.nome, email: c.email, senhaHash: await bcrypt.hash(senha, 10), role: c.role,
          redeId: c.redeId, lojaId: c.lojaId, equipeId: c.equipeId, telefone: c.telefone, ativo: true,
        },
      })
      await tx.convite.update({ where: { id: c.id }, data: { usado: true } })
      return usuario
    })
    // Liga o assento de vendedora (se houver) ao Usuario recém-criado — no-op para os demais papéis.
    await resolverConviteAceito(c.id, usuario.id)

    const rede = c.redeId ? await prisma.rede.findUnique({ where: { id: c.redeId }, select: { slug: true } }) : null
    return { ok: true, email: c.email, redeSlug: rede?.slug ?? null }
  })
}

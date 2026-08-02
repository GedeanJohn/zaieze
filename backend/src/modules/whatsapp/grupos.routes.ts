import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { dispararParaClientes } from './disparo.service'

const criarSchema = z.object({
  nome: z.string().min(1).max(60),
  clienteIds: z.array(z.string()).default([]),
})
const atualizarSchema = z.object({
  nome: z.string().min(1).max(60).optional(),
  clienteIds: z.array(z.string()).optional(),
})

/** Vendedora só enxerga os próprios grupos; gerente/gestor veem a loja inteira. */
function escopoGrupo(request: { user: { role: string; sub: string } }, lojaId: string): Prisma.GrupoTransmissaoWhereInput {
  const where: Prisma.GrupoTransmissaoWhereInput = { lojaId }
  if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
  return where
}

/**
 * Grupos de transmissão do Chat Zaieze (lista interna de clientes).
 * Disparar um grupo envia a MESMA mensagem INDIVIDUALMENTE a cada membro — a API oficial
 * da Meta não suporta grupos nativos do WhatsApp. Reusa o motor de disparo (LGPD + roteamento).
 */
export async function gruposRoutes(app: FastifyInstance) {
  // Lista os grupos no escopo, com contagem de membros e prévia do último disparo.
  app.get('/grupos', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const grupos = await prisma.grupoTransmissao.findMany({
      where: escopoGrupo(request, lojaId),
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { membros: true } },
        mensagens: { orderBy: { createdAt: 'desc' }, take: 1, select: { texto: true, createdAt: true } },
      },
    })
    return grupos.map((g) => ({
      id: g.id,
      nome: g.nome,
      membros: g._count.membros,
      ultimaMensagem: g.mensagens[0]?.texto ?? null,
      ultimaEm: g.mensagens[0]?.createdAt ?? g.updatedAt,
    }))
  })

  // Detalhe de um grupo: membros + últimos disparos.
  app.get('/grupos/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const grupo = await prisma.grupoTransmissao.findFirst({
      where: { id, ...escopoGrupo(request, lojaId) },
      include: {
        membros: { include: { cliente: { select: { id: true, nome: true, telefone: true, segmento: true } } } },
        mensagens: { orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, texto: true, status: true, createdAt: true } },
      },
    })
    if (!grupo) return reply.code(404).send({ erro: 'Grupo não encontrado' })
    return {
      id: grupo.id,
      nome: grupo.nome,
      membros: grupo.membros.map((m) => m.cliente),
      disparos: grupo.mensagens,
    }
  })

  // Cria um grupo. Membros precisam ser clientes da loja (e da carteira, se for vendedora).
  app.post('/grupos', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { nome, clienteIds } = criarSchema.parse(request.body)
    const ids = await idsClientesValidos(request, lojaId, clienteIds)
    const grupo = await prisma.grupoTransmissao.create({
      data: {
        lojaId, vendedoraId: request.user.sub, nome: nome.trim(),
        membros: { create: ids.map((clienteId) => ({ clienteId })) },
      },
      select: { id: true },
    })
    return reply.code(201).send({ id: grupo.id })
  })

  // Renomeia / substitui a lista de membros.
  app.patch('/grupos/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = atualizarSchema.parse(request.body)
    const grupo = await prisma.grupoTransmissao.findFirst({ where: { id, ...escopoGrupo(request, lojaId) }, select: { id: true } })
    if (!grupo) return reply.code(404).send({ erro: 'Grupo não encontrado' })

    await prisma.$transaction(async (tx) => {
      if (body.nome) await tx.grupoTransmissao.update({ where: { id }, data: { nome: body.nome.trim() } })
      if (body.clienteIds) {
        const ids = await idsClientesValidos(request, lojaId, body.clienteIds)
        await tx.grupoMembro.deleteMany({ where: { grupoId: id } })
        await tx.grupoMembro.createMany({ data: ids.map((clienteId) => ({ grupoId: id, clienteId })) })
        await tx.grupoTransmissao.update({ where: { id }, data: { updatedAt: new Date() } })
      }
    })
    return { ok: true }
  })

  app.delete('/grupos/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const grupo = await prisma.grupoTransmissao.findFirst({ where: { id, ...escopoGrupo(request, lojaId) }, select: { id: true } })
    if (!grupo) return reply.code(404).send({ erro: 'Grupo não encontrado' })
    await prisma.grupoTransmissao.delete({ where: { id } })
    return { ok: true }
  })

  // Dispara uma mensagem para todos os membros (envio individual a cada um).
  app.post('/grupos/:id/disparar', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const { texto } = z.object({ texto: z.string().min(1) }).parse(request.body)

    const grupo = await prisma.grupoTransmissao.findFirst({
      where: { id, ...escopoGrupo(request, lojaId) },
      include: {
        membros: {
          include: {
            cliente: { select: { id: true, nome: true, telefone: true, consentimentoLgpd: true, segmento: true, totalGasto: true, ultimaCompraEm: true, vendedoraId: true } },
          },
        },
      },
    })
    if (!grupo) return reply.code(404).send({ erro: 'Grupo não encontrado' })
    if (grupo.membros.length === 0) return reply.code(422).send({ erro: 'Grupo sem membros.' })

    const resultado = await dispararParaClientes({
      lojaId,
      template: texto,
      origem: 'CAMPANHA',
      grupoId: grupo.id,
      vendedoraFallbackId: grupo.vendedoraId,
      clientes: grupo.membros.map((m) => m.cliente),
    })
    return resultado
  })
}

/** Garante que os clientes informados existem na loja e (para vendedora) na carteira dela. */
async function idsClientesValidos(request: { user: { role: string; sub: string } }, lojaId: string, clienteIds: string[]): Promise<string[]> {
  if (clienteIds.length === 0) return []
  const where: Prisma.ClienteWhereInput = { id: { in: clienteIds }, lojaId }
  if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
  const encontrados = await prisma.cliente.findMany({ where, select: { id: true } })
  return encontrados.map((c) => c.id)
}

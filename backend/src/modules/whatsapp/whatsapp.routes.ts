import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'

const instanciaSchema = z.object({
  vendedoraId: z.string().optional(), // gerente configura a instância de uma vendedora
  instancia: z.string().min(1),
  numero: z.string().min(8),
})

const webhookSchema = z.object({
  telefone: z.string().optional(),
  numero: z.string().optional(),
  texto: z.string().min(1),
  instancia: z.string().optional(),
})

export async function whatsappRoutes(app: FastifyInstance) {
  // Conecta a instância/número de WhatsApp da vendedora (mock; Evolution real via env)
  app.post('/instancia', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const b = instanciaSchema.parse(request.body)
    const alvoId = request.user.role === 'VENDEDORA' ? request.user.sub : b.vendedoraId
    if (!alvoId) return reply.code(422).send({ erro: 'Informe a vendedora' })

    const vend = await prisma.usuario.findFirst({ where: { id: alvoId, lojaId, role: { in: ['VENDEDORA', 'GERENTE'] } } })
    if (!vend) return reply.code(422).send({ erro: 'Vendedora inválida para esta loja' })

    return prisma.usuario.update({
      where: { id: alvoId },
      data: { waInstancia: b.instancia, waNumero: b.numero, waConectado: true },
      select: { id: true, nome: true, waInstancia: true, waNumero: true, waConectado: true },
    })
  })

  // Histórico de conversa de um cliente (respeita o isolamento de carteira)
  app.get('/conversas/:clienteId', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { clienteId } = request.params as { clienteId: string }
    const where: Prisma.MensagemWhatsappWhereInput = { clienteId, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    return prisma.mensagemWhatsapp.findMany({ where, orderBy: { createdAt: 'asc' }, take: 200 })
  })

  // Webhook da Evolution API — sem auth; roteia a mensagem para a vendedora dona do cliente
  app.post('/webhook', async (request, reply) => {
    const b = webhookSchema.parse(request.body)
    const numero = (b.telefone ?? b.numero ?? '').replace(/\D/g, '')
    if (!numero) return reply.code(400).send({ erro: 'telefone ausente' })

    const cliente = await prisma.cliente.findFirst({ where: { telefone: numero }, select: { id: true, lojaId: true, vendedoraId: true } })
    if (!cliente || !cliente.vendedoraId) return { roteado: false }

    const msg = await prisma.mensagemWhatsapp.create({
      data: {
        lojaId: cliente.lojaId, clienteId: cliente.id, vendedoraId: cliente.vendedoraId,
        direcao: 'RECEBIDA', status: 'RECEBIDA', origem: 'ENTRADA', telefone: numero, texto: b.texto,
      },
    })
    return { roteado: true, mensagemId: msg.id }
  })
}

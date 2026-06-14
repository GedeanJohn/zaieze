import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { enviarWhatsapp } from './whatsapp.service'

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

  // Caixa de entrada: conversas (clientes com mensagens), com a última mensagem de cada um.
  // VENDEDORA vê só a própria carteira; gerente/gestor veem a loja.
  app.get('/conversas', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const where: Prisma.MensagemWhatsappWhereInput = { lojaId, clienteId: { not: null } }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub

    // janela recente de mensagens; agrega por cliente em memória (1 conversa por cliente)
    const msgs = await prisma.mensagemWhatsapp.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { cliente: { select: { id: true, nome: true, telefone: true, segmento: true, vendedoraId: true } } },
    })

    const porCliente = new Map<string, {
      cliente: { id: string; nome: string; telefone: string; segmento: string; vendedoraId: string | null }
      ultimaMensagem: string; ultimaDirecao: string; ultimaEm: Date; mensagens: number; naoLidas: number
    }>()
    for (const m of msgs) {
      if (!m.cliente) continue
      const atual = porCliente.get(m.cliente.id)
      if (!atual) {
        porCliente.set(m.cliente.id, {
          cliente: m.cliente,
          ultimaMensagem: m.texto, ultimaDirecao: m.direcao, ultimaEm: m.createdAt,
          mensagens: 1, naoLidas: m.direcao === 'RECEBIDA' ? 1 : 0,
        })
      } else {
        atual.mensagens += 1
        if (m.direcao === 'RECEBIDA') atual.naoLidas += 1
      }
    }

    return [...porCliente.values()].sort((a, b) => b.ultimaEm.getTime() - a.ultimaEm.getTime())
  })

  // Histórico de conversa de um cliente (respeita o isolamento de carteira)
  app.get('/conversas/:clienteId', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { clienteId } = request.params as { clienteId: string }
    const where: Prisma.MensagemWhatsappWhereInput = { clienteId, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    return prisma.mensagemWhatsapp.findMany({ where, orderBy: { createdAt: 'asc' }, take: 200 })
  })

  // Responder a um cliente pela caixa de entrada (envio individual via Evolution; SIMULADA sem config)
  app.post('/conversas/:clienteId/responder', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { clienteId } = request.params as { clienteId: string }
    const { texto } = z.object({ texto: z.string().min(1) }).parse(request.body)

    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, lojaId } })
    if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado' })

    // VENDEDORA só responde a clientes da própria carteira
    if (request.user.role === 'VENDEDORA' && cliente.vendedoraId !== request.user.sub) {
      return reply.code(403).send({ erro: 'Cliente não está na sua carteira' })
    }

    // roteia pela vendedora dona do cliente; gerente sem dono usa a própria identidade
    const vendId = cliente.vendedoraId ?? (request.user.role === 'VENDEDORA' ? request.user.sub : null)
    if (!vendId) return reply.code(422).send({ erro: 'Cliente sem vendedora responsável — defina a carteira primeiro.' })
    const vend = await prisma.usuario.findUniqueOrThrow({ where: { id: vendId }, select: { waInstancia: true } })

    const status = await enviarWhatsapp({ instancia: vend.waInstancia, telefone: cliente.telefone, texto })
    return prisma.mensagemWhatsapp.create({
      data: {
        lojaId, clienteId, vendedoraId: vendId,
        direcao: 'ENVIADA', status, origem: 'MANUAL', telefone: cliente.telefone, texto,
      },
    })
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

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { enviarWhatsapp } from './whatsapp.service'
import { marcarLeadAtendido, garantirCicloAberto } from '../leads/leads.service'
import { evolutionConfigurado, criarInstancia, conectarInstancia, estadoInstancia } from './evolution.service'

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

/**
 * Roteia uma mensagem RECEBIDA para a vendedora dona do cliente (ou cria o cliente na
 * carteira da vendedora dona da instância que recebeu). Garante um ciclo aberto e loga.
 * Reusado pelo webhook normalizado e pelo webhook real do Evolution.
 */
async function rotearMensagemRecebida(params: { numero: string; texto: string; instancia?: string | null; nome?: string | null }) {
  const numero = params.numero.replace(/\D/g, '')
  if (!numero) return { roteado: false }

  let cliente = await prisma.cliente.findFirst({
    where: { telefone: numero },
    select: { id: true, lojaId: true, vendedoraId: true, loja: { select: { redeId: true } } },
  })

  if (!cliente && params.instancia) {
    const vend = await prisma.usuario.findFirst({
      where: { waInstancia: params.instancia, role: 'VENDEDORA', ativo: true },
      select: { id: true, lojaId: true },
    })
    if (vend?.lojaId) {
      cliente = await prisma.cliente.create({
        data: {
          lojaId: vend.lojaId, telefone: numero, nome: params.nome?.trim() || 'Cliente do WhatsApp',
          vendedoraId: vend.id, consentimentoLgpd: true, observacoes: 'Entrou pelo WhatsApp',
        },
        select: { id: true, lojaId: true, vendedoraId: true, loja: { select: { redeId: true } } },
      })
    }
  }

  if (!cliente || !cliente.vendedoraId) return { roteado: false }

  const ciclo = await garantirCicloAberto({
    lojaId: cliente.lojaId, vendedoraId: cliente.vendedoraId, redeId: cliente.loja.redeId,
    clienteId: cliente.id, telefone: numero, nome: params.nome,
  })
  const msg = await prisma.mensagemWhatsapp.create({
    data: {
      lojaId: cliente.lojaId, clienteId: cliente.id, vendedoraId: cliente.vendedoraId,
      direcao: 'RECEBIDA', status: 'RECEBIDA', origem: 'ENTRADA', telefone: numero, texto: params.texto,
    },
  })
  return { roteado: true, mensagemId: msg.id, novoLead: ciclo.novo }
}

/** Extrai o texto de um payload de mensagem do WhatsApp (vários formatos do Baileys). */
function textoDaMensagem(m: Record<string, unknown> | undefined): string {
  if (!m) return ''
  const ext = m.extendedTextMessage as { text?: string } | undefined
  const img = m.imageMessage as { caption?: string } | undefined
  const vid = m.videoMessage as { caption?: string } | undefined
  return (m.conversation as string) || ext?.text || img?.caption || vid?.caption || '[mídia]'
}

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

  // ─────────── Conexão real via Evolution (QR) ───────────
  // Cria/conecta a instância do usuário e dispara o QR (entregue pelo webhook QRCODE_UPDATED).
  app.post('/instancia/conectar', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { vendedoraId } = z.object({ vendedoraId: z.string().optional() }).parse(request.body ?? {})
    const alvoId = request.user.role === 'VENDEDORA' ? request.user.sub : vendedoraId
    if (!alvoId) return reply.code(422).send({ erro: 'Informe a vendedora' })
    const vend = await prisma.usuario.findFirst({ where: { id: alvoId, lojaId, role: { in: ['VENDEDORA', 'GERENTE'] } }, select: { id: true, waInstancia: true } })
    if (!vend) return reply.code(422).send({ erro: 'Vendedora inválida para esta loja' })
    if (!evolutionConfigurado()) return reply.code(503).send({ erro: 'WhatsApp não configurado no servidor (Evolution).' })

    const instancia = vend.waInstancia ?? `vend_${vend.id}`
    await prisma.usuario.update({ where: { id: vend.id }, data: { waInstancia: instancia, waConectado: false, waQrcode: null } })
    await criarInstancia(instancia)
    await conectarInstancia(instancia)
    return { instancia, status: 'aguardando_qr' }
  })

  // Status da conexão + QR (a vendedora faz polling enquanto escaneia).
  app.get('/instancia/status', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { vendedoraId } = request.query as { vendedoraId?: string }
    const alvoId = request.user.role === 'VENDEDORA' ? request.user.sub : (vendedoraId ?? request.user.sub)
    const vend = await prisma.usuario.findFirst({ where: { id: alvoId, lojaId }, select: { id: true, waInstancia: true, waNumero: true, waConectado: true, waQrcode: true } })
    if (!vend) return { conectado: false, qrcode: null, estado: 'close' }

    let estado = 'close'
    if (vend.waInstancia && evolutionConfigurado()) {
      estado = await estadoInstancia(vend.waInstancia)
      if (estado === 'open' && !vend.waConectado) {
        await prisma.usuario.update({ where: { id: vend.id }, data: { waConectado: true, waQrcode: null } })
        vend.waConectado = true; vend.waQrcode = null
      }
    }
    return { conectado: vend.waConectado, estado, qrcode: vend.waConectado ? null : vend.waQrcode, numero: vend.waNumero }
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
    const msg = await prisma.mensagemWhatsapp.create({
      data: {
        lojaId, clienteId, vendedoraId: vendId,
        direcao: 'ENVIADA', status, origem: 'MANUAL', telefone: cliente.telefone, texto,
      },
    })
    // A vendedora respondeu → fecha o SLA do lead aberto desse cliente ("atender = responder").
    await marcarLeadAtendido({ lojaId, clienteId })
    return msg
  })

  // Webhook NORMALIZADO (sem auth) — payload simples {telefone,texto,instancia}. Útil para testes.
  app.post('/webhook', async (request, reply) => {
    const b = webhookSchema.parse(request.body)
    const numero = (b.telefone ?? b.numero ?? '').replace(/\D/g, '')
    if (!numero) return reply.code(400).send({ erro: 'telefone ausente' })
    return rotearMensagemRecebida({ numero, texto: b.texto, instancia: b.instancia })
  })

  // Webhook REAL do Evolution API (sem auth; chamado internamente na rede Docker).
  // Trata QRCODE_UPDATED (guarda o QR), CONNECTION_UPDATE (marca conectado) e MESSAGES_UPSERT (roteia).
  app.post('/webhook/evolution', async (request) => {
    const body = request.body as { event?: string; instance?: string; data?: Record<string, unknown> }
    const evento = (body.event ?? '').toLowerCase()
    const instancia = body.instance
    const data = body.data ?? {}

    if (evento === 'qrcode.updated') {
      const q = data.qrcode as { base64?: string } | undefined
      const base64 = q?.base64 ?? (data.base64 as string | undefined)
      if (instancia && base64) await prisma.usuario.updateMany({ where: { waInstancia: instancia }, data: { waQrcode: base64 } })
      return { ok: true }
    }

    if (evento === 'connection.update') {
      const estado = (data.state as string | undefined) ?? ''
      if (instancia && estado === 'open') await prisma.usuario.updateMany({ where: { waInstancia: instancia }, data: { waConectado: true, waQrcode: null } })
      else if (instancia && estado === 'close') await prisma.usuario.updateMany({ where: { waInstancia: instancia }, data: { waConectado: false } })
      return { ok: true }
    }

    if (evento === 'messages.upsert') {
      const key = data.key as { remoteJid?: string; fromMe?: boolean } | undefined
      if (!key || key.fromMe) return { ok: true } // ignora as próprias mensagens (evita duplicar os envios)
      const jid = key.remoteJid ?? ''
      if (jid.endsWith('@g.us')) return { ok: true } // ignora grupos
      const numero = jid.split('@')[0] ?? ''
      await rotearMensagemRecebida({
        numero,
        texto: textoDaMensagem(data.message as Record<string, unknown> | undefined),
        instancia,
        nome: data.pushName as string | undefined,
      })
      return { ok: true }
    }

    return { ok: true }
  })
}

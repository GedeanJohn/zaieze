import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { lojaIdDe, redeIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { igConfigurado, cifrar, decifrar, podeCifrar, assinaturaValida, verificarContaIg, enviarTextoIg, type RedeIG } from './instagram.service'
import { marcarLeadAtendido, garantirCicloAberto } from '../leads/leads.service'

const JANELA_MS = 24 * 60 * 60 * 1000

const selectRedeConfig = { id: true, igBusinessAccountId: true, igTokenCifrado: true } as const

async function redeDaLoja(lojaId: string): Promise<RedeIG & { id: string } | null> {
  const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { rede: { select: selectRedeConfig } } })
  return loja?.rede ?? null
}

/** true se ainda dá para responder (≤24h da última DM recebida da pessoa). */
function dentroDaJanela(ultimaEntradaEm: Date | null | undefined): boolean {
  return !!ultimaEntradaEm && Date.now() - ultimaEntradaEm.getTime() < JANELA_MS
}

/**
 * Roteia uma DM RECEBIDA para a vendedora dona do cliente. Atualiza a janela de 24h
 * (igUltimaEntradaEm), garante um ciclo aberto e registra a mensagem.
 * Sem cliente correspondente (nem por igScopedId, nem por ref do catálogo) → sem roteamento.
 */
async function rotearMensagemInstagramRecebida(params: { igScopedId: string; texto: string; redeId: string; nome?: string | null }) {
  const sel = { id: true, lojaId: true, vendedoraId: true, loja: { select: { redeId: true } } } as const
  let cliente = await prisma.cliente.findFirst({
    where: { igScopedId: params.igScopedId, loja: { redeId: params.redeId } },
    select: sel,
  })

  // Handoff do catálogo: se não casou por igScopedId, usa o marcador (ref:<slug>) da mensagem
  // pra achar a vendedora dona do link e criar o cliente na carteira dela.
  if (!cliente || !cliente.vendedoraId) {
    const ref = params.texto.match(/\(ref:\s*([a-z0-9-]+)\)/i)?.[1]
    if (ref) {
      const vend = await prisma.usuario.findFirst({
        where: { slugCatalogo: ref, role: 'VENDEDORA', ativo: true, loja: { redeId: params.redeId } },
        select: { id: true, lojaId: true },
      })
      if (vend?.lojaId) {
        cliente = await prisma.cliente.upsert({
          where: { lojaId_igScopedId: { lojaId: vend.lojaId, igScopedId: params.igScopedId } },
          create: { lojaId: vend.lojaId, igScopedId: params.igScopedId, nome: params.nome?.trim() || 'Cliente do Instagram', vendedoraId: vend.id, consentimentoLgpd: true, observacoes: 'Entrou pelo Instagram (handoff do catálogo)' },
          update: {},
          select: sel,
        })
      }
    }
  }
  if (!cliente || !cliente.vendedoraId) return { roteado: false }

  await prisma.cliente.update({ where: { id: cliente.id }, data: { igUltimaEntradaEm: new Date() } })

  const ciclo = await garantirCicloAberto({
    lojaId: cliente.lojaId, vendedoraId: cliente.vendedoraId, redeId: cliente.loja.redeId,
    clienteId: cliente.id, nome: params.nome,
  })
  const msg = await prisma.mensagemInstagram.create({
    data: {
      lojaId: cliente.lojaId, clienteId: cliente.id, vendedoraId: cliente.vendedoraId,
      direcao: 'RECEBIDA', status: 'RECEBIDA', origem: 'ENTRADA', igScopedId: params.igScopedId, texto: params.texto,
    },
  })
  return { roteado: true, mensagemId: msg.id, lojaId: cliente.lojaId, novoLead: ciclo.novo }
}

const configSchema = z.object({
  igBusinessAccountId: z.string().min(1),
  igPageId: z.string().optional(),
  token: z.string().optional(), // access token; só vem quando muda
  igVerifyToken: z.string().min(6),
  igAppSecret: z.string().optional(),
})

export async function instagramRoutes(app: FastifyInstance) {
  // Mantém o rawBody (necessário para validar a assinatura X-Hub-Signature-256 do webhook).
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    ;(req as unknown as { rawBody?: Buffer }).rawBody = body as Buffer
    try { done(null, JSON.parse((body as Buffer).toString('utf8') || '{}')) } catch (e) { done(e as Error, undefined) }
  })

  // ─────────── Configuração da conta (Instagram Business) — GESTOR ───────────

  app.get('/config', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request) => {
    const redeId = redeIdDe(request)
    const r = await prisma.rede.findUniqueOrThrow({
      where: { id: redeId },
      select: {
        slug: true, igBusinessAccountId: true, igPageId: true, igUsername: true,
        igVerifyToken: true, igAppSecret: true, igTokenCifrado: true, igConectado: true, igConectadoEm: true,
      },
    })
    return {
      igBusinessAccountId: r.igBusinessAccountId,
      igPageId: r.igPageId,
      igUsername: r.igUsername,
      igVerifyToken: r.igVerifyToken,
      temToken: !!r.igTokenCifrado,
      temAppSecret: !!r.igAppSecret,
      conectado: r.igConectado,
      conectadoEm: r.igConectadoEm,
      webhookUrl: `${env.TENANT_SCHEME}://${r.slug}.${env.DOMINIO_BASE}/api/instagram/webhook/${r.slug}`,
      servidorPodeCifrar: podeCifrar(),
    }
  })

  // Grava a config; se houver conta + token válidos, valida no Graph e marca conectado.
  app.put('/config', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const b = configSchema.parse(request.body)

    const data: Prisma.RedeUpdateInput = {
      igBusinessAccountId: b.igBusinessAccountId,
      igPageId: b.igPageId ?? null,
      igVerifyToken: b.igVerifyToken,
      igAppSecret: b.igAppSecret ?? null,
    }
    if (b.token) {
      if (!podeCifrar()) return reply.code(422).send({ erro: 'Servidor sem WA_TOKEN_SECRET — não é possível guardar o token com segurança.' })
      data.igTokenCifrado = cifrar(b.token)
    }

    const atual = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { igTokenCifrado: true } })
    const tokenCifrado = b.token ? (data.igTokenCifrado as string) : atual.igTokenCifrado
    let conectado = false
    let username: string | undefined
    let erroTeste: string | undefined
    if (b.igBusinessAccountId && tokenCifrado) {
      const v = await verificarContaIg(b.igBusinessAccountId, decifrar(tokenCifrado))
      conectado = v.ok; username = v.username; erroTeste = v.erro
    }
    data.igConectado = conectado
    data.igConectadoEm = conectado ? new Date() : null
    if (conectado && username) data.igUsername = username

    await prisma.rede.update({ where: { id: redeId }, data })
    return { ok: true, conectado, username: username ?? null, erro: conectado ? null : erroTeste ?? null }
  })

  // Revalida as credenciais salvas — não existe "número de teste" no Instagram (só dá pra
  // mandar mensagem pra quem já mandou uma pra conta primeiro).
  app.post('/testar', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: selectRedeConfig })
    if (!igConfigurado(rede)) return reply.code(422).send({ erro: 'Configure a conta e o token antes de testar.' })
    const v = await verificarContaIg(rede.igBusinessAccountId!, decifrar(rede.igTokenCifrado!))
    if (!v.ok) return reply.code(502).send({ erro: v.erro ?? 'Falha ao validar a conexão.' })
    return { ok: true, username: v.username ?? null }
  })

  // ─────────── Caixa de entrada / conversas ───────────

  // ?vendedoraId= — usado pela supervisão (gerente/gestor) para espelhar só a carteira de uma vendedora.
  app.get('/conversas', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { vendedoraId } = request.query as { vendedoraId?: string }
    const where: Prisma.MensagemInstagramWhereInput = { lojaId, clienteId: { not: null } }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    else if (vendedoraId) where.vendedoraId = vendedoraId

    const msgs = await prisma.mensagemInstagram.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { cliente: { select: { id: true, nome: true, telefone: true, segmento: true, vendedoraId: true } } },
    })

    const porCliente = new Map<string, {
      cliente: { id: string; nome: string; telefone: string | null; segmento: string; vendedoraId: string | null }
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

  app.get('/conversas/:clienteId', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { clienteId } = request.params as { clienteId: string }
    const { vendedoraId } = request.query as { vendedoraId?: string }
    const where: Prisma.MensagemInstagramWhereInput = { clienteId, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    else if (vendedoraId) where.vendedoraId = vendedoraId
    return prisma.mensagemInstagram.findMany({ where, orderBy: { createdAt: 'asc' }, take: 200 })
  })

  // Responde uma DM. Sem template no Instagram: fora da janela de 24h não dá pra responder.
  app.post('/conversas/:clienteId/responder', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { clienteId } = request.params as { clienteId: string }
    const { texto } = z.object({ texto: z.string().min(1) }).parse(request.body)

    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, lojaId }, select: { id: true, igScopedId: true, vendedoraId: true, igUltimaEntradaEm: true } })
    if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado' })
    if (request.user.role === 'VENDEDORA' && cliente.vendedoraId !== request.user.sub) {
      return reply.code(403).send({ erro: 'Cliente não está na sua carteira' })
    }
    if (!cliente.igScopedId) return reply.code(422).send({ erro: 'Cliente sem Instagram cadastrado.' })
    const vendId = cliente.vendedoraId ?? (request.user.role === 'VENDEDORA' ? request.user.sub : null)
    if (!vendId) return reply.code(422).send({ erro: 'Cliente sem vendedora responsável — defina a carteira primeiro.' })

    const rede = await redeDaLoja(lojaId)
    if (rede && igConfigurado(rede) && !dentroDaJanela(cliente.igUltimaEntradaEm)) {
      return reply.code(422).send({ erro: 'Fora da janela de 24h — o Instagram só permite responder depois que a pessoa mandar mensagem de novo.' })
    }

    const r = rede ? await enviarTextoIg({ rede, igScopedId: cliente.igScopedId, texto }) : { status: 'SIMULADA' as const }
    const msg = await prisma.mensagemInstagram.create({
      data: {
        lojaId, clienteId, vendedoraId: vendId,
        direcao: 'ENVIADA', status: r.status, origem: 'MANUAL', igScopedId: cliente.igScopedId, texto,
        igMessageId: r.igMessageId ?? null,
      },
    })
    await marcarLeadAtendido({ lojaId, clienteId })
    return msg
  })

  // ─────────── Webhook oficial da Meta por tenant ───────────

  app.get('/webhook/:redeSlug', async (request, reply) => {
    const { redeSlug } = request.params as { redeSlug: string }
    const q = request.query as Record<string, string>
    const modo = q['hub.mode']; const token = q['hub.verify_token']; const challenge = q['hub.challenge']
    const rede = await prisma.rede.findUnique({ where: { slug: redeSlug }, select: { igVerifyToken: true } })
    if (modo === 'subscribe' && rede?.igVerifyToken && token === rede.igVerifyToken) {
      return reply.code(200).type('text/plain').send(challenge ?? '')
    }
    return reply.code(403).send('forbidden')
  })

  app.post('/webhook/:redeSlug', async (request, reply) => {
    const { redeSlug } = request.params as { redeSlug: string }
    const rede = await prisma.rede.findUnique({ where: { slug: redeSlug }, select: { id: true, igBusinessAccountId: true, igTokenCifrado: true, igAppSecret: true } })
    if (!rede) return reply.code(404).send({ ok: false })

    if (rede.igAppSecret) {
      const raw = (request as unknown as { rawBody?: Buffer }).rawBody
      const assinatura = request.headers['x-hub-signature-256'] as string | undefined
      if (!raw || !assinaturaValida(rede.igAppSecret, raw, assinatura)) {
        return reply.code(401).send({ ok: false })
      }
    }

    // Formato Messenger/Instagram: entry[].messaging[] = [{ sender:{id}, message:{text} }]
    const body = request.body as { entry?: { messaging?: Record<string, any>[] }[] }
    for (const entry of body.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        const igScopedId = String(ev.sender?.id ?? '')
        const texto = ev.message?.text as string | undefined
        if (!igScopedId || !texto || ev.message?.is_echo) continue // ignora eco de mensagens enviadas por nós
        await rotearMensagemInstagramRecebida({ igScopedId, texto, redeId: rede.id })
      }
    }
    return reply.code(200).send({ ok: true })
  })
}

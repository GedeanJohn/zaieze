import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma, StatusMensagem } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { lojaIdDe, redeIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { enviarWhatsapp, enviarWhatsappAudio } from './whatsapp.service'
import { metaConfigurado, cifrar, decifrar, podeCifrar, verificarNumero, enviarTexto, criarTemplateMeta, consultarTemplatesMeta, placeholdersDoCorpo, corpoParaMeta, mapearStatusTemplate } from './meta.service'
import { marcarLeadAtendido, garantirCicloAberto } from '../leads/leads.service'
import { transcodificarAudioOpus, salvarUploadLocal } from '../midia/midia.routes'
import { enviarParaR2 } from '../midia/r2.service'

const JANELA_MS = 24 * 60 * 60 * 1000

/** Config da WABA (número por marca) selecionada da Rede. */
type RedeConfig = {
  id: string
  waPhoneNumberId: string | null
  waTokenCifrado: string | null
}

const selectRedeConfig = { id: true, waPhoneNumberId: true, waTokenCifrado: true } as const

async function redeDaLoja(lojaId: string): Promise<RedeConfig | null> {
  const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { rede: { select: selectRedeConfig } } })
  return loja?.rede ?? null
}

/** true se ainda dá para enviar texto livre (≤24h da última mensagem recebida do cliente). */
function dentroDaJanela(ultimaEntradaEm: Date | null | undefined): boolean {
  return !!ultimaEntradaEm && Date.now() - ultimaEntradaEm.getTime() < JANELA_MS
}

/**
 * Roteia uma mensagem RECEBIDA para a vendedora dona do cliente. Atualiza a janela de 24h
 * (waUltimaEntradaEm), garante um ciclo aberto e registra a mensagem.
 * Com número por marca não há mais auto-criação por instância: se o cliente não existe na
 * rede (ou está sem vendedora), a mensagem fica sem roteamento (roteado:false).
 */
async function rotearMensagemRecebida(params: { numero: string; texto: string; redeId?: string | null; nome?: string | null }) {
  const numero = params.numero.replace(/\D/g, '')
  if (!numero) return { roteado: false }

  const cliente = await prisma.cliente.findFirst({
    where: { telefone: numero, ...(params.redeId ? { loja: { redeId: params.redeId } } : {}) },
    select: { id: true, lojaId: true, vendedoraId: true, loja: { select: { redeId: true } } },
  })
  if (!cliente || !cliente.vendedoraId) return { roteado: false }

  // Janela de 24h: marca o instante da última entrada do cliente.
  await prisma.cliente.update({ where: { id: cliente.id }, data: { waUltimaEntradaEm: new Date() } })

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

/** Extrai um texto exibível de uma mensagem da Cloud API (vários tipos). */
function textoMeta(m: Record<string, any>): string {
  switch (m.type) {
    case 'text': return m.text?.body ?? ''
    case 'image': return m.image?.caption ?? '[imagem]'
    case 'video': return m.video?.caption ?? '[vídeo]'
    case 'audio': return '[áudio]'
    case 'document': return m.document?.filename ?? '[documento]'
    case 'sticker': return '[figurinha]'
    case 'button': return m.button?.text ?? ''
    case 'interactive': return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '[interação]'
    default: return `[${m.type ?? 'mensagem'}]`
  }
}

const STATUS_META: Record<string, StatusMensagem> = {
  sent: 'ENVIADA', delivered: 'ENTREGUE', read: 'LIDA', failed: 'FALHA',
}

const configSchema = z.object({
  waPhoneNumberId: z.string().min(1),
  waWabaId: z.string().optional(),
  waNumeroExibicao: z.string().optional(),
  token: z.string().optional(), // token permanente (System User); só vem quando muda
  waVerifyToken: z.string().min(6),
  waAppSecret: z.string().optional(),
})

export async function whatsappRoutes(app: FastifyInstance) {
  // ─────────── Configuração da WABA (número oficial por marca) — GESTOR ───────────

  // Lê a config atual (sem expor o token). Inclui a URL do webhook a configurar na Meta.
  app.get('/config', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request) => {
    const redeId = redeIdDe(request)
    const r = await prisma.rede.findUniqueOrThrow({
      where: { id: redeId },
      select: {
        slug: true, waPhoneNumberId: true, waWabaId: true, waNumeroExibicao: true,
        waVerifyToken: true, waAppSecret: true, waTokenCifrado: true, waConectado: true, waConectadoEm: true,
      },
    })
    return {
      waPhoneNumberId: r.waPhoneNumberId,
      waWabaId: r.waWabaId,
      waNumeroExibicao: r.waNumeroExibicao,
      waVerifyToken: r.waVerifyToken,
      temToken: !!r.waTokenCifrado,
      temAppSecret: !!r.waAppSecret,
      conectado: r.waConectado,
      conectadoEm: r.waConectadoEm,
      webhookUrl: `${env.TENANT_SCHEME}://${r.slug}.${env.DOMINIO_BASE}/api/whatsapp/webhook/${r.slug}`,
      servidorPodeCifrar: podeCifrar(),
    }
  })

  // Grava a config; se houver número + token válidos, testa no Graph e marca conectado.
  app.put('/config', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const b = configSchema.parse(request.body)

    const data: Prisma.RedeUpdateInput = {
      waPhoneNumberId: b.waPhoneNumberId,
      waWabaId: b.waWabaId ?? null,
      waNumeroExibicao: b.waNumeroExibicao ?? null,
      waVerifyToken: b.waVerifyToken,
      waAppSecret: b.waAppSecret ?? null,
    }
    if (b.token) {
      if (!podeCifrar()) return reply.code(422).send({ erro: 'Servidor sem WA_TOKEN_SECRET — não é possível guardar o token com segurança.' })
      data.waTokenCifrado = cifrar(b.token)
    }

    // Testa a conexão (precisa de número + algum token: o novo ou o já salvo).
    const atual = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { waTokenCifrado: true } })
    const tokenCifrado = b.token ? (data.waTokenCifrado as string) : atual.waTokenCifrado
    let conectado = false
    let numero: string | undefined
    let erroTeste: string | undefined
    if (b.waPhoneNumberId && tokenCifrado) {
      const v = await verificarNumero(b.waPhoneNumberId, decifrar(tokenCifrado))
      conectado = v.ok; numero = v.numero; erroTeste = v.erro
    }
    data.waConectado = conectado
    data.waConectadoEm = conectado ? new Date() : null
    if (conectado && numero && !b.waNumeroExibicao) data.waNumeroExibicao = numero

    await prisma.rede.update({ where: { id: redeId }, data })
    return { ok: true, conectado, numero: numero ?? null, erro: conectado ? null : erroTeste ?? null }
  })

  // Envia uma mensagem de teste pelo número da marca (valida ponta a ponta).
  app.post('/testar', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { telefone } = z.object({ telefone: z.string().min(8) }).parse(request.body)
    const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: selectRedeConfig })
    if (!metaConfigurado(rede)) return reply.code(422).send({ erro: 'Configure o número e o token antes de testar.' })
    const r = await enviarTexto({ rede, telefone, texto: 'Mensagem de teste do ZAIEZE ✅ (WhatsApp oficial conectado).' })
    if (r.status === 'FALHA') return reply.code(502).send({ erro: r.erro ?? 'Falha ao enviar.' })
    return { ok: true, status: r.status, waMessageId: r.waMessageId ?? null }
  })

  // ─────────── Templates HSM (mensagens aprovadas p/ campanhas fora da janela de 24h) ───────────

  // Exemplos por placeholder (a Meta exige um exemplo por parâmetro {{n}} ao submeter).
  const EXEMPLO: Record<string, string> = {
    primeiroNome: 'Maria', nome: 'Maria Silva', loja: 'Loja Exemplo', vendedora: 'Ana',
    link: 'https://loja.zaieze.com/ana', diasSemCompra: '30', totalGasto: 'R$ 250,00', segmento: 'VIP',
  }
  const exemploDe = (v: string) => EXEMPLO[v] ?? 'exemplo'
  const slugMeta = (nome: string) =>
    nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'template'

  const templateSchema = z.object({
    nome: z.string().min(2).max(60),
    categoria: z.enum(['MARKETING', 'UTILITY']).default('MARKETING'),
    corpo: z.string().min(5).max(1024),
    idioma: z.string().default('pt_BR'),
  })

  app.get('/templates', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request) => {
    const redeId = redeIdDe(request)
    return prisma.templateWhatsapp.findMany({ where: { redeId }, orderBy: { createdAt: 'desc' } })
  })

  app.post('/templates', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const b = templateSchema.parse(request.body)
    const variaveis = placeholdersDoCorpo(b.corpo)
    const metaNome = slugMeta(b.nome)
    const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { waWabaId: true, waTokenCifrado: true } })
    const configurado = !!(rede.waWabaId && rede.waTokenCifrado)

    // Sem WABA conectada (modo simulado) → já entra APROVADO para permitir testar campanhas.
    // Com WABA → submete à Meta e fica com o status retornado (geralmente PENDENTE).
    let status: 'RASCUNHO' | 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'PAUSADO' = 'APROVADO'
    let metaId: string | null = null
    if (configurado) {
      const r = await criarTemplateMeta({
        wabaId: rede.waWabaId!, token: decifrar(rede.waTokenCifrado!), metaNome, idioma: b.idioma,
        categoria: b.categoria, corpoMeta: corpoParaMeta(b.corpo, variaveis), exemplos: variaveis.map(exemploDe),
      })
      if (!r.ok) return reply.code(502).send({ erro: r.erro ?? 'Falha ao submeter o template à Meta.' })
      status = mapearStatusTemplate(r.status); metaId = r.metaId ?? null
    }
    try {
      const t = await prisma.templateWhatsapp.create({
        data: { redeId, nome: b.nome, metaNome, idioma: b.idioma, categoria: b.categoria, corpo: b.corpo, variaveis, status, metaId },
      })
      return reply.code(201).send(t)
    } catch {
      return reply.code(409).send({ erro: 'Já existe um template com esse nome. Escolha outro.' })
    }
  })

  // Sincroniza o status dos templates com a Meta (aprovado/rejeitado/pausado).
  app.post('/templates/sync', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { waWabaId: true, waTokenCifrado: true } })
    if (!(rede.waWabaId && rede.waTokenCifrado)) return reply.code(422).send({ erro: 'Conecte a WABA antes de sincronizar.' })
    const remotos = await consultarTemplatesMeta(rede.waWabaId, decifrar(rede.waTokenCifrado))
    let n = 0
    for (const r of remotos) {
      const upd = await prisma.templateWhatsapp.updateMany({ where: { redeId, metaNome: r.name }, data: { status: mapearStatusTemplate(r.status), metaId: r.id } })
      n += upd.count
    }
    return { ok: true, sincronizados: n }
  })

  app.delete('/templates/:id', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }
    await prisma.templateWhatsapp.deleteMany({ where: { id, redeId } })
    return { ok: true }
  })

  // ─────────── Caixa de entrada / conversas ───────────

  // Conversas (clientes com mensagens), com a última mensagem de cada um.
  app.get('/conversas', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const where: Prisma.MensagemWhatsappWhereInput = { lojaId, clienteId: { not: null } }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub

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

  // Responder a um cliente (texto). Respeita a janela de 24h quando a marca está conectada.
  app.post('/conversas/:clienteId/responder', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { clienteId } = request.params as { clienteId: string }
    const { texto } = z.object({ texto: z.string().min(1) }).parse(request.body)

    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, lojaId }, select: { id: true, telefone: true, vendedoraId: true, waUltimaEntradaEm: true } })
    if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado' })
    if (request.user.role === 'VENDEDORA' && cliente.vendedoraId !== request.user.sub) {
      return reply.code(403).send({ erro: 'Cliente não está na sua carteira' })
    }
    const vendId = cliente.vendedoraId ?? (request.user.role === 'VENDEDORA' ? request.user.sub : null)
    if (!vendId) return reply.code(422).send({ erro: 'Cliente sem vendedora responsável — defina a carteira primeiro.' })

    const rede = await redeDaLoja(lojaId)
    // Conectada à Meta e fora da janela → texto livre não é permitido (precisa de template HSM).
    if (rede && metaConfigurado(rede) && !dentroDaJanela(cliente.waUltimaEntradaEm)) {
      return reply.code(422).send({ erro: 'Fora da janela de 24h. Para reabrir a conversa, use um template aprovado (campanha).' })
    }

    const r = rede ? await enviarWhatsapp({ rede, telefone: cliente.telefone, texto }) : { status: 'SIMULADA' as StatusMensagem }
    const msg = await prisma.mensagemWhatsapp.create({
      data: {
        lojaId, clienteId, vendedoraId: vendId,
        direcao: 'ENVIADA', status: r.status, origem: 'MANUAL', telefone: cliente.telefone, texto,
        waMessageId: r.waMessageId ?? null,
      },
    })
    await marcarLeadAtendido({ lojaId, clienteId })
    return msg
  })

  // Responder com MENSAGEM DE VOZ (PTT): grava o áudio (R2/local). O envio real do áudio pela
  // Cloud API entra na Fase 3 (upload de mídia); por ora registra como SIMULADA.
  app.post('/conversas/:clienteId/audio', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { clienteId } = request.params as { clienteId: string }
    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie o áudio no campo "file"' })
    if (!arquivo.mimetype.startsWith('audio/') && !arquivo.mimetype.startsWith('video/')) {
      return reply.code(422).send({ erro: 'Formato inválido. Envie um arquivo de áudio.' })
    }

    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, lojaId } })
    if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado' })
    if (request.user.role === 'VENDEDORA' && cliente.vendedoraId !== request.user.sub) {
      return reply.code(403).send({ erro: 'Cliente não está na sua carteira' })
    }
    const vendId = cliente.vendedoraId ?? (request.user.role === 'VENDEDORA' ? request.user.sub : null)
    if (!vendId) return reply.code(422).send({ erro: 'Cliente sem vendedora responsável — defina a carteira primeiro.' })

    let midiaUrl: string
    try {
      const ogg = await transcodificarAudioOpus(await arquivo.toBuffer())
      midiaUrl = (await enviarParaR2({ buffer: ogg, contentType: 'audio/ogg', ext: 'ogg', lojaId, pasta: 'audio' })) ?? (await salvarUploadLocal(ogg, 'ogg'))
    } catch (e) {
      request.log.error({ err: e }, 'falha ao processar áudio')
      return reply.code(500).send({ erro: 'Não foi possível processar o áudio. Tente novamente.' })
    }

    const rede = await redeDaLoja(lojaId)
    const r = rede ? await enviarWhatsappAudio({ rede, telefone: cliente.telefone, audioUrl: midiaUrl }) : { status: 'SIMULADA' as StatusMensagem }
    const msg = await prisma.mensagemWhatsapp.create({
      data: {
        lojaId, clienteId, vendedoraId: vendId,
        direcao: 'ENVIADA', status: r.status, origem: 'MANUAL', telefone: cliente.telefone,
        texto: '🎤 Mensagem de voz', tipoMidia: 'AUDIO', midiaUrl, waMessageId: r.waMessageId ?? null,
      },
    })
    await marcarLeadAtendido({ lojaId, clienteId })
    return msg
  })

  // ─────────── Webhooks ───────────

  // Webhook NORMALIZADO (sem auth) — payload simples {telefone,texto}. Útil para testes locais.
  app.post('/webhook', async (request, reply) => {
    const b = z.object({ telefone: z.string().optional(), numero: z.string().optional(), texto: z.string().min(1) }).parse(request.body)
    const numero = (b.telefone ?? b.numero ?? '').replace(/\D/g, '')
    if (!numero) return reply.code(400).send({ erro: 'telefone ausente' })
    return rotearMensagemRecebida({ numero, texto: b.texto })
  })

  // Webhook OFICIAL da Meta por tenant: /api/whatsapp/webhook/:redeSlug (sem auth).
  // GET = verificação (hub.challenge); POST = mensagens recebidas + status (entrega/leitura).
  app.get('/webhook/:redeSlug', async (request, reply) => {
    const { redeSlug } = request.params as { redeSlug: string }
    const q = request.query as Record<string, string>
    const modo = q['hub.mode']; const token = q['hub.verify_token']; const challenge = q['hub.challenge']
    const rede = await prisma.rede.findUnique({ where: { slug: redeSlug }, select: { waVerifyToken: true } })
    if (modo === 'subscribe' && rede?.waVerifyToken && token === rede.waVerifyToken) {
      return reply.code(200).type('text/plain').send(challenge ?? '')
    }
    return reply.code(403).send('forbidden')
  })

  app.post('/webhook/:redeSlug', async (request, reply) => {
    const { redeSlug } = request.params as { redeSlug: string }
    const rede = await prisma.rede.findUnique({ where: { slug: redeSlug }, select: { id: true } })
    if (!rede) return reply.code(404).send({ ok: false })

    // NOTA (Fase 1): a validação de X-Hub-Signature-256 (com Rede.waAppSecret) será ligada
    // quando o raw body do webhook estiver disponível (fastify-raw-body). Por ora confiamos no
    // verify token + phone_number_id + HTTPS.
    const body = request.body as { entry?: { changes?: { value?: Record<string, any> }[] }[] }
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}
        // mensagens recebidas
        for (const m of (value.messages ?? []) as Record<string, any>[]) {
          const numero = String(m.from ?? '').replace(/\D/g, '')
          const nome = value.contacts?.[0]?.profile?.name as string | undefined
          if (numero) await rotearMensagemRecebida({ numero, texto: textoMeta(m), redeId: rede.id, nome })
        }
        // recibos de status (sent/delivered/read/failed)
        for (const s of (value.statuses ?? []) as Record<string, any>[]) {
          const novo = STATUS_META[String(s.status)]
          if (s.id && novo) await prisma.mensagemWhatsapp.updateMany({ where: { waMessageId: String(s.id) }, data: { status: novo } })
        }
      }
    }
    return reply.code(200).send({ ok: true })
  })
}

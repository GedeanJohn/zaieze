import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma, StatusMensagem } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { lojaIdDe, redeIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { enviarWhatsapp, enviarWhatsappAudio, registrarMensagemRecebida } from './whatsapp.service'
import { estaConectado as baileysConectado } from './baileys.service'
import { metaConfigurado, cifrar, decifrar, podeCifrar, verificarNumero, enviarTexto, criarTemplateMeta, consultarTemplatesMeta, placeholdersDoCorpo, corpoParaMeta, mapearStatusTemplate, baixarMidia, extDoMime, assinaturaValida, techProviderConfigurado, trocarCodePorToken, inscreverWebhookWaba, registrarNumero } from './meta.service'
import { marcarLeadAtendido } from '../leads/leads.service'
import { transcodificarAudioOpus, salvarUploadLocal } from '../midia/midia.routes'
import { enviarParaR2 } from '../midia/r2.service'
import { contextoVendedoraIa } from '../vendedora-zaieze/vendedora-zaieze.service'

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
async function rotearMensagemRecebida(params: { numero: string; texto: string; redeId?: string | null; nome?: string | null }): Promise<
  { roteado: true; mensagemId: string; lojaId: string; novoLead: boolean } | { roteado: false }
> {
  const numero = params.numero.replace(/\D/g, '')
  if (!numero) return { roteado: false }

  const sel = { id: true, lojaId: true, vendedoraId: true, chatAtendimentoStatus: true, loja: { select: { redeId: true } } } as const
  let cliente = await prisma.cliente.findFirst({
    where: { telefone: numero, ...(params.redeId ? { loja: { redeId: params.redeId } } : {}) },
    select: sel,
  })

  // Handoff do catálogo pelo número da marca: se não casou por telefone, usa o marcador
  // (ref:<slug>) da mensagem para achar a vendedora dona do link e criar o cliente na carteira dela.
  if ((!cliente || !cliente.vendedoraId) && params.redeId) {
    const ref = params.texto.match(/\(ref:\s*([a-z0-9-]+)\)/i)?.[1]
    if (ref) {
      const vend = await prisma.usuario.findFirst({
        where: { slugCatalogo: ref, role: 'VENDEDORA', ativo: true, loja: { redeId: params.redeId } },
        select: { id: true, lojaId: true },
      })
      if (vend?.lojaId) {
        cliente = await prisma.cliente.upsert({
          where: { lojaId_telefone: { lojaId: vend.lojaId, telefone: numero } },
          create: { lojaId: vend.lojaId, telefone: numero, nome: params.nome?.trim() || 'Cliente do WhatsApp', vendedoraId: vend.id, consentimentoLgpd: true, observacoes: 'Entrou pelo WhatsApp (handoff do catálogo)' },
          update: {},
          select: sel,
        })
      }
    }
  }
  // Vendedora ZAIEZE: ninguém humano casou (nem telefone, nem ref de catálogo) — se a rede tem
  // o addon ativo e uma loja padrão configurada, ela assume o atendimento a partir daqui.
  if ((!cliente || !cliente.vendedoraId) && params.redeId) {
    const ctxIa = await contextoVendedoraIa(params.redeId)
    if (ctxIa) {
      cliente = await prisma.cliente.upsert({
        where: { lojaId_telefone: { lojaId: ctxIa.lojaId, telefone: numero } },
        create: {
          lojaId: ctxIa.lojaId, telefone: numero, nome: params.nome?.trim() || 'Cliente do WhatsApp',
          vendedoraId: ctxIa.usuarioIaId, consentimentoLgpd: true,
          observacoes: 'Entrou pelo WhatsApp — atendido pela Vendedora ZAIEZE',
        },
        update: {},
        select: sel,
      })
    }
  }

  if (!cliente || !cliente.vendedoraId) return { roteado: false }

  return registrarMensagemRecebida({ cliente: { ...cliente, vendedoraId: cliente.vendedoraId }, numero, texto: params.texto, nome: params.nome })
}

/** Extrai id/tipo de mídia de uma mensagem recebida da Cloud API (imagem/áudio/vídeo/doc). */
function midiaDaMensagem(m: Record<string, any>): { id: string; tipoMidia: string; pasta: 'fotos' | 'audio' | 'videos' } | null {
  if (m.type === 'image' && m.image?.id) return { id: m.image.id, tipoMidia: 'IMAGEM', pasta: 'fotos' }
  if (m.type === 'audio' && m.audio?.id) return { id: m.audio.id, tipoMidia: 'AUDIO', pasta: 'audio' }
  if (m.type === 'video' && m.video?.id) return { id: m.video.id, tipoMidia: 'VIDEO', pasta: 'videos' }
  return null
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

/** Processa UM `value` do payload do webhook oficial da Meta (mensagens recebidas + recibos de status). */
async function processarValorWebhook(rede: { id: string; waPhoneNumberId: string | null; waTokenCifrado: string | null }, value: Record<string, any>) {
  for (const m of (value.messages ?? []) as Record<string, any>[]) {
    const numero = String(m.from ?? '').replace(/\D/g, '')
    const nome = value.contacts?.[0]?.profile?.name as string | undefined
    if (!numero) continue
    const rot = await rotearMensagemRecebida({ numero, texto: textoMeta(m), redeId: rede.id, nome })

    // Mídia recebida: baixa da Meta → guarda no R2 → anexa à mensagem já registrada.
    const midia = midiaDaMensagem(m)
    if (rot.roteado && rot.mensagemId && rot.lojaId && midia && metaConfigurado(rede)) {
      const dl = await baixarMidia({ rede, mediaId: midia.id })
      if (dl) {
        const url = await enviarParaR2({ buffer: dl.buffer, contentType: dl.mime, ext: extDoMime(dl.mime), lojaId: rot.lojaId, pasta: midia.pasta })
        if (url) await prisma.mensagemWhatsapp.update({ where: { id: rot.mensagemId }, data: { tipoMidia: midia.tipoMidia, midiaUrl: url } })
      }
    }
  }
  // recibos de status (sent/delivered/read/failed)
  for (const s of (value.statuses ?? []) as Record<string, any>[]) {
    const novo = STATUS_META[String(s.status)]
    if (s.id && novo) await prisma.mensagemWhatsapp.updateMany({ where: { waMessageId: String(s.id) }, data: { status: novo } })
  }
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
  // Mantém o corpo CRU (rawBody) além do JSON parseado — necessário para validar a assinatura
  // X-Hub-Signature-256 do webhook oficial da Meta. Escopo encapsulado: só as rotas deste plugin.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    ;(req as unknown as { rawBody?: Buffer }).rawBody = body as Buffer
    try { done(null, JSON.parse((body as Buffer).toString('utf8') || '{}')) } catch (e) { done(e as Error, undefined) }
  })

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
      // Tech Provider / Embedded Signup: conexão em 1 clique (ver ConectarMetaTudo.tsx). App
      // ID/Config ID não são segredos — o App Secret nunca é exposto ao frontend.
      conexaoAutomaticaDisponivel: techProviderConfigurado(),
      metaAppId: env.META_APP_ID ?? null,
      metaConfigId: env.META_CONFIG_ID ?? null,
    }
  })

  // Conclui o Embedded Signup: troca o `code` por um token, inscreve o webhook central da ZAIEZE
  // na WABA do cliente e registra o número (best-effort — números que já vieram do wizard costumam
  // já estar registrados; erro nesse passo é esperado e ignorado).
  app.post('/embedded-signup/callback', { preHandler: [requireFeature('whatsapp'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { code, wabaId, phoneNumberId } = z.object({
      code: z.string().min(1), wabaId: z.string().min(1), phoneNumberId: z.string().min(1),
    }).parse(request.body)

    const troca = await trocarCodePorToken(code)
    if (!troca.ok || !troca.accessToken) return reply.code(502).send({ erro: troca.erro ?? 'Falha ao trocar o code por um token.' })
    const token = troca.accessToken

    const inscricao = await inscreverWebhookWaba(wabaId, token)
    if (!inscricao.ok) return reply.code(502).send({ erro: inscricao.erro ?? 'Falha ao inscrever o webhook na WABA.' })

    await registrarNumero(phoneNumberId, token) // best-effort: número já registrado é esperado e ignorado

    if (!podeCifrar()) return reply.code(422).send({ erro: 'Servidor sem WA_TOKEN_SECRET — não é possível guardar o token com segurança.' })

    const v = await verificarNumero(phoneNumberId, token)
    await prisma.rede.update({
      where: { id: redeId },
      data: {
        waPhoneNumberId: phoneNumberId, waWabaId: wabaId, waTokenCifrado: cifrar(token),
        waNumeroExibicao: v.numero ?? null, waConectado: v.ok, waConectadoEm: v.ok ? new Date() : null,
      },
    })
    return { ok: true, conectado: v.ok, numero: v.numero ?? null, erro: v.ok ? null : v.erro ?? null }
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
  // ?vendedoraId= — usado pela supervisão (gerente/gestor) para espelhar só a carteira de uma vendedora.
  app.get('/conversas', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { vendedoraId } = request.query as { vendedoraId?: string }
    const where: Prisma.MensagemWhatsappWhereInput = { lojaId, clienteId: { not: null } }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    else if (vendedoraId) where.vendedoraId = vendedoraId

    const msgs = await prisma.mensagemWhatsapp.findMany({
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

    // Nome da vendedora dona de cada card — útil pro gestor/gerente ver de quem é a conversa
    // (a própria vendedora já sabe que é dela, mas não custa nada incluir de qualquer forma).
    const vendedoraIds = [...new Set([...porCliente.values()].map((c) => c.cliente.vendedoraId).filter((v): v is string => !!v))]
    const vendedoras = vendedoraIds.length > 0
      ? await prisma.usuario.findMany({ where: { id: { in: vendedoraIds } }, select: { id: true, nome: true } })
      : []
    const nomeVendedora = new Map(vendedoras.map((v) => [v.id, v.nome]))

    return [...porCliente.values()]
      .map((c) => ({ ...c, vendedoraNome: c.cliente.vendedoraId ? nomeVendedora.get(c.cliente.vendedoraId) ?? null : null }))
      .sort((a, b) => b.ultimaEm.getTime() - a.ultimaEm.getTime())
  })

  // Histórico de conversa de um cliente (respeita o isolamento de carteira)
  app.get('/conversas/:clienteId', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { clienteId } = request.params as { clienteId: string }
    const { vendedoraId } = request.query as { vendedoraId?: string }
    const where: Prisma.MensagemWhatsappWhereInput = { clienteId, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    else if (vendedoraId) where.vendedoraId = vendedoraId
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
    if (!cliente.telefone) return reply.code(422).send({ erro: 'Cliente sem WhatsApp cadastrado — atenda pelo canal em que ele entrou (ex.: Instagram).' })
    const vendId = cliente.vendedoraId ?? (request.user.role === 'VENDEDORA' ? request.user.sub : null)
    if (!vendId) return reply.code(422).send({ erro: 'Cliente sem vendedora responsável — defina a carteira primeiro.' })

    const rede = await redeDaLoja(lojaId)
    const viaBaileys = baileysConectado(vendId)
    // Conectada à Meta e fora da janela → texto livre não é permitido (precisa de template HSM).
    // Não se aplica ao WhatsApp pessoal (Baileys) — número pessoal não tem janela de 24h da Meta.
    if (!viaBaileys && rede && metaConfigurado(rede) && !dentroDaJanela(cliente.waUltimaEntradaEm)) {
      return reply.code(422).send({ erro: 'Fora da janela de 24h. Para reabrir a conversa, use um template aprovado (campanha).' })
    }

    const r = viaBaileys || rede
      ? await enviarWhatsapp({ rede: rede ?? { waPhoneNumberId: null, waTokenCifrado: null }, telefone: cliente.telefone, texto, vendedoraId: vendId })
      : { status: 'SIMULADA' as StatusMensagem }
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

  // Responder com MENSAGEM DE VOZ (PTT): grava o áudio (R2/local p/ o chat) e envia pela Cloud API
  // (upload de mídia + tipo audio). Sem WABA conectada → registra SIMULADA.
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
    if (!cliente.telefone) return reply.code(422).send({ erro: 'Cliente sem WhatsApp cadastrado.' })
    const vendId = cliente.vendedoraId ?? (request.user.role === 'VENDEDORA' ? request.user.sub : null)
    if (!vendId) return reply.code(422).send({ erro: 'Cliente sem vendedora responsável — defina a carteira primeiro.' })

    let midiaUrl: string
    let ogg: Buffer
    try {
      ogg = await transcodificarAudioOpus(await arquivo.toBuffer())
      midiaUrl = (await enviarParaR2({ buffer: ogg, contentType: 'audio/ogg', ext: 'ogg', lojaId, pasta: 'audio' })) ?? (await salvarUploadLocal(ogg, 'ogg'))
    } catch (e) {
      request.log.error({ err: e }, 'falha ao processar áudio')
      return reply.code(500).send({ erro: 'Não foi possível processar o áudio. Tente novamente.' })
    }

    const rede = await redeDaLoja(lojaId)
    const viaBaileys = baileysConectado(vendId)
    const r = viaBaileys || rede
      ? await enviarWhatsappAudio({ rede: rede ?? { waPhoneNumberId: null, waTokenCifrado: null }, telefone: cliente.telefone, buffer: ogg, vendedoraId: vendId })
      : { status: 'SIMULADA' as StatusMensagem }
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
  // Desligado em produção: sem redeId, a busca de cliente por telefone é global entre tenants —
  // não pode ficar acessível publicamente fora de dev.
  app.post('/webhook', async (request, reply) => {
    if (process.env.NODE_ENV === 'production') return reply.code(404).send()
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
    const rede = await prisma.rede.findUnique({ where: { slug: redeSlug }, select: { id: true, waPhoneNumberId: true, waTokenCifrado: true, waAppSecret: true } })
    if (!rede) return reply.code(404).send({ ok: false })

    // Valida a assinatura X-Hub-Signature-256 quando a marca configurou o App Secret.
    // Sem App Secret, confiamos no verify token + phone_number_id + HTTPS.
    if (rede.waAppSecret) {
      const raw = (request as unknown as { rawBody?: Buffer }).rawBody
      const assinatura = request.headers['x-hub-signature-256'] as string | undefined
      if (!raw || !assinaturaValida(rede.waAppSecret, raw, assinatura)) {
        return reply.code(401).send({ ok: false })
      }
    }

    const body = request.body as { entry?: { changes?: { value?: Record<string, any> }[] }[] }
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        await processarValorWebhook(rede, change.value ?? {})
      }
    }
    return reply.code(200).send({ ok: true })
  })

  // Webhook CENTRAL do app Tech Provider da ZAIEZE: /api/whatsapp/webhook-central (sem auth por
  // rota — 1 único endpoint registrado no App Dashboard da Meta pra TODAS as WABAs conectadas via
  // Embedded Signup). Diferente do webhook por tenant acima: a marca é resolvida pelo
  // `phone_number_id` do payload, não pelo slug da URL.
  app.get('/webhook-central', async (request, reply) => {
    const q = request.query as Record<string, string>
    const modo = q['hub.mode']; const token = q['hub.verify_token']; const challenge = q['hub.challenge']
    if (modo === 'subscribe' && env.META_WEBHOOK_VERIFY_TOKEN && token === env.META_WEBHOOK_VERIFY_TOKEN) {
      return reply.code(200).type('text/plain').send(challenge ?? '')
    }
    return reply.code(403).send('forbidden')
  })

  app.post('/webhook-central', async (request, reply) => {
    // Valida a assinatura X-Hub-Signature-256 com o App Secret do Tech Provider (nível de App).
    if (env.META_APP_SECRET) {
      const raw = (request as unknown as { rawBody?: Buffer }).rawBody
      const assinatura = request.headers['x-hub-signature-256'] as string | undefined
      if (!raw || !assinaturaValida(env.META_APP_SECRET, raw, assinatura)) {
        return reply.code(401).send({ ok: false })
      }
    }

    const body = request.body as { entry?: { changes?: { value?: Record<string, any> }[] }[] }
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}
        const phoneNumberId = value.metadata?.phone_number_id as string | undefined
        if (!phoneNumberId) continue
        const rede = await prisma.rede.findFirst({ where: { waPhoneNumberId: phoneNumberId }, select: { id: true, waPhoneNumberId: true, waTokenCifrado: true } })
        if (!rede) continue
        await processarValorWebhook(rede, value)
      }
    }
    return reply.code(200).send({ ok: true })
  })
}

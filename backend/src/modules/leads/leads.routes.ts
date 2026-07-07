import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma, StatusLead } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import {
  ETAPAS_ABERTAS, escolherVendedoraDisponivel, redistribuirLead, redistribuirAtrasados, moverEtapa, situacaoLead, apertadoPctDaRede,
} from './leads.service'

/**
 * Funil de atendimento & vendas. Cada Lead = uma OPORTUNIDADE (ciclo de contato).
 * Etapas: ENTROU → ATENDIDO → NEGOCIANDO → CONVERTIDO / PERDIDO.
 * Portal do Cliente é ELITE → gate por feature portal_cliente.
 */

const ETAPAS: StatusLead[] = ['ENTROU', 'ATENDIDO', 'NEGOCIANDO', 'CONVERTIDO', 'PERDIDO']

const incluiLead = {
  vendedora: { select: { id: true, nome: true } },
  cliente: { select: { id: true, nome: true, telefone: true, cidade: true, uf: true } },
}

function decorar<T extends { status: StatusLead; prazoEm: Date; etapaDesde: Date; redistribuidoEm: Date | null }>(l: T, agora: number, apertadoPct?: number) {
  return {
    ...l,
    atrasado: ETAPAS_ABERTAS.includes(l.status) && l.prazoEm.getTime() < agora,
    situacao: situacaoLead(l, agora, apertadoPct),
  }
}

/** % de "apertado" da rede a partir da loja do escopo (deriva o redeId da loja). */
async function pctDaLoja(lojaId: string): Promise<number> {
  const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { redeId: true } })
  return apertadoPctDaRede(loja?.redeId ?? null)
}

export async function leadsRoutes(app: FastifyInstance) {
  // Lista plana (filtro por etapa). Vendedora vê só os próprios.
  app.get('/', { preHandler: [requireFeature('funil'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { status } = request.query as { status?: string }
    const where: Prisma.LeadWhereInput = { lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    if (status && ETAPAS.includes(status as StatusLead)) where.status = status as StatusLead

    const leads = await prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300, include: incluiLead })
    const agora = Date.now()
    const pct = await pctDaLoja(lojaId)
    return leads.map((l) => decorar(l, agora, pct))
  })

  // Pipeline: cards agrupados por etapa + métricas do funil.
  app.get('/pipeline', { preHandler: [requireFeature('funil'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const q = request.query as { vendedoraId?: string }
    const base: Prisma.LeadWhereInput = { lojaId }
    if (request.user.role === 'VENDEDORA') base.vendedoraId = request.user.sub
    else if (q.vendedoraId) base.vendedoraId = q.vendedoraId // filtro por vendedora (gestor/gerente)

    const leads = await prisma.lead.findMany({ where: base, orderBy: { etapaDesde: 'desc' }, take: 500, include: incluiLead })
    const agora = Date.now()
    const pct = await pctDaLoja(lojaId)

    const colunas: Record<string, ReturnType<typeof decorar>[]> = { ENTROU: [], ATENDIDO: [], NEGOCIANDO: [], CONVERTIDO: [], PERDIDO: [] }
    const porSituacao: Record<string, number> = {}
    let convertidos = 0, perdidos = 0, somaResposta = 0, comResposta = 0
    for (const l of leads) {
      const card = decorar(l, agora, pct)
      colunas[l.status].push(card)
      porSituacao[card.situacao.chave] = (porSituacao[card.situacao.chave] ?? 0) + 1
      if (l.status === 'CONVERTIDO') convertidos += 1
      if (l.status === 'PERDIDO') perdidos += 1
      if (l.atendidoEm) { somaResposta += l.atendidoEm.getTime() - l.createdAt.getTime(); comResposta += 1 }
    }
    const fechados = convertidos + perdidos
    const metricas = {
      total: leads.length,
      abertos: colunas.ENTROU.length + colunas.ATENDIDO.length + colunas.NEGOCIANDO.length,
      atrasados: [...colunas.ENTROU, ...colunas.ATENDIDO, ...colunas.NEGOCIANDO].filter((l) => l.atrasado).length,
      convertidos, perdidos,
      taxaConversao: fechados > 0 ? Math.round((convertidos / fechados) * 100) : 0,
      tempoMedioRespostaMin: comResposta > 0 ? Math.round(somaResposta / comResposta / 60_000) : null,
      porSituacao,
    }
    return { colunas, metricas }
  })

  app.get('/resumo', { preHandler: [requireFeature('funil'), app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const where: Prisma.LeadWhereInput = { lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    const agora = new Date()
    const [abertos, convertidos, atrasados] = await Promise.all([
      prisma.lead.count({ where: { ...where, status: { in: ETAPAS_ABERTAS } } }),
      prisma.lead.count({ where: { ...where, status: 'CONVERTIDO' } }),
      prisma.lead.count({ where: { ...where, status: { in: ETAPAS_ABERTAS }, prazoEm: { lt: agora } } }),
    ])
    return { abertos, convertidos, atrasados }
  })

  // Move o ciclo de etapa (manual). Vendedora move os próprios; gestor/gerente, qualquer um da loja.
  app.patch('/:id/etapa', { preHandler: [requireFeature('funil'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = z.object({ etapa: z.enum(['ENTROU', 'ATENDIDO', 'NEGOCIANDO', 'CONVERTIDO', 'PERDIDO']), motivoPerda: z.string().optional() }).parse(request.body)

    const lead = await prisma.lead.findFirst({ where: { id, lojaId }, include: { loja: { select: { redeId: true } } } })
    if (!lead) return reply.code(404).send({ erro: 'Ciclo não encontrado' })
    if (request.user.role === 'VENDEDORA' && lead.vendedoraId !== request.user.sub) {
      return reply.code(403).send({ erro: 'Este ciclo não está na sua carteira' })
    }
    return moverEtapa({ leadId: id, etapa: body.etapa, motivoPerda: body.motivoPerda, redeId: lead.loja.redeId })
  })

  // Redistribui um ciclo manualmente. Sem vendedoraId → escolhe a mais ociosa.
  app.post('/:id/redistribuir', { preHandler: [requireFeature('funil'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = z.object({ vendedoraId: z.string().optional() }).parse(request.body ?? {})

    const lead = await prisma.lead.findFirst({ where: { id, lojaId }, include: { loja: { select: { redeId: true } } } })
    if (!lead) return reply.code(404).send({ erro: 'Ciclo não encontrado' })

    let novaId = body.vendedoraId
    if (novaId) {
      const v = await prisma.usuario.findFirst({ where: { id: novaId, lojaId, role: 'VENDEDORA', ativo: true } })
      if (!v) return reply.code(422).send({ erro: 'Vendedora inválida para esta loja' })
    } else {
      novaId = (await escolherVendedoraDisponivel(lojaId, lead.vendedoraId)) ?? undefined
      if (!novaId) return reply.code(422).send({ erro: 'Nenhuma vendedora disponível para redistribuir' })
    }
    return redistribuirLead(id, novaId, lead.loja.redeId)
  })

  app.post('/redistribuir-atrasados', { preHandler: [requireFeature('funil'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async () => {
    const redistribuidos = await redistribuirAtrasados()
    return { redistribuidos }
  })
}

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { dispararParaClientes } from './disparo.service'
import { sugerirMensagem } from './ia.service'

const SEGMENTOS = ['NOVO', 'FREQUENTE', 'VIP', 'INATIVO', 'ATACADO'] as const

const selCliente = {
  id: true, nome: true, telefone: true, consentimentoLgpd: true,
  segmento: true, totalGasto: true, ultimaCompraEm: true, vendedoraId: true,
} as const

const criarSchema = z.object({
  nome: z.string().min(2),
  segmento: z.enum(SEGMENTOS).optional(),
  clienteIds: z.array(z.string()).optional(),
  mensagemTemplate: z.string().min(5),
})

const sugerirSchema = z.object({ segmento: z.enum(SEGMENTOS).optional(), contexto: z.string().optional() })

/** Vendedora só age sobre a própria carteira; gerente/gestor sobre toda a loja. */
function filtroCarteira(request: FastifyRequest, lojaId: string): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = { lojaId, ativo: true }
  if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
  return where
}

export async function campanhasRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireFeature('whatsapp'))

  // Sugestão de mensagem (IA quando há chave; senão modelo do segmento)
  app.post('/sugerir', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request) => {
    const body = sugerirSchema.parse(request.body)
    return sugerirMensagem(body)
  })

  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    return prisma.campanha.findMany({
      where: { lojaId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { criadaPor: { select: { nome: true } } },
    })
  })

  // Cria a campanha e dispara para o público-alvo (segmento ou lista de clientes)
  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarSchema.parse(request.body)

    const where = filtroCarteira(request, lojaId)
    if (body.segmento) where.segmento = body.segmento
    if (body.clienteIds?.length) where.id = { in: body.clienteIds }

    const clientes = await prisma.cliente.findMany({ where, select: selCliente })
    if (clientes.length === 0) return reply.code(422).send({ erro: 'Nenhum cliente no público-alvo selecionado' })

    const campanha = await prisma.campanha.create({
      data: { lojaId, criadaPorId: request.user.sub, nome: body.nome, segmentoAlvo: body.segmento ?? null, mensagemTemplate: body.mensagemTemplate },
    })

    const res = await dispararParaClientes({
      lojaId, template: body.mensagemTemplate, origem: 'CAMPANHA',
      campanhaId: campanha.id, clientes, vendedoraFallbackId: request.user.sub,
    })

    await prisma.campanha.update({
      where: { id: campanha.id },
      data: { enviados: res.enviados, simulados: res.simulados, falhas: res.falhas, semConsentimento: res.semConsentimento },
    })

    return reply.code(201).send({ campanhaId: campanha.id, ...res })
  })
}

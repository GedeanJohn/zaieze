import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { dispararParaClientes } from './disparo.service'

const GESTAO = ['SUPER_ADMIN', 'GESTOR', 'GERENTE'] as const

const selCliente = {
  id: true, nome: true, telefone: true, consentimentoLgpd: true,
  segmento: true, totalGasto: true, ultimaCompraEm: true, vendedoraId: true,
} as const

const upsertSchema = z.object({
  dias: z.coerce.number().int().positive(),
  mensagemTemplate: z.string().min(5),
  ativa: z.boolean().default(true),
})

const DEBOUNCE_DIAS = 7 // não reenvia régua ao mesmo cliente dentro deste prazo

/** Réguas de inatividade (30/60/90/180 dias) — módulo 10 da spec. */
export async function reguasRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireFeature('whatsapp'))

  app.get('/', { preHandler: [app.authorize(...GESTAO)] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    return prisma.reguaInatividade.findMany({ where: { lojaId }, orderBy: { dias: 'asc' } })
  })

  app.post('/', { preHandler: [app.authorize(...GESTAO)] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const b = upsertSchema.parse(request.body)
    return prisma.reguaInatividade.upsert({
      where: { lojaId_dias: { lojaId, dias: b.dias } },
      create: { lojaId, dias: b.dias, mensagemTemplate: b.mensagemTemplate, ativa: b.ativa },
      update: { mensagemTemplate: b.mensagemTemplate, ativa: b.ativa },
    })
  })

  // Processa as réguas: cada cliente entra na janela [dias, próxima régua)
  app.post('/processar', { preHandler: [app.authorize(...GESTAO)] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const reguas = await prisma.reguaInatividade.findMany({ where: { lojaId, ativa: true }, orderBy: { dias: 'asc' } })
    if (reguas.length === 0) return { reguas: [] }

    const clientes = await prisma.cliente.findMany({
      where: { lojaId, ativo: true, ultimaCompraEm: { not: null }, consumidorOutro: false },
      select: selCliente,
    })
    const desde = new Date(Date.now() - DEBOUNCE_DIAS * 86_400_000)
    const recentes = new Set(
      (await prisma.mensagemWhatsapp.findMany({ where: { lojaId, origem: 'REGUA', createdAt: { gte: desde } }, select: { clienteId: true } }))
        .map((m) => m.clienteId)
        .filter((id): id is string => !!id),
    )

    const limiares = reguas.map((r) => r.dias)
    const out: { dias: number; alcance: number; enviados: number; simulados: number; falhas: number; semConsentimento: number; semVendedora: number }[] = []

    for (let i = 0; i < reguas.length; i += 1) {
      const r = reguas[i]
      const proxima = limiares[i + 1] ?? Infinity
      const alvo = clientes.filter((c) => {
        const d = Math.floor((Date.now() - c.ultimaCompraEm!.getTime()) / 86_400_000)
        return d >= r.dias && d < proxima && !recentes.has(c.id)
      })
      const res = await dispararParaClientes({ lojaId, template: r.mensagemTemplate, origem: 'REGUA', clientes: alvo, vendedoraFallbackId: request.user.sub })
      alvo.forEach((c) => recentes.add(c.id))
      out.push({ dias: r.dias, ...res })
    }

    return { reguas: out }
  })
}

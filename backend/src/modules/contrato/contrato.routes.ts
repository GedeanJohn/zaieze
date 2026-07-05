import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { redeIdDe } from '../../plugins/auth'
import { montarContrato } from './contrato.template'
import { montarContratoDaRede, registrarAceite, statusReaceite } from './contrato.service'

/** Contrato de prestação de serviços (SaaS) — leitura, status de aceite e aceite eletrônico. */
export async function contratoRoutes(app: FastifyInstance) {
  // Termos genéricos (público) — leitura prévia na landing/checkout
  app.get('/termos', async (request) => {
    const { idioma } = request.query as { idioma?: string }
    return { contrato: montarContrato({ idioma }) }
  })

  // Status do aceite — QUALQUER usuário logado da rede (alimenta o banner do painel)
  app.get('/status', { preHandler: [app.authenticate] }, async (request) => {
    const redeId = request.user.redeId
    if (!redeId) return { aceito: true, pendente: false, prazo: null, diasRestantes: null, versao: '' }
    return statusReaceite(redeId)
  })

  // Contrato personalizado da rede + status (GESTOR/SUPER_ADMIN)
  app.get('/meu', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const { idioma } = request.query as { idioma?: string }
    const [contrato, status] = await Promise.all([montarContratoDaRede(redeId, idioma), statusReaceite(redeId)])
    return { contrato, ...status }
  })

  // Registrar o aceite eletrônico da versão vigente (GESTOR/SUPER_ADMIN)
  app.post('/aceitar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const { idioma } = z.object({ idioma: z.enum(['pt', 'en', 'en-gb', 'es']).optional() }).parse(request.body ?? {})
    const u = await prisma.usuario.findUnique({
      where: { id: request.user.sub },
      select: { nome: true, email: true },
    })
    const r = await registrarAceite(redeId, {
      nome: u?.nome ?? request.user.nome,
      email: u?.email ?? '',
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      idioma,
    })
    return { ok: true, ...r }
  })
}

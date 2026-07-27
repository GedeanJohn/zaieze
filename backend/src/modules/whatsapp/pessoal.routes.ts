import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma'
import { requireFeature } from '../../plugins/planos'
import { iniciarConexao, desconectar } from './baileys.service'

/**
 * WhatsApp PESSOAL via QR Code (Baileys) — conexão individual da VENDEDORA, alternativa à
 * Cloud API oficial da marca (ver whatsapp.routes.ts). Cada vendedora conecta e desconecta
 * só a própria sessão (request.user.sub).
 */
export async function whatsappPessoalRoutes(app: FastifyInstance) {
  app.get('/status', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { waPessoalConectado: true, waPessoalConectadoEm: true, waPessoalNumero: true },
    })
    return {
      conectado: usuario.waPessoalConectado,
      conectadoEm: usuario.waPessoalConectadoEm,
      numero: usuario.waPessoalNumero,
    }
  })

  app.post('/conectar', { preHandler: [requireFeature('whatsapp'), app.authorize('VENDEDORA')] }, async (request) => {
    return iniciarConexao(request.user.sub)
  })

  app.post('/desconectar', { preHandler: [requireFeature('whatsapp'), app.authorize('VENDEDORA')] }, async (request) => {
    await desconectar(request.user.sub)
    return { ok: true }
  })
}

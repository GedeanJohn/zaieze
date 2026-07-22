import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { redeIdDe } from '../../plugins/auth'
import { montarTermosUso } from './termos-uso.template'
import {
  montarTermosUsoDaRede, registrarAceiteTermosUso, statusReaceiteTermosUso,
  registrarAceiteTermosUsoAssessor, statusReaceiteTermosUsoAssessor,
} from './termos-uso.service'

/**
 * Termos de Uso e Responsabilidade — leitura, status de aceite e aceite eletrônico.
 *
 * Mesmo espírito do módulo `privacidade`: o aceite de uma nova versão é registrado
 * automaticamente no primeiro uso autenticado do GESTOR/SUPER_ADMIN após a publicação
 * (ver POST /aceitar), com aviso por banner e link para o changelog (`historico`).
 */
export async function termosUsoRoutes(app: FastifyInstance) {
  app.get('/termos', async (request) => {
    const { idioma } = request.query as { idioma?: string }
    return { termosUso: montarTermosUso({ idioma }) }
  })

  app.get('/status', { preHandler: [app.authenticate] }, async (request) => {
    const redeId = request.user.redeId
    if (!redeId) return { aceito: true, pendente: false, prazo: null, diasRestantes: null, versao: '' }
    return statusReaceiteTermosUso(redeId)
  })

  // Documento + histórico de mudanças + status do aceite — qualquer usuário logado da rede
  // (os termos valem para todos; só o registro do aceite em si é do GESTOR/SUPER_ADMIN)
  app.get('/meu', { preHandler: [app.authenticate] }, async (request) => {
    const redeId = redeIdDe(request)
    const { idioma } = request.query as { idioma?: string }
    const [termosUso, status] = await Promise.all([montarTermosUsoDaRede(redeId, idioma), statusReaceiteTermosUso(redeId)])
    return { termosUso, ...status }
  })

  app.post('/aceitar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const { idioma } = z.object({ idioma: z.enum(['pt', 'en', 'en-gb', 'es']).optional() }).parse(request.body ?? {})
    const u = await prisma.usuario.findUnique({ where: { id: request.user.sub }, select: { nome: true, email: true } })
    const r = await registrarAceiteTermosUso(redeId, {
      nome: u?.nome ?? request.user.nome,
      email: u?.email ?? '',
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      idioma,
    })
    return { ok: true, ...r }
  })

  // ─────── Escopo Assessor (Brand Partner) — mesmo espírito, sem job de distrato ───────
  app.get('/assessor/status', { preHandler: [app.authorize('ASSESSORA')] }, async (request) => {
    const assessor = await prisma.assessor.findUniqueOrThrow({ where: { usuarioId: request.user.sub } })
    return statusReaceiteTermosUsoAssessor(assessor.id)
  })

  app.post('/assessor/aceitar', { preHandler: [app.authorize('ASSESSORA')] }, async (request) => {
    const assessor = await prisma.assessor.findUniqueOrThrow({ where: { usuarioId: request.user.sub } })
    const { idioma } = z.object({ idioma: z.enum(['pt', 'en', 'en-gb', 'es']).optional() }).parse(request.body ?? {})
    const u = await prisma.usuario.findUnique({ where: { id: request.user.sub }, select: { nome: true, email: true } })
    const r = await registrarAceiteTermosUsoAssessor(assessor.id, {
      nome: u?.nome ?? '',
      email: u?.email ?? '',
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      idioma,
    })
    return { ok: true, ...r }
  })
}

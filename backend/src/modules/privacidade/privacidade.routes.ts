import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { redeIdDe } from '../../plugins/auth'
import { montarPrivacidade } from './privacidade.template'
import {
  montarPrivacidadeDaRede, registrarAceitePrivacidade, statusReaceitePrivacidade,
  registrarAceitePrivacidadeAssessor, statusReaceitePrivacidadeAssessor,
} from './privacidade.service'

/**
 * Política de Privacidade — leitura, status de aceite e aceite eletrônico.
 *
 * Só diz respeito ao GESTOR/SUPER_ADMIN: é o GESTOR quem representa o Contratante (a pessoa
 * jurídica da marca) perante a ZAIEZE; os demais papéis (GERENTE/VENDEDORA/ESTOQUISTA) são
 * colaboradores/empregados do Contratante, não parte no contrato — por isso nem o status nem o
 * documento aparecem pra eles.
 *
 * Diferente do Contrato SaaS (aceite por clique explícito em /contrato), aqui o aceite
 * de uma nova versão é registrado automaticamente no primeiro uso autenticado do
 * GESTOR/SUPER_ADMIN após a publicação (ver POST /aceitar, chamado pelo próprio Layout
 * do painel) — o usuário é avisado por banner com link para o changelog (`historico`).
 */
export async function privacidadeRoutes(app: FastifyInstance) {
  // Leitura pública (landing/checkout)
  app.get('/termos', async (request) => {
    const { idioma } = request.query as { idioma?: string }
    return { privacidade: montarPrivacidade({ idioma }) }
  })

  // Status do aceite — só GESTOR/SUPER_ADMIN (alimenta o banner do painel)
  app.get('/status', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = request.user.redeId
    if (!redeId) return { aceito: true, pendente: false, prazo: null, diasRestantes: null, versao: '' }
    return statusReaceitePrivacidade(redeId)
  })

  // Documento + histórico de mudanças + status do aceite — só GESTOR/SUPER_ADMIN
  app.get('/meu', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const { idioma } = request.query as { idioma?: string }
    const [privacidade, status] = await Promise.all([montarPrivacidadeDaRede(redeId, idioma), statusReaceitePrivacidade(redeId)])
    return { privacidade, ...status }
  })

  // Registra o aceite (automático, disparado pelo painel no 1º carregamento após a pendência aparecer)
  app.post('/aceitar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const { idioma } = z.object({ idioma: z.enum(['pt', 'en', 'en-gb', 'es']).optional() }).parse(request.body ?? {})
    const u = await prisma.usuario.findUnique({ where: { id: request.user.sub }, select: { nome: true, email: true } })
    const r = await registrarAceitePrivacidade(redeId, {
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
    return statusReaceitePrivacidadeAssessor(assessor.id)
  })

  app.post('/assessor/aceitar', { preHandler: [app.authorize('ASSESSORA')] }, async (request) => {
    const assessor = await prisma.assessor.findUniqueOrThrow({ where: { usuarioId: request.user.sub } })
    const { idioma } = z.object({ idioma: z.enum(['pt', 'en', 'en-gb', 'es']).optional() }).parse(request.body ?? {})
    const u = await prisma.usuario.findUnique({ where: { id: request.user.sub }, select: { nome: true, email: true } })
    const r = await registrarAceitePrivacidadeAssessor(assessor.id, {
      nome: u?.nome ?? '',
      email: u?.email ?? '',
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      idioma,
    })
    return { ok: true, ...r }
  })
}

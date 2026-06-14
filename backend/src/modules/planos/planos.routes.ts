import type { FastifyInstance } from 'fastify'
import { FEATURE_MIN_PLANO, PLANOS } from '../../plugins/planos'

/** Catálogo de planos + matriz de features + plano atual da rede (para a tela de upgrade). */
export async function planosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    return { planos: PLANOS, features: FEATURE_MIN_PLANO, atual: request.user.plano ?? null }
  })
}

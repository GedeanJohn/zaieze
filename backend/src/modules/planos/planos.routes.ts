import type { FastifyInstance } from 'fastify'
import { FEATURE_MIN_PLANO } from '../../plugins/planos'
import { listarPlanos } from './planos.service'

/** Catálogo de planos (preço do banco) + matriz de features + plano atual da rede (tela de upgrade). */
export async function planosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    return { planos: await listarPlanos(), features: FEATURE_MIN_PLANO, atual: request.user.plano ?? null }
  })
}

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ZodError } from 'zod'
import { env } from './env'
import { registrarAuth } from './plugins/auth'
import { authRoutes } from './modules/auth/auth.routes'
import { redesRoutes } from './modules/redes/redes.routes'
import { lojasRoutes } from './modules/lojas/lojas.routes'
import { equipesRoutes } from './modules/equipes/equipes.routes'
import { usuariosRoutes } from './modules/usuarios/usuarios.routes'
import { clientesRoutes } from './modules/clientes/clientes.routes'
import { produtosRoutes } from './modules/produtos/produtos.routes'
import { vendasRoutes } from './modules/vendas/vendas.routes'
import { estoqueRoutes } from './modules/estoque/estoque.routes'
import { transferenciasRoutes } from './modules/transferencias/transferencias.routes'
import { estoquistasRoutes } from './modules/estoquistas/estoquistas.routes'
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes'
import { campanhasRoutes } from './modules/whatsapp/campanhas.routes'
import { reguasRoutes } from './modules/whatsapp/reguas.routes'
import { radarRoutes } from './modules/radar/radar.routes'
import { comissoesRoutes } from './modules/comissao/comissoes.routes'
import { rankingRoutes } from './modules/comissao/ranking.routes'
import { muralRoutes } from './modules/mural/mural.routes'
import { provadorRoutes } from './modules/provador/provador.routes'
import { atacadoRoutes } from './modules/atacado/atacado.routes'
import { planosRoutes } from './modules/planos/planos.routes'
import { assinaturasRoutes } from './modules/assinaturas/assinaturas.routes'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'

export async function buildApp() {
  const app = Fastify({ logger: true })

  await app.register(cors, { origin: env.CORS_ORIGIN.split(',') })
  await registrarAuth(app)

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        erro: 'Dados inválidos',
        detalhes: error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      })
    }
    const err = error as { statusCode?: number; message?: string }
    const statusCode = err.statusCode ?? 500
    if (statusCode >= 500) app.log.error(error)
    return reply.code(statusCode).send({ erro: statusCode >= 500 ? 'Erro interno' : err.message ?? 'Erro' })
  })

  app.get('/health', async () => ({ status: 'ok', servico: 'modacrm-api', versao: '0.1.0' }))

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(redesRoutes, { prefix: '/api/redes' })
  await app.register(lojasRoutes, { prefix: '/api/lojas' })
  await app.register(equipesRoutes, { prefix: '/api/equipes' })
  await app.register(usuariosRoutes, { prefix: '/api/usuarios' })
  await app.register(clientesRoutes, { prefix: '/api/clientes' })
  await app.register(produtosRoutes, { prefix: '/api/produtos' })
  await app.register(vendasRoutes, { prefix: '/api/vendas' })
  await app.register(estoqueRoutes, { prefix: '/api/estoque' })
  await app.register(transferenciasRoutes, { prefix: '/api/transferencias' })
  await app.register(estoquistasRoutes, { prefix: '/api/estoquistas' })
  await app.register(whatsappRoutes, { prefix: '/api/whatsapp' })
  await app.register(campanhasRoutes, { prefix: '/api/campanhas' })
  await app.register(reguasRoutes, { prefix: '/api/reguas' })
  await app.register(radarRoutes, { prefix: '/api/radar' })
  await app.register(comissoesRoutes, { prefix: '/api/comissoes' })
  await app.register(rankingRoutes, { prefix: '/api/ranking' })
  await app.register(muralRoutes, { prefix: '/api/mural' })
  await app.register(provadorRoutes, { prefix: '/api/provador' })
  await app.register(atacadoRoutes, { prefix: '/api/atacado' })
  await app.register(planosRoutes, { prefix: '/api/planos' })
  await app.register(assinaturasRoutes, { prefix: '/api/assinaturas' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })

  return app
}

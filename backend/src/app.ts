import path from 'node:path'
import fs from 'node:fs'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
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
import { colecoesRoutes } from './modules/colecoes/colecoes.routes'
import { marcaRoutes } from './modules/marca/marca.routes'
import { leadsRoutes } from './modules/leads/leads.routes'
import { catalogoRoutes } from './modules/catalogo/catalogo.routes'

export async function buildApp() {
  // trustProxy: lê o IP real do cliente via X-Forwarded-For (atrás do nginx) — necessário p/ rate limit por IP
  const app = Fastify({ logger: true, trustProxy: true })

  await app.register(cors, { origin: env.CORS_ORIGIN.split(',') })
  // Rate limit desligado por padrão (global:false); habilitado por rota (ex.: login) via config.rateLimit
  await app.register(rateLimit, { global: false })
  // Upload (logo da marca) + arquivos estáticos servidos sob /api/uploads (já roteado pelos proxies)
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } })
  const uploadsDir = path.resolve(process.cwd(), env.UPLOAD_DIR)
  fs.mkdirSync(uploadsDir, { recursive: true })
  await app.register(fastifyStatic, { root: uploadsDir, prefix: '/api/uploads/' })
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
  await app.register(colecoesRoutes, { prefix: '/api/colecoes' })
  await app.register(marcaRoutes, { prefix: '/api/marca' })
  await app.register(leadsRoutes, { prefix: '/api/leads' })
  await app.register(catalogoRoutes, { prefix: '/api/catalogo' })

  return app
}

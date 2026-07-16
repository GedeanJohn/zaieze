import path from 'node:path'
import fs from 'node:fs'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
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
import { reservasRoutes } from './modules/reservas/reservas.routes'
import { orcamentosRoutes } from './modules/orcamentos/orcamentos.routes'
import { estoquistasRoutes } from './modules/estoquistas/estoquistas.routes'
import { convitesRoutes } from './modules/convites/convites.routes'
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes'
import { gruposRoutes } from './modules/whatsapp/grupos.routes'
import { campanhasRoutes } from './modules/whatsapp/campanhas.routes'
import { reguasRoutes } from './modules/whatsapp/reguas.routes'
import { radarRoutes } from './modules/radar/radar.routes'
import { comissoesRoutes } from './modules/comissao/comissoes.routes'
import { rankingRoutes } from './modules/comissao/ranking.routes'
import { muralRoutes } from './modules/mural/mural.routes'
import { atacadoRoutes } from './modules/atacado/atacado.routes'
import { planosRoutes } from './modules/planos/planos.routes'
import { assinaturasRoutes } from './modules/assinaturas/assinaturas.routes'
import { contratoRoutes } from './modules/contrato/contrato.routes'
import { metasRoutes } from './modules/metas/metas.routes'
import { adminRoutes } from './modules/admin/admin.routes'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'
import { colecoesRoutes } from './modules/colecoes/colecoes.routes'
import { marcaRoutes } from './modules/marca/marca.routes'
import { leadsRoutes } from './modules/leads/leads.routes'
import { catalogoRoutes } from './modules/catalogo/catalogo.routes'
import { midiaRoutes } from './modules/midia/midia.routes'
import { instagramRoutes } from './modules/instagram/instagram.routes'
import { afiliadosRoutes } from './modules/afiliados/afiliados.routes'
import { provadorRoutes } from './modules/provador/provador.routes'
import { addonsRoutes } from './modules/addons/addons.routes'
import { assessoresRoutes } from './modules/assessores/assessores.routes'
import { vendedoraZaiezeRoutes } from './modules/vendedora-zaieze/vendedora-zaieze.routes'
import { recebimentoRoutes } from './modules/recebimento/recebimento.routes'

export async function buildApp() {
  // trustProxy: lê o IP real do cliente via X-Forwarded-For (atrás do nginx) — necessário p/ rate limit por IP
  const app = Fastify({ logger: true, trustProxy: true })

  await app.register(cors, { origin: env.CORS_ORIGIN.split(',') })
  // Rate limit desligado por padrão (global:false); habilitado por rota (ex.: login) via config.rateLimit
  await app.register(rateLimit, { global: false })
  // Upload (logo da marca) + arquivos estáticos servidos sob /api/uploads (já roteado pelos proxies)
  await app.register(multipart, { limits: { fileSize: 60 * 1024 * 1024 } })
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
    // Violação de unicidade do banco (P2002) → 409 com mensagem clara (evita "Erro interno" genérico).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const alvo = Array.isArray(error.meta?.target) ? (error.meta?.target as string[]) : []
      const msg =
        alvo.includes('slugCatalogo') ? 'Esse slug do catálogo já está em uso nesta loja. Escolha outro.'
        : alvo.includes('email') ? 'Esse e-mail já está cadastrado.'
        : alvo.includes('telefone') ? 'Já existe um cadastro com esse telefone.'
        : alvo.includes('slug') ? 'Esse endereço (slug) já está em uso.'
        : 'Já existe um registro com esse valor (duplicado).'
      return reply.code(409).send({ erro: msg })
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
  await app.register(reservasRoutes, { prefix: '/api/reservas' })
  await app.register(orcamentosRoutes, { prefix: '/api/orcamentos' })
  await app.register(estoquistasRoutes, { prefix: '/api/estoquistas' })
  await app.register(convitesRoutes, { prefix: '/api/convites' })
  await app.register(whatsappRoutes, { prefix: '/api/whatsapp' })
  await app.register(gruposRoutes, { prefix: '/api/whatsapp' })
  await app.register(campanhasRoutes, { prefix: '/api/campanhas' })
  await app.register(reguasRoutes, { prefix: '/api/reguas' })
  await app.register(radarRoutes, { prefix: '/api/radar' })
  await app.register(comissoesRoutes, { prefix: '/api/comissoes' })
  await app.register(rankingRoutes, { prefix: '/api/ranking' })
  await app.register(muralRoutes, { prefix: '/api/mural' })
  await app.register(atacadoRoutes, { prefix: '/api/atacado' })
  await app.register(planosRoutes, { prefix: '/api/planos' })
  await app.register(assinaturasRoutes, { prefix: '/api/assinaturas' })
  await app.register(contratoRoutes, { prefix: '/api/contrato' })
  await app.register(metasRoutes, { prefix: '/api/metas' })
  await app.register(adminRoutes, { prefix: '/api/admin' })
  await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
  await app.register(colecoesRoutes, { prefix: '/api/colecoes' })
  await app.register(marcaRoutes, { prefix: '/api/marca' })
  await app.register(leadsRoutes, { prefix: '/api/leads' })
  await app.register(catalogoRoutes, { prefix: '/api/catalogo' })
  await app.register(midiaRoutes, { prefix: '/api/midia' })
  await app.register(instagramRoutes, { prefix: '/api/instagram' })
  await app.register(afiliadosRoutes, { prefix: '/api/afiliados' })
  await app.register(provadorRoutes, { prefix: '/api/provador' })
  await app.register(addonsRoutes, { prefix: '/api/addons' })
  await app.register(assessoresRoutes, { prefix: '/api/assessores' })
  await app.register(vendedoraZaiezeRoutes, { prefix: '/api/vendedora-zaieze' })
  await app.register(recebimentoRoutes, { prefix: '/api/recebimento' })

  return app
}

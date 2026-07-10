import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { redeIdDe } from '../../plugins/auth'
import { criarPreapproval, mpConfigurado } from '../assinaturas/mercadopago.service'
import { listarAddons, precoDoAddon, proximoCicloFimAddon, solicitarCancelamentoAddon, reativarAddon } from './addon.service'

const TIPOS = ['PROVADOR'] as const
const NOMES: Record<(typeof TIPOS)[number], string> = { PROVADOR: 'Provador Virtual' }
const tipoParamSchema = z.object({ tipo: z.enum(TIPOS) })

function urlTenant(slug: string): string {
  return `${env.TENANT_SCHEME}://${slug}.${env.DOMINIO_BASE}`
}

/**
 * Add-ons: recursos vendidos à parte de qualquer plano (START/PRO/ELITE) — cada tipo tem sua
 * própria recorrência no Mercado Pago, independente da assinatura principal da rede.
 */
export async function addonsRoutes(app: FastifyInstance) {
  // Catálogo público (consumido pela tela de Planos, já logado, e futuramente pela landing).
  app.get('/', async () => ({ addons: await listarAddons() }))

  // Add-ons da rede logada
  app.get('/minha', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const addons = await prisma.assinaturaAddon.findMany({ where: { redeId } })
    return { addons, mpConfigurado: mpConfigurado() }
  })

  // Assina um add-on (checkout). Rede já existe (gestor logado) — mais simples que o checkout
  // inicial: só precisa do e-mail do gestor e do slug, ambos já conhecidos.
  app.post('/:tipo/checkout', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { tipo } = tipoParamSchema.parse(request.params)
    const redeId = redeIdDe(request)
    const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId } })

    const existente = await prisma.assinaturaAddon.findUnique({ where: { redeId_tipo: { redeId, tipo } } })
    if (existente?.status === 'ATIVA') return reply.code(422).send({ erro: 'Este add-on já está ativo.' })

    const valor = await precoDoAddon(tipo)
    const simulada = !mpConfigurado()

    if (simulada) {
      await prisma.assinaturaAddon.upsert({
        where: { redeId_tipo: { redeId, tipo } },
        create: { redeId, tipo, valor, simulada: true, status: 'ATIVA', cicloFimEm: proximoCicloFimAddon() },
        update: { valor, simulada: true, status: 'ATIVA', mpPreapprovalId: null, cicloFimEm: proximoCicloFimAddon(), cancelamentoSolicitadoEm: null, cancelamentoOrigem: null },
      })
      return reply.code(201).send({ simulado: true, mensagem: 'Add-on ativado (modo simulado) — já está liberado.' })
    }

    const gestor = await prisma.usuario.findFirst({ where: { redeId, role: 'GESTOR' }, orderBy: { createdAt: 'asc' } })
    const pre = await criarPreapproval({
      reason: `ZAIEZE — Add-on ${NOMES[tipo]}`,
      valor,
      email: gestor?.email ?? '',
      redeSlug: rede.slug,
      backUrl: `${urlTenant(rede.slug)}/planos`,
    })
    await prisma.assinaturaAddon.upsert({
      where: { redeId_tipo: { redeId, tipo } },
      create: { redeId, tipo, valor, status: 'PENDENTE', mpPreapprovalId: pre.id },
      update: { valor, status: 'PENDENTE', mpPreapprovalId: pre.id },
    })
    return reply.code(201).send({ simulado: false, initPoint: pre.initPoint })
  })

  app.post('/:tipo/cancelar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { tipo } = tipoParamSchema.parse(request.params)
    const redeId = redeIdDe(request)
    const a = await prisma.assinaturaAddon.findUnique({ where: { redeId_tipo: { redeId, tipo } } })
    if (!a) return reply.code(404).send({ erro: 'Add-on não encontrado' })
    const origem = request.user.role === 'SUPER_ADMIN' ? 'ADMIN' : 'LOJISTA'
    const { acessoAte } = await solicitarCancelamentoAddon(redeId, tipo, origem)
    return { ok: true, acessoAte }
  })

  app.post('/:tipo/reativar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { tipo } = tipoParamSchema.parse(request.params)
    const redeId = redeIdDe(request)
    const ok = await reativarAddon(redeId, tipo)
    if (!ok) return reply.code(422).send({ erro: 'Add-on já encerrado — assine novamente.' })
    return { ok: true }
  })
}

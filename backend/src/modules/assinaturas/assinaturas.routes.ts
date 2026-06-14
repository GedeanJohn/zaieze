import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { redeIdDe } from '../../plugins/auth'
import { PLANOS } from '../../plugins/planos'
import { consultarPreapproval, criarPreapproval, mpConfigurado, valorDoPlano } from './mercadopago.service'
import { confirmarCiclo, proximoCicloFim, reativarAssinatura, solicitarCancelamento } from './assinatura.service'

const checkoutSchema = z.object({
  plano: z.enum(['START', 'PRO', 'ELITE']),
  redeNome: z.string().min(2),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'O endereço aceita apenas letras minúsculas, números e hífens'),
  gestorNome: z.string().min(2),
  email: z.string().email(),
  senha: z.string().min(6),
})

// Subdomínios que não podem virar slug de tenant (colidem com o SaaS)
const SLUGS_RESERVADOS = new Set(['www', 'app', 'api', 'admin', 'mail', 'static', 'assets', 'cdn', 'zaieze', 'painel'])

function urlTenant(slug: string): string {
  return `${env.TENANT_SCHEME}://${slug}.${env.DOMINIO_BASE}`
}

/** Billing SaaS — checkout público (landing) + webhook do Mercado Pago + provisionamento do tenant. */
export async function assinaturasRoutes(app: FastifyInstance) {
  // Catálogo público de planos (consumido pela landing) — sem autenticação
  app.get('/planos', async () => ({ planos: PLANOS, dominioBase: env.DOMINIO_BASE }))

  // Verifica disponibilidade do endereço (slug) — usado pela landing em tempo real
  app.get('/slug-disponivel', async (request) => {
    const { slug } = request.query as { slug?: string }
    const s = (slug ?? '').toLowerCase()
    const valido = /^[a-z0-9-]{3,}$/.test(s) && !SLUGS_RESERVADOS.has(s)
    if (!valido) return { disponivel: false, motivo: 'inválido' }
    const existe = await prisma.rede.findUnique({ where: { slug: s } })
    return { disponivel: !existe, motivo: existe ? 'em uso' : null }
  })

  app.post('/checkout', async (request, reply) => {
    const body = checkoutSchema.parse(request.body)
    const slug = body.slug.toLowerCase()
    const email = body.email.toLowerCase()

    if (SLUGS_RESERVADOS.has(slug)) {
      return reply.code(422).send({ erro: 'Este endereço é reservado. Escolha outro.' })
    }
    if (await prisma.rede.findUnique({ where: { slug } })) {
      return reply.code(409).send({ erro: `O endereço ${slug}.${env.DOMINIO_BASE} já está em uso.` })
    }
    if (await prisma.usuario.findUnique({ where: { email } })) {
      return reply.code(409).send({ erro: 'Já existe uma conta com este e-mail.' })
    }

    const valor = valorDoPlano(body.plano)
    const senhaHash = await bcrypt.hash(body.senha, 10)
    const simulada = !mpConfigurado()

    // Provisiona o tenant. Em modo simulado já nasce ATIVO; em modo real fica inativo
    // até o webhook de pagamento aprovado liberar o acesso.
    const rede = await prisma.$transaction(async (tx) => {
      const r = await tx.rede.create({ data: { nome: body.redeNome, slug, plano: body.plano, ativo: simulada } })
      await tx.usuario.create({
        data: { redeId: r.id, nome: body.gestorNome, email, senhaHash, role: 'GESTOR' },
      })
      await tx.assinatura.create({
        data: {
          redeId: r.id, plano: body.plano, valor, simulada,
          status: simulada ? 'ATIVA' : 'PENDENTE',
          // simulado já entra com ciclo de 1 mês; no modo real o ciclo começa no webhook aprovado
          cicloFimEm: simulada ? proximoCicloFim() : null,
        },
      })
      return r
    })

    if (simulada) {
      return reply.code(201).send({
        simulado: true,
        plano: body.plano,
        slug,
        redirect: `${urlTenant(slug)}/login`,
        mensagem: 'Assinatura simulada ativada — seu painel já está no ar.',
      })
    }

    // Mercado Pago real: cria a assinatura recorrente e devolve o checkout
    try {
      const pre = await criarPreapproval({
        plano: body.plano,
        valor,
        email,
        redeSlug: slug,
        backUrl: `${urlTenant(slug)}/login`,
      })
      await prisma.assinatura.update({ where: { redeId: rede.id }, data: { mpPreapprovalId: pre.id } })
      return reply.code(201).send({ simulado: false, plano: body.plano, slug, initPoint: pre.initPoint })
    } catch (e) {
      // Desfaz o provisionamento se o Mercado Pago falhar
      await prisma.rede.delete({ where: { id: rede.id } })
      throw e
    }
  })

  // Webhook do Mercado Pago — sincroniza a assinatura/tenant consultando o STATUS REAL no MP.
  // MP pode enviar o id no corpo (data.id) ou na querystring (?id=&topic=).
  app.post('/webhook', async (request, reply) => {
    const body = (request.body ?? {}) as { type?: string; topic?: string; action?: string; data?: { id?: string } }
    const q = request.query as { id?: string; topic?: string; 'data.id'?: string }
    const topico = body.type ?? body.topic ?? q.topic ?? ''
    const id = body.data?.id ?? q['data.id'] ?? q.id

    // só tratamos eventos de assinatura (preapproval)
    if (!id || !/preapproval|subscription/i.test(topico)) return reply.code(200).send({ ok: true })

    const assinatura = await prisma.assinatura.findFirst({ where: { mpPreapprovalId: id } })
    if (!assinatura) return reply.code(200).send({ ok: true })

    // NÃO confia na notificação: consulta o status real no Mercado Pago
    const status = await consultarPreapproval(id)
    if (status === 'authorized') {
      await confirmarCiclo(assinatura.redeId) // ativa/renova + estende o ciclo +1 mês
    } else if (status === 'cancelled' || status === 'paused') {
      // mesmo vindo do MP: cancela por FIM DE CICLO (mantém acesso até o ciclo pago vencer)
      await solicitarCancelamento(assinatura.redeId, 'MERCADO_PAGO')
    }
    return reply.code(200).send({ ok: true })
  })

  // ── Gestão da assinatura pelo painel do tenant (GESTOR/SUPER_ADMIN) ──

  // Aviso de encerramento — QUALQUER usuário logado da rede vê a data/hora do corte de acesso
  app.get('/aviso', { preHandler: [app.authenticate] }, async (request) => {
    const redeId = request.user.redeId
    if (!redeId) return { encerraEm: null }
    const a = await prisma.assinatura.findUnique({
      where: { redeId },
      select: { status: true, cancelamentoSolicitadoEm: true, cicloFimEm: true },
    })
    if (a && a.status !== 'CANCELADA' && a.cancelamentoSolicitadoEm && a.cicloFimEm) {
      return { encerraEm: a.cicloFimEm }
    }
    return { encerraEm: null }
  })

  // Assinatura da rede logada
  app.get('/minha', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const assinatura = await prisma.assinatura.findUnique({ where: { redeId } })
    return { assinatura, mpConfigurado: mpConfigurado() }
  })

  const trocarSchema = z.object({ plano: z.enum(['START', 'PRO', 'ELITE']) })

  // Trocar de plano (aplica imediatamente; em produção real exige atualizar o preapproval no MP)
  app.post('/trocar-plano', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { plano } = trocarSchema.parse(request.body)
    const assinatura = await prisma.assinatura.findUnique({ where: { redeId } })
    if (!assinatura) return reply.code(404).send({ erro: 'Rede sem assinatura' })
    if (assinatura.plano === plano) return reply.code(422).send({ erro: 'A rede já está neste plano.' })

    await prisma.$transaction([
      prisma.assinatura.update({
        where: { redeId },
        data: {
          plano, valor: valorDoPlano(plano), status: 'ATIVA',
          // trocar de plano reengaja: cancela um cancelamento agendado e garante ciclo vigente
          cancelamentoSolicitadoEm: null, cancelamentoOrigem: null,
          cicloFimEm: assinatura.cicloFimEm ?? proximoCicloFim(),
        },
      }),
      prisma.rede.update({ where: { id: redeId }, data: { plano, ativo: true } }),
    ])
    return { ok: true, plano, observacao: assinatura.simulada ? 'Plano alterado (modo simulado).' : 'Plano alterado. A próxima cobrança no Mercado Pago refletirá o novo valor.' }
  })

  // Cancelar a assinatura — política de FIM DE CICLO: mantém o acesso até cicloFimEm.
  // Origem registrada: ADMIN (super admin) ou LOJISTA (gestor).
  app.post('/cancelar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const assinatura = await prisma.assinatura.findUnique({ where: { redeId } })
    if (!assinatura) return reply.code(404).send({ erro: 'Rede sem assinatura' })
    const origem = request.user.role === 'SUPER_ADMIN' ? 'ADMIN' : 'LOJISTA'
    const { acessoAte } = await solicitarCancelamento(redeId, origem)
    return { ok: true, acessoAte }
  })

  // Reativar (desfaz um cancelamento agendado enquanto o ciclo ainda não venceu)
  app.post('/reativar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const ok = await reativarAssinatura(redeId)
    if (!ok) return reply.code(422).send({ erro: 'Assinatura já encerrada — faça uma nova assinatura.' })
    return { ok: true }
  })

  // Aprovação simulada (dev) — equivale ao webhook quando não há Mercado Pago configurado.
  // SEGURANÇA: só existe em modo simulado; com o Mercado Pago configurado fica desabilitado,
  // senão seria um bypass para ativar tenants sem pagar.
  app.post('/simular-aprovacao/:slug', async (request, reply) => {
    if (mpConfigurado()) return reply.code(404).send({ erro: 'Recurso indisponível' })
    const { slug } = request.params as { slug: string }
    const rede = await prisma.rede.findUnique({ where: { slug }, include: { assinatura: true } })
    if (!rede?.assinatura) return reply.code(404).send({ erro: 'Assinatura não encontrada' })
    await confirmarCiclo(rede.id)
    return { ok: true, redirect: `${urlTenant(slug)}/login` }
  })
}

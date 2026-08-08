import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { redeIdDe, redeIdDeQualquer } from '../../plugins/auth'
import { normalizarTelefone } from '../../lib/telefone'
import { validarCodigo, descricaoBeneficio, aplicarDesconto } from '../promo/promo.service'
import {
  precoAssentoVendedora, solicitarAssentoVendedora, aprovarAssentoVendedora, recusarAssentoVendedora,
  solicitarCancelamentoAssentoVendedora, reativarAssentoVendedora, aplicarCupomAssentoVendedora,
} from './assinatura-vendedora.service'

const num = (v: unknown) => Number(v ?? 0)

/**
 * Assento de vendedora — a cobrança do SaaS nasce POR VENDEDORA (substitui os 3 planos por
 * Rede). Comprado pelo GESTOR ou pelo GERENTE ativo; quando é o GERENTE quem solicita, fica
 * aguardando aprovação do GESTOR antes de qualquer cobrança real (ver
 * assinatura-vendedora.service.ts). Mesmo padrão de rotas do Chat de Atendimento.
 */
export async function vendedoraBillingRoutes(app: FastifyInstance) {
  // Preço vigente do assento — público (landing + tela de contratação).
  app.get('/preco', async () => ({ preco: await precoAssentoVendedora() }))

  // Preview do cupom antes de contratar (o gestor/gerente digita o código recebido do gestor da
  // marca/SUPER_ADMIN e vê o benefício antes de confirmar). Autenticado só pra manter no mesmo
  // padrão das outras rotas do módulo — a validação em si não expõe nada sensível.
  app.get('/codigo-promo', { preHandler: [app.authorize('GESTOR', 'GERENTE', 'SUPER_ADMIN')] }, async (request) => {
    const { codigo } = request.query as { codigo?: string }
    const c = await validarCodigo(codigo, 'VENDEDORA')
    if (!c) return { valido: false }
    const preco = await precoAssentoVendedora()
    const valorComDesconto = c.tipo === 'DIAS_GRATIS' ? preco : aplicarDesconto(preco, c)
    return { valido: true, beneficio: descricaoBeneficio(c), tipo: c.tipo, valorComDesconto }
  })

  // Assentos da rede logada. GESTOR/SUPER_ADMIN vê todos; GERENTE só o que ele mesmo solicitou
  // (aprovado ou não) — não deve enxergar assentos que o gestor comprou diretamente.
  app.get('/minhas', { preHandler: [app.authorize('GESTOR', 'GERENTE', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const where = request.user.role === 'GERENTE' ? { redeId, solicitadoPorId: request.user.sub } : { redeId }
    const assinaturas = await prisma.assinaturaVendedora.findMany({
      where, orderBy: { createdAt: 'asc' },
      include: { vendedora: { select: { id: true, nome: true } }, convite: { select: { nome: true, email: true, telefone: true } } },
    })
    return {
      assinaturas: assinaturas.map((a) => ({
        id: a.id, status: a.status, valor: num(a.valor), simulada: a.simulada,
        cicloFimEm: a.cicloFimEm, cancelamentoSolicitadoEm: a.cancelamentoSolicitadoEm, aprovadoEm: a.aprovadoEm,
        vendedoraId: a.vendedoraId, vendedoraNome: a.vendedora?.nome ?? a.convite?.nome ?? null,
      })),
    }
  })

  // Contrata um novo assento (cria o convite da vendedora + o billing). GESTOR/SUPER_ADMIN segue
  // direto pra cobrança; GERENTE fica aguardando aprovação do gestor.
  const checkoutSchema = z.object({
    nome: z.string().min(2),
    email: z.string().email(),
    telefone: z.string().min(8, 'Informe o WhatsApp com DDD').transform(normalizarTelefone),
    lojaId: z.string().optional(), // obrigatório pra GESTOR/SUPER_ADMIN; GERENTE usa a própria loja
    equipeId: z.string().optional(),
    codigoPromo: z.string().optional(),
  })
  app.post('/checkout', { preHandler: [app.authorize('GESTOR', 'GERENTE', 'SUPER_ADMIN')] }, async (request, reply) => {
    const body = checkoutSchema.parse(request.body)
    const redeId = await redeIdDeQualquer(request)
    const lojaId = request.user.role === 'GERENTE' ? request.user.lojaId : body.lojaId
    if (!lojaId) return reply.code(422).send({ erro: 'Informe a loja da nova vendedora.' })

    const r = await solicitarAssentoVendedora({
      redeId, lojaId, equipeId: body.equipeId ?? null,
      nome: body.nome, email: body.email, telefone: body.telefone,
      solicitadoPorId: request.user.sub, solicitadoPorRole: request.user.role,
      codigoPromo: body.codigoPromo,
    })
    if (!r.ok) return reply.code(422).send({ erro: r.erro })
    if (r.aguardandoAprovacao) {
      return reply.code(202).send({ aguardandoAprovacao: true, id: r.assinaturaId, mensagem: 'Solicitação enviada para aprovação do gestor.' })
    }
    return reply.code(201).send({ aguardandoAprovacao: false, id: r.assinaturaId, simulado: r.simulado, initPoint: r.initPoint })
  })

  // Solicitações de GERENTE aguardando aprovação — só o dono da rede vê.
  app.get('/pendentes-aprovacao', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const pendentes = await prisma.assinaturaVendedora.findMany({
      where: { redeId, aprovadoEm: null, status: { not: 'CANCELADA' } },
      orderBy: { createdAt: 'asc' },
      include: { convite: { select: { nome: true, email: true, telefone: true } }, solicitadoPor: { select: { nome: true } } },
    })
    return {
      pendentes: pendentes.map((a) => ({
        id: a.id, valor: num(a.valor), createdAt: a.createdAt,
        nome: a.convite?.nome ?? null, email: a.convite?.email ?? null, telefone: a.convite?.telefone ?? null,
        solicitadoPorNome: a.solicitadoPor.nome,
      })),
    }
  })

  app.post('/:id/aprovar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const r = await aprovarAssentoVendedora(id, request.user.sub)
    if (!r.ok) return reply.code(422).send({ erro: r.erro })
    return { ok: true, simulado: r.simulado, initPoint: r.initPoint }
  })

  app.post('/:id/recusar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const r = await recusarAssentoVendedora(id, request.user.sub)
    if (!r.ok) return reply.code(422).send({ erro: r.erro })
    return { ok: true }
  })

  app.post('/:id/cancelar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
    if (!a || a.redeId !== redeId) return reply.code(404).send({ erro: 'Assento não encontrado.' })
    const origem = request.user.role === 'SUPER_ADMIN' ? 'ADMIN' : 'GESTOR'
    const r = await solicitarCancelamentoAssentoVendedora(id, origem)
    return { ok: true, acessoAte: r.acessoAte }
  })

  // Aplica um cupom a um assento PENDENTE já existente (ex.: gestor esqueceu de usar na hora do
  // convite e prefere resolver com cupom em vez de pagar). Zera o valor → ativa na hora; desconto
  // parcial → devolve um novo initPoint com o valor já descontado.
  app.post('/:id/aplicar-cupom', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const { codigo } = z.object({ codigo: z.string().min(1) }).parse(request.body)
    const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
    if (!a || a.redeId !== redeId) return reply.code(404).send({ erro: 'Assento não encontrado.' })
    const r = await aplicarCupomAssentoVendedora(id, codigo)
    if (!r.ok) return reply.code(422).send({ erro: r.erro })
    return { ok: true, simulado: r.simulado, initPoint: r.initPoint }
  })

  app.post('/:id/reativar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
    if (!a || a.redeId !== redeId) return reply.code(404).send({ erro: 'Assento não encontrado.' })
    const ok = await reativarAssentoVendedora(id)
    if (!ok) return reply.code(422).send({ erro: 'Assento já encerrado — solicite um novo.' })
    return { ok: true }
  })
}

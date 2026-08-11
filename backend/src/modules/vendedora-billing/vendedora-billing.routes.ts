import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { redeIdDe, redeIdDeQualquer } from '../../plugins/auth'
import { normalizarTelefone } from '../../lib/telefone'
import { validarCodigo, descricaoBeneficio, aplicarDesconto } from '../promo/promo.service'
import { obterInitPointPreapproval } from '../assinaturas/mercadopago.service'
import { precoParaQuantidade } from './faixa-desconto.service'
import {
  solicitarAssentoVendedora, aprovarAssentoVendedora, recusarAssentoVendedora,
  cancelarAssentoVendedora, reativarAssentoVendedora, aplicarCupomAssentoVendedora,
} from './assinatura-vendedora.service'

const num = (v: unknown) => Number(v ?? 0)

/**
 * Assento de vendedora = MEMBRO (quem ocupa a vaga) — ver assinatura-vendedora.service.ts. A
 * cobrança em si é CONSOLIDADA por marca, com desconto por volume (ver GET /rede e
 * assinatura-vendedora-rede.service.ts). Comprado pelo GESTOR ou pelo GERENTE; quando é o
 * GERENTE quem solicita, fica aguardando aprovação do GESTOR antes de contar pra cobrança.
 */
export async function vendedoraBillingRoutes(app: FastifyInstance) {
  // Preço de referência (1ª vendedora) — público (landing + tela de contratação). Com `?qtd=`,
  // devolve o valor TOTAL real daquela faixa (não o preço unitário × quantidade, que ignora o
  // desconto por volume) — usado pela calculadora da landing.
  app.get('/preco', async (request) => {
    const { qtd } = request.query as { qtd?: string }
    const quantidade = qtd ? Math.max(1, Number(qtd) || 1) : 1
    return { preco: await precoParaQuantidade(quantidade) }
  })

  // Preview do cupom antes de contratar (o gestor/gerente digita o código recebido do gestor da
  // marca/SUPER_ADMIN e vê o benefício antes de confirmar). Autenticado só pra manter no mesmo
  // padrão das outras rotas do módulo — a validação em si não expõe nada sensível.
  app.get('/codigo-promo', { preHandler: [app.authorize('GESTOR', 'GERENTE', 'SUPER_ADMIN')] }, async (request) => {
    const { codigo } = request.query as { codigo?: string }
    const c = await validarCodigo(codigo, 'VENDEDORA')
    if (!c) return { valido: false }
    const preco = await precoParaQuantidade(1)
    const valorComDesconto = c.tipo === 'DIAS_GRATIS' ? preco : aplicarDesconto(preco, c)
    return { valido: true, beneficio: descricaoBeneficio(c), tipo: c.tipo, valorComDesconto }
  })

  // Cobrança CONSOLIDADA da marca (uma só, não por vendedora) — card principal da tela Planos.
  app.get('/rede', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const a = await prisma.assinaturaVendedoraRede.findUnique({ where: { redeId } })
    if (!a) return { existe: false as const }

    // Prévia do próximo ciclo: se algum assento tem cancelamento agendado, o valor guardado
    // (`valorProximoCiclo`) ainda não reflete isso — ele só é decidido de verdade na renovação
    // (ver confirmarCicloAssentoVendedoraRede). Calcula ao vivo pra avisar o gestor com precisão.
    let valorProximoCiclo = a.valorProximoCiclo != null ? num(a.valorProximoCiclo) : null
    if (valorProximoCiclo == null) {
      const qtdSemAgendados = await prisma.assinaturaVendedora.count({
        where: { redeId, status: 'ATIVA', valor: { gt: 0 }, cancelamentoSolicitadoEm: null },
      })
      const preview = await precoParaQuantidade(qtdSemAgendados)
      if (preview !== num(a.valor)) valorProximoCiclo = preview
    }

    return {
      existe: true as const,
      status: a.status, valor: num(a.valor), valorProximoCiclo,
      qtdPaga: a.qtdPaga, simulada: a.simulada, cicloFimEm: a.cicloFimEm,
      cancelamentoSolicitadoEm: a.cancelamentoSolicitadoEm,
    }
  })

  // Link do Mercado Pago pra retomar uma cobrança consolidada PENDENTE (o gestor aprovou/criou o
  // assento mas fechou a aba antes de autorizar o cartão) — sem isso não tinha como voltar a essa
  // tela depois; só existia o link mostrado uma única vez na hora da aprovação/criação.
  app.get('/rede/link-pagamento', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const a = await prisma.assinaturaVendedoraRede.findUnique({ where: { redeId } })
    if (!a || a.status !== 'PENDENTE' || !a.mpPreapprovalId) return { initPoint: null }
    return { initPoint: await obterInitPointPreapproval(a.mpPreapprovalId) }
  })

  // Assentos (membros) da rede logada. GESTOR/SUPER_ADMIN vê todos; GERENTE só o que ele mesmo
  // solicitou (aprovado ou não) — não deve enxergar assentos que o gestor comprou diretamente.
  app.get('/minhas', { preHandler: [app.authorize('GESTOR', 'GERENTE', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const where = request.user.role === 'GERENTE' ? { redeId, solicitadoPorId: request.user.sub } : { redeId }
    const assinaturas = await prisma.assinaturaVendedora.findMany({
      where, orderBy: { numeroAssento: 'asc' },
      include: { vendedora: { select: { id: true, nome: true } }, convite: { select: { nome: true, email: true, telefone: true } } },
    })
    return {
      assinaturas: assinaturas.map((a) => ({
        id: a.id, numeroAssento: a.numeroAssento, status: a.status, gratuito: num(a.valor) === 0, aprovadoEm: a.aprovadoEm,
        cancelamentoAgendado: a.cancelamentoSolicitadoEm != null,
        vendedoraId: a.vendedoraId, vendedoraNome: a.vendedora?.nome ?? a.convite?.nome ?? null,
      })),
    }
  })

  // Contrata um novo assento (cria o convite da vendedora + o membro). GESTOR/SUPER_ADMIN segue
  // direto pra ATIVA (recalcula a cobrança da marca); GERENTE fica aguardando aprovação do gestor.
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
    return reply.code(201).send({ aguardandoAprovacao: false, id: r.assinaturaId, initPoint: r.initPoint })
  })

  // Solicitações de GERENTE aguardando aprovação — só o dono da rede vê.
  app.get('/pendentes-aprovacao', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const pendentes = await prisma.assinaturaVendedora.findMany({
      where: { redeId, status: 'PENDENTE' },
      orderBy: { createdAt: 'asc' },
      include: { convite: { select: { nome: true, email: true, telefone: true } }, solicitadoPor: { select: { nome: true } } },
    })
    return {
      pendentes: pendentes.map((a) => ({
        id: a.id, createdAt: a.createdAt,
        nome: a.convite?.nome ?? null, email: a.convite?.email ?? null, telefone: a.convite?.telefone ?? null,
        solicitadoPorNome: a.solicitadoPor.nome,
      })),
    }
  })

  app.post('/:id/aprovar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const r = await aprovarAssentoVendedora(id, request.user.sub)
    if (!r.ok) return reply.code(422).send({ erro: r.erro })
    return { ok: true, initPoint: r.initPoint }
  })

  app.post('/:id/recusar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const r = await recusarAssentoVendedora(id, request.user.sub)
    if (!r.ok) return reply.code(422).send({ erro: r.erro })
    return { ok: true }
  })

  // Cancela o assento. Se era pago e a marca já tem cobrança em andamento, o acesso da vendedora
  // — e a contagem dela na faixa — ficam garantidos até o fim do ciclo já pago (não prorrateia).
  app.post('/:id/cancelar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
    if (!a || a.redeId !== redeId) return reply.code(404).send({ erro: 'Assento não encontrado.' })
    const r = await cancelarAssentoVendedora(id)
    if (!r.ok) return reply.code(422).send({ erro: r.erro })
    return { ok: true, acessoAte: r.acessoAte }
  })

  // Desfaz um cancelamento agendado (ainda dentro da carência).
  app.post('/:id/reativar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
    if (!a || a.redeId !== redeId) return reply.code(404).send({ erro: 'Assento não encontrado.' })
    const ok = await reativarAssentoVendedora(id)
    if (!ok) return reply.code(422).send({ erro: 'Este assento não tem cancelamento agendado.' })
    return { ok: true }
  })

  // Aplica um cupom de 100% a um assento já ATIVA e hoje pago (ex.: o gestor esqueceu de usar na
  // hora do convite e prefere resolver com cupom em vez de esperar a cobrança consolidada).
  app.post('/:id/aplicar-cupom', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { id } = request.params as { id: string }
    const { codigo } = z.object({ codigo: z.string().min(1) }).parse(request.body)
    const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
    if (!a || a.redeId !== redeId) return reply.code(404).send({ erro: 'Assento não encontrado.' })
    const r = await aplicarCupomAssentoVendedora(id, codigo)
    if (!r.ok) return reply.code(422).send({ erro: r.erro })
    return { ok: true }
  })
}

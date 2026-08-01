import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { env } from '../../env'
import { enviarWhatsapp } from '../whatsapp/whatsapp.service'

const itemSchema = z.object({
  variacaoId: z.string(),
  quantidade: z.coerce.number().int().positive(),
  precoUnitario: z.coerce.number().positive().optional(),
})

const criarOrcamentoSchema = z.object({
  clienteId: z.string(),
  vendedoraId: z.string().optional(),
  atacado: z.boolean().default(false),
  descontoPct: z.coerce.number().min(0).max(90).default(0),
  observacao: z.string().optional(),
  itens: z.array(itemSchema).min(1, 'Informe ao menos um item'),
})

const incluirDetalhe = {
  cliente: { select: { id: true, nome: true, telefone: true } },
  vendedora: { select: { id: true, nome: true } },
  aprovadoDescontoPor: { select: { id: true, nome: true } },
  venda: { select: { id: true, tokenPublico: true } },
  itens: { include: { variacao: { include: { produto: { select: { nome: true, referencia: true, fotos: true } } } } } },
} satisfies Prisma.OrcamentoInclude

/** Rede/loja/coleção usadas pra validar os itens e montar o link público (mesmo padrão de vendas.routes). */
async function carregarContexto(lojaId: string) {
  return prisma.loja.findUnique({
    where: { id: lojaId },
    select: { nome: true, rede: { select: { id: true, slug: true, waPhoneNumberId: true, waTokenCifrado: true, descontoAutoMaxPct: true, nome: true, logoUrl: true } } },
  })
}

function urlOrcamentoPublico(redeSlug: string, token: string): string {
  return `${env.TENANT_SCHEME}://${redeSlug}.${env.DOMINIO_BASE}/orcamento/publico/${token}`
}

/**
 * Orçamentos: a vendedora monta uma proposta e manda o cliente aprovar (ou pedir alterações)
 * por um link público — NÃO reserva nem abate estoque (isso só acontece quando o cliente
 * aprova e o orçamento vira Venda de fato). Desconto acima do limite livre da vendedora fica
 * represado até o gerente aprovar (fluxo assíncrono, diferente da senha na hora do PDV).
 */
export async function orcamentosRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarOrcamentoSchema.parse(request.body)

    const vendedoraId = request.user.role === 'VENDEDORA' ? request.user.sub : body.vendedoraId
    if (!vendedoraId) return reply.code(422).send({ erro: 'Informe a vendedora do orçamento' })
    const vendedora = await prisma.usuario.findFirst({ where: { id: vendedoraId, lojaId, role: { in: ['VENDEDORA', 'GERENTE'] }, ativo: true } })
    if (!vendedora) return reply.code(422).send({ erro: 'Vendedora inválida para esta loja' })

    const cliente = await prisma.cliente.findFirst({ where: { id: body.clienteId, lojaId } })
    if (!cliente) return reply.code(422).send({ erro: 'Cliente inválido para esta loja' })

    const ctx = await carregarContexto(lojaId)
    const redeId = ctx?.rede?.id
    if (!redeId) return reply.code(422).send({ erro: 'Loja sem marca vinculada' })

    const ids = body.itens.map((i) => i.variacaoId)
    const variacoes = await prisma.variacaoProduto.findMany({
      where: { id: { in: ids }, produto: { redeId, colecao: { lojas: { some: { lojaId } } } } },
      include: { produto: { select: { nome: true, precoVarejo: true, precoAtacado: true } } },
    })
    const porId = new Map(variacoes.map((v) => [v.id, v]))
    for (const item of body.itens) {
      if (!porId.has(item.variacaoId)) return reply.code(422).send({ erro: `Variação ${item.variacaoId} indisponível nesta loja (coleção não distribuída)` })
    }

    const itensCalculados = body.itens.map((item) => {
      const v = porId.get(item.variacaoId)!
      const preco = item.precoUnitario ?? (body.atacado && v.produto.precoAtacado ? Number(v.produto.precoAtacado) : Number(v.produto.precoVarejo))
      return { variacaoId: item.variacaoId, quantidade: item.quantidade, precoUnitario: preco }
    })
    const bruto = itensCalculados.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0)

    const autoMax = ctx?.rede?.descontoAutoMaxPct != null ? Number(ctx.rede.descontoAutoMaxPct) : 10
    const precisaAprovacao = body.descontoPct > autoMax
    const descontoPct = precisaAprovacao ? 0 : body.descontoPct
    const total = Math.max(0, bruto - bruto * (descontoPct / 100))

    const orcamento = await prisma.orcamento.create({
      data: {
        lojaId, clienteId: body.clienteId, vendedoraId, atacado: body.atacado,
        descontoPct, descontoSolicitadoPct: precisaAprovacao ? body.descontoPct : null,
        observacao: body.observacao, total,
        status: precisaAprovacao ? 'AGUARDANDO_APROVACAO_DESCONTO' : 'RASCUNHO',
        itens: { create: itensCalculados },
      },
      include: incluirDetalhe,
    })
    return reply.code(201).send(orcamento)
  })

  // Converte o pedido montado na vitrine (PedidoCatalogo, ligado ao Lead) num Orçamento de
  // verdade — reaproveita 100% do fluxo já existente (janela de edição, aprovação de desconto,
  // envio por WhatsApp). Idempotente: se o pedido já foi convertido antes, devolve o mesmo orçamento.
  app.post('/da-vitrine/:leadId', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { leadId } = request.params as { leadId: string }
    const where: Prisma.LeadWhereInput = { id: leadId, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    const lead = await prisma.lead.findFirst({ where, include: { pedidosCatalogo: { orderBy: { createdAt: 'desc' }, take: 1 } } })
    if (!lead) return reply.code(404).send({ erro: 'Ciclo não encontrado' })
    const pedido = lead.pedidosCatalogo[0]
    if (!pedido) return reply.code(422).send({ erro: 'Este ciclo não tem pedido montado na vitrine' })
    // Uma vez em "Venda Realizada" o pedido fica travado — mesmo que já exista orçamento aberto
    // (a exceção de reabertura abaixo não se aplica aqui: a venda já foi concluída).
    if (lead.status === 'CONVERTIDO') {
      return reply.code(422).send({ erro: 'Este ciclo já foi convertido em venda — o pedido não pode mais ser editado.' })
    }
    if (pedido.orcamentoId) {
      const existente = await prisma.orcamento.findUnique({ where: { id: pedido.orcamentoId }, include: incluirDetalhe })
      if (existente) return existente
    }
    // A conversão em Orçamento só libera a partir de "Em Atendimento" — força a vendedora a
    // atender o ciclo antes de editar/fechar o pedido (reabrir um orçamento já criado, acima,
    // continua liberado em qualquer etapa, exceto depois de convertido).
    if (lead.status === 'ENTROU') {
      return reply.code(422).send({ erro: 'Marque o ciclo como "Em Atendimento" antes de editar/fechar o pedido.' })
    }
    if (!lead.clienteId) return reply.code(422).send({ erro: 'Pedido sem cliente vinculado (sem telefone identificado)' })

    const ctx = await carregarContexto(lojaId)
    const redeId = ctx?.rede?.id
    if (!redeId) return reply.code(422).send({ erro: 'Loja sem marca vinculada' })

    type ItemPedidoJson = { produtoId: string; nome: string; cor?: string; estampa?: string; tamanho?: string; modo: string; precoUnit: number; qtd: number }
    const itensPedido = pedido.itens as unknown as ItemPedidoJson[]
    const variacoes = await prisma.variacaoProduto.findMany({
      where: { produtoId: { in: itensPedido.map((i) => i.produtoId) }, produto: { redeId } },
    })
    const avisos: string[] = []
    const itensCalculados: { variacaoId: string; quantidade: number; precoUnitario: number }[] = []
    for (const item of itensPedido) {
      const v = variacoes.find((x) => x.produtoId === item.produtoId && x.cor === (item.cor ?? '') && x.estampa === (item.estampa ?? '') && x.tamanho === (item.tamanho ?? ''))
      if (!v) { avisos.push(item.nome); continue }
      itensCalculados.push({ variacaoId: v.id, quantidade: item.qtd, precoUnitario: item.precoUnit })
    }
    if (itensCalculados.length === 0) return reply.code(422).send({ erro: 'Nenhuma peça do pedido está disponível para virar orçamento' })

    const bruto = itensCalculados.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0)
    const atacado = itensPedido.some((i) => i.modo === 'ATACADO')
    const orcamento = await prisma.orcamento.create({
      data: {
        lojaId, clienteId: lead.clienteId, vendedoraId: lead.vendedoraId, atacado, total: bruto,
        observacao: 'Pedido montado no catálogo (vitrine)',
        itens: { create: itensCalculados },
      },
      include: incluirDetalhe,
    })
    await prisma.pedidoCatalogo.update({ where: { id: pedido.id }, data: { orcamentoId: orcamento.id } })
    return reply.code(201).send({ ...orcamento, avisos })
  })

  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { clienteId } = request.query as { clienteId?: string }
    const where: Prisma.OrcamentoWhereInput = { lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    if (clienteId) where.clienteId = clienteId
    return prisma.orcamento.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: incluirDetalhe })
  })

  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const where: Prisma.OrcamentoWhereInput = { id, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    const orcamento = await prisma.orcamento.findFirst({ where, include: incluirDetalhe })
    if (!orcamento) return reply.code(404).send({ erro: 'Orçamento não encontrado' })
    return orcamento
  })

  const EDITAVEL = ['RASCUNHO', 'AGUARDANDO_APROVACAO_DESCONTO', 'ALTERACAO_SOLICITADA']

  app.patch('/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = criarOrcamentoSchema.omit({ vendedoraId: true }).parse(request.body)

    const where: Prisma.OrcamentoWhereInput = { id, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    const atual = await prisma.orcamento.findFirst({ where })
    if (!atual) return reply.code(404).send({ erro: 'Orçamento não encontrado' })
    if (!EDITAVEL.includes(atual.status)) return reply.code(422).send({ erro: 'Este orçamento não pode mais ser editado' })

    const cliente = await prisma.cliente.findFirst({ where: { id: body.clienteId, lojaId } })
    if (!cliente) return reply.code(422).send({ erro: 'Cliente inválido para esta loja' })

    const ctx = await carregarContexto(lojaId)
    const redeId = ctx?.rede?.id
    if (!redeId) return reply.code(422).send({ erro: 'Loja sem marca vinculada' })

    const ids = body.itens.map((i) => i.variacaoId)
    const variacoes = await prisma.variacaoProduto.findMany({
      where: { id: { in: ids }, produto: { redeId, colecao: { lojas: { some: { lojaId } } } } },
      include: { produto: { select: { nome: true, precoVarejo: true, precoAtacado: true } } },
    })
    const porId = new Map(variacoes.map((v) => [v.id, v]))
    for (const item of body.itens) {
      if (!porId.has(item.variacaoId)) return reply.code(422).send({ erro: `Variação ${item.variacaoId} indisponível nesta loja (coleção não distribuída)` })
    }

    const itensCalculados = body.itens.map((item) => {
      const v = porId.get(item.variacaoId)!
      const preco = item.precoUnitario ?? (body.atacado && v.produto.precoAtacado ? Number(v.produto.precoAtacado) : Number(v.produto.precoVarejo))
      return { variacaoId: item.variacaoId, quantidade: item.quantidade, precoUnitario: preco }
    })
    const bruto = itensCalculados.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0)

    const autoMax = ctx?.rede?.descontoAutoMaxPct != null ? Number(ctx.rede.descontoAutoMaxPct) : 10
    const precisaAprovacao = body.descontoPct > autoMax
    const descontoPct = precisaAprovacao ? 0 : body.descontoPct
    const total = Math.max(0, bruto - bruto * (descontoPct / 100))

    const orcamento = await prisma.$transaction(async (tx) => {
      await tx.itemOrcamento.deleteMany({ where: { orcamentoId: id } })
      return tx.orcamento.update({
        where: { id },
        data: {
          clienteId: body.clienteId, atacado: body.atacado, observacao: body.observacao, total,
          descontoPct, descontoSolicitadoPct: precisaAprovacao ? body.descontoPct : null,
          status: precisaAprovacao ? 'AGUARDANDO_APROVACAO_DESCONTO' : 'RASCUNHO',
          itens: { create: itensCalculados },
        },
        include: incluirDetalhe,
      })
    })
    return orcamento
  })

  app.post('/:id/aprovar-desconto', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const atual = await prisma.orcamento.findFirst({ where: { id, lojaId } })
    if (!atual) return reply.code(404).send({ erro: 'Orçamento não encontrado' })
    if (atual.status !== 'AGUARDANDO_APROVACAO_DESCONTO') return reply.code(422).send({ erro: 'Este orçamento não tem desconto pendente de aprovação' })

    const pct = Number(atual.descontoSolicitadoPct ?? 0)
    const itens = await prisma.itemOrcamento.findMany({ where: { orcamentoId: id } })
    const bruto = itens.reduce((s, i) => s + Number(i.precoUnitario) * i.quantidade, 0)
    const total = Math.max(0, bruto - bruto * (pct / 100))

    return prisma.orcamento.update({
      where: { id },
      data: { descontoPct: pct, descontoSolicitadoPct: null, aprovadoDescontoPorId: request.user.sub, total, status: 'RASCUNHO' },
      include: incluirDetalhe,
    })
  })

  app.post('/:id/recusar-desconto', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const atual = await prisma.orcamento.findFirst({ where: { id, lojaId } })
    if (!atual) return reply.code(404).send({ erro: 'Orçamento não encontrado' })
    if (atual.status !== 'AGUARDANDO_APROVACAO_DESCONTO') return reply.code(422).send({ erro: 'Este orçamento não tem desconto pendente de aprovação' })

    const itens = await prisma.itemOrcamento.findMany({ where: { orcamentoId: id } })
    const bruto = itens.reduce((s, i) => s + Number(i.precoUnitario) * i.quantidade, 0)
    const pctVigente = Number(atual.descontoPct)
    const total = Math.max(0, bruto - bruto * (pctVigente / 100))

    return prisma.orcamento.update({
      where: { id },
      data: { descontoSolicitadoPct: null, total, status: 'RASCUNHO' },
      include: incluirDetalhe,
    })
  })

  app.post('/:id/enviar', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const where: Prisma.OrcamentoWhereInput = { id, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    const orcamento = await prisma.orcamento.findFirst({ where, include: incluirDetalhe })
    if (!orcamento) return reply.code(404).send({ erro: 'Orçamento não encontrado' })
    if (orcamento.status === 'AGUARDANDO_APROVACAO_DESCONTO') return reply.code(422).send({ erro: 'O desconto pedido ainda não foi aprovado pelo gerente' })
    if (!['RASCUNHO', 'ALTERACAO_SOLICITADA'].includes(orcamento.status)) return reply.code(422).send({ erro: 'Este orçamento não pode ser enviado no estado atual' })

    const ctx = await carregarContexto(lojaId)
    const redeSlug = ctx?.rede?.slug
    let envio: { status: string } = { status: 'SIMULADA' }
    if (redeSlug) {
      const link = urlOrcamentoPublico(redeSlug, orcamento.tokenPublico)
      if (orcamento.cliente.telefone) {
        const texto = `Oi ${orcamento.cliente.nome.split(/\s+/)[0]}! Segue o orçamento da ${ctx.rede?.nome ?? ''} pra você conferir e aprovar:\n${link}`
        envio = await enviarWhatsapp({ rede: { waPhoneNumberId: ctx?.rede?.waPhoneNumberId ?? null, waTokenCifrado: ctx?.rede?.waTokenCifrado ?? null }, telefone: orcamento.cliente.telefone, texto })
      }
    }

    const atualizado = await prisma.orcamento.update({
      where: { id }, data: { status: 'ENVIADO', enviadoEm: new Date() }, include: incluirDetalhe,
    })
    return { orcamento: atualizado, envio }
  })

  app.post('/:id/cancelar', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const where: Prisma.OrcamentoWhereInput = { id, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    const atual = await prisma.orcamento.findFirst({ where })
    if (!atual) return reply.code(404).send({ erro: 'Orçamento não encontrado' })
    if (atual.status === 'CONVERTIDO') return reply.code(422).send({ erro: 'Este orçamento já virou venda' })
    return prisma.orcamento.update({ where: { id }, data: { status: 'CANCELADO' }, include: incluirDetalhe })
  })

  // ─────────── Público (sem login) — o link que o cliente recebe ───────────

  app.get('/publico/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const orcamento = await prisma.orcamento.findUnique({
      where: { tokenPublico: token },
      include: {
        cliente: { select: { nome: true } },
        vendedora: { select: { nome: true } },
        loja: { select: { nome: true, rede: { select: { nome: true, logoUrl: true } } } },
        itens: { include: { variacao: { select: { cor: true, estampa: true, tamanho: true, produto: { select: { nome: true, referencia: true, fotos: true } } } } } },
      },
    })
    if (!orcamento) return reply.code(404).send({ erro: 'Orçamento não encontrado' })
    return orcamento
  })

  app.post('/publico/:token/aprovar', async (request, reply) => {
    const { token } = request.params as { token: string }
    const orcamento = await prisma.orcamento.findUnique({
      where: { tokenPublico: token },
      include: { itens: { include: { variacao: true } } },
    })
    if (!orcamento) return reply.code(404).send({ erro: 'Orçamento não encontrado' })
    if (orcamento.status !== 'ENVIADO') return reply.code(422).send({ erro: 'Este orçamento não está mais disponível para aprovação' })

    try {
      const venda = await prisma.$transaction(async (tx) => {
        for (const item of orcamento.itens) {
          let ok: boolean
          if (orcamento.atacado) {
            const n = await tx.$executeRaw`UPDATE "variacoes_produto" SET "estoque" = "estoque" - ${item.quantidade} WHERE "id" = ${item.variacaoId} AND ("estoque" - "estoqueVarejo") >= ${item.quantidade}`
            ok = n > 0
          } else {
            const baixa = await tx.variacaoProduto.updateMany({
              where: { id: item.variacaoId, estoqueVarejo: { gte: item.quantidade } },
              data: { estoque: { decrement: item.quantidade }, estoqueVarejo: { decrement: item.quantidade } },
            })
            ok = baixa.count > 0
          }
          if (!ok) {
            throw Object.assign(
              new Error(`A peça "${item.variacao.cor}/${item.variacao.tamanho}" não está mais disponível no estoque. Fale com sua vendedora para ajustar o orçamento.`),
              { statusCode: 409 },
            )
          }
        }

        const bruto = orcamento.itens.reduce((s, i) => s + Number(i.precoUnitario) * i.quantidade, 0)
        const descontoValor = Math.max(0, bruto - Number(orcamento.total))

        const criada = await tx.venda.create({
          data: {
            lojaId: orcamento.lojaId, clienteId: orcamento.clienteId, vendedoraId: orcamento.vendedoraId,
            canal: 'ONLINE', atacado: orcamento.atacado, desconto: descontoValor,
            descontoPct: orcamento.descontoPct, total: orcamento.total,
            observacao: orcamento.observacao ? `Orçamento aprovado pelo cliente — ${orcamento.observacao}` : 'Orçamento aprovado pelo cliente',
            itens: { create: orcamento.itens.map((i) => ({ variacaoId: i.variacaoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario })) },
          },
        })

        for (const item of orcamento.itens) {
          await tx.movimentoEstoque.create({
            data: { variacaoId: item.variacaoId, tipo: 'SAIDA_VENDA', quantidade: -item.quantidade, vendaId: criada.id, motivo: 'Venda (orçamento aprovado pelo cliente)' },
          })
        }

        const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: orcamento.clienteId }, include: { loja: true } })
        const novoTotal = Number(cliente.totalGasto) + Number(criada.total)
        let segmento = cliente.segmento
        if (orcamento.atacado || novoTotal >= Number(cliente.loja.limiteAtacado)) segmento = 'ATACADO'
        else if (novoTotal > 3000) segmento = 'VIP'
        else if (cliente.segmento === 'INATIVO') segmento = 'FREQUENTE'
        await tx.cliente.update({ where: { id: orcamento.clienteId }, data: { totalGasto: novoTotal, ultimaCompraEm: new Date(), segmento } })

        await tx.orcamento.update({ where: { id: orcamento.id }, data: { status: 'CONVERTIDO', vendaId: criada.id, respondidoEm: new Date() } })

        return tx.venda.findUniqueOrThrow({ where: { id: criada.id }, select: { id: true, tokenPublico: true } })
      })
      return { ok: true, venda }
    } catch (e: unknown) {
      const statusCode = (e as { statusCode?: number }).statusCode
      if (statusCode) return reply.code(statusCode).send({ erro: (e as Error).message })
      throw e
    }
  })

  app.post('/publico/:token/solicitar-alteracao', async (request, reply) => {
    const { token } = request.params as { token: string }
    const body = z.object({ mensagem: z.string().min(1).max(1000) }).parse(request.body)
    const orcamento = await prisma.orcamento.findUnique({ where: { tokenPublico: token } })
    if (!orcamento) return reply.code(404).send({ erro: 'Orçamento não encontrado' })
    if (orcamento.status !== 'ENVIADO') return reply.code(422).send({ erro: 'Este orçamento não está mais disponível' })

    return prisma.orcamento.update({
      where: { id: orcamento.id },
      data: { status: 'ALTERACAO_SOLICITADA', mensagemCliente: body.mensagem, respondidoEm: new Date() },
    })
  })
}

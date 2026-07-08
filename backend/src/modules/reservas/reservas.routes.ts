import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDeQualquer } from '../../plugins/auth'
import { flagPedidosDisponiveis } from './reservas.service'

const itemSchema = z.object({
  variacaoId: z.string(),
  quantidade: z.coerce.number().int().positive(),
  precoUnitario: z.coerce.number().positive().optional(),
})

const criarReservaSchema = z.object({
  clienteId: z.string().optional(),
  vendedoraId: z.string().optional(), // gerente pode lançar em nome de uma vendedora
  atacado: z.boolean().default(false),
  observacao: z.string().optional(),
  itens: z.array(itemSchema).min(1, 'Informe ao menos um item'),
})

const incluirDetalhe = {
  cliente: { select: { id: true, nome: true } },
  vendedora: { select: { id: true, nome: true } },
  variacao: { include: { produto: { select: { nome: true, referencia: true } } } },
} satisfies Prisma.PedidoReservaInclude

/**
 * Pedidos de reserva — peça esgotada (ou insuficiente para o canal) com demanda: a vendedora
 * registra a intenção do cliente; o gestor de estoque/marca acompanha a demanda agregada para
 * programar produção; quando a fábrica repõe, o pedido vira DISPONIVEL e alguém confirma (vira Venda).
 */
export async function reservasRoutes(app: FastifyInstance) {
  // Cria um ou mais pedidos de reserva (um por item do carrinho "sob encomenda").
  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarReservaSchema.parse(request.body)

    const vendedoraId = request.user.role === 'VENDEDORA' ? request.user.sub : body.vendedoraId
    if (!vendedoraId) return reply.code(422).send({ erro: 'Informe a vendedora do pedido' })

    const vendedora = await prisma.usuario.findFirst({
      where: { id: vendedoraId, lojaId, role: { in: ['VENDEDORA', 'GERENTE'] }, ativo: true },
    })
    if (!vendedora) return reply.code(422).send({ erro: 'Vendedora inválida para esta loja' })

    if (body.clienteId) {
      const cliente = await prisma.cliente.findFirst({ where: { id: body.clienteId, lojaId } })
      if (!cliente) return reply.code(422).send({ erro: 'Cliente inválido para esta loja' })
    }

    const lojaRede = await prisma.loja.findUnique({ where: { id: lojaId }, select: { rede: { select: { id: true } } } })
    const redeId = lojaRede?.rede?.id
    if (!redeId) return reply.code(422).send({ erro: 'Loja sem marca vinculada' })

    const ids = body.itens.map((i) => i.variacaoId)
    const variacoes = await prisma.variacaoProduto.findMany({
      where: { id: { in: ids }, produto: { redeId, colecao: { lojas: { some: { lojaId } } } } },
      include: { produto: { select: { nome: true, precoVarejo: true, precoAtacado: true } } },
    })
    const porId = new Map(variacoes.map((v) => [v.id, v]))

    // Só faz sentido "reservar" o que a loja não consegue vender agora nesse canal.
    for (const item of body.itens) {
      const v = porId.get(item.variacaoId)
      if (!v) return reply.code(422).send({ erro: `Variação ${item.variacaoId} indisponível nesta loja (coleção não distribuída)` })
      const disponivel = body.atacado ? v.estoque - v.estoqueVarejo : v.estoqueVarejo
      if (disponivel >= item.quantidade) {
        return reply.code(422).send({ erro: `${v.produto.nome} ${v.cor}/${v.tamanho} já tem estoque suficiente (${disponivel} un) — registre uma venda normal em vez de reserva` })
      }
    }

    const criados = await prisma.$transaction(async (tx) => {
      const linhas = []
      for (const item of body.itens) {
        const v = porId.get(item.variacaoId)!
        const preco = item.precoUnitario ?? (body.atacado && v.produto.precoAtacado ? Number(v.produto.precoAtacado) : Number(v.produto.precoVarejo))
        linhas.push(
          await tx.pedidoReserva.create({
            data: {
              lojaId, clienteId: body.clienteId, vendedoraId, variacaoId: item.variacaoId,
              quantidade: item.quantidade, precoUnitario: preco, atacado: body.atacado, observacao: body.observacao,
            },
            include: incluirDetalhe,
          }),
        )
      }
      return linhas
    })

    return reply.code(201).send(criados)
  })

  // Listagem: vendedora vê só os seus; gerente/gestor/admin veem todos da loja.
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { status } = request.query as { status?: string }

    const where: Prisma.PedidoReservaWhereInput = { lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    if (status) where.status = status as never

    return prisma.pedidoReserva.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: incluirDetalhe })
  })

  // Demanda agregada por variação, em toda a rede — visão do gestor de estoque/marca para
  // programar produção (soma PENDENTE + DISPONIVEL: tudo que ainda não virou venda).
  app.get('/demanda', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA')] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)

    const pedidos = await prisma.pedidoReserva.findMany({
      where: { status: { in: ['PENDENTE', 'DISPONIVEL'] }, variacao: { produto: { redeId } } },
      include: incluirDetalhe,
      orderBy: { createdAt: 'asc' },
    })

    const porVariacao = new Map<string, {
      variacaoId: string; produto: string; referencia: string | null; cor: string; tamanho: string
      estoqueAtual: number; quantidadePendente: number; quantidadeDisponivel: number
      pedidos: number; maisAntigoEm: Date
    }>()
    for (const p of pedidos) {
      const atual = porVariacao.get(p.variacaoId) ?? {
        variacaoId: p.variacaoId, produto: p.variacao.produto.nome, referencia: p.variacao.produto.referencia,
        cor: p.variacao.cor, tamanho: p.variacao.tamanho, estoqueAtual: p.variacao.estoque,
        quantidadePendente: 0, quantidadeDisponivel: 0, pedidos: 0, maisAntigoEm: p.createdAt,
      }
      if (p.status === 'PENDENTE') atual.quantidadePendente += p.quantidade
      else atual.quantidadeDisponivel += p.quantidade
      atual.pedidos += 1
      if (p.createdAt < atual.maisAntigoEm) atual.maisAntigoEm = p.createdAt
      porVariacao.set(p.variacaoId, atual)
    }

    return [...porVariacao.values()].sort((a, b) => (b.quantidadePendente + b.quantidadeDisponivel) - (a.quantidadePendente + a.quantidadeDisponivel))
  })

  // Confirma um pedido DISPONIVEL (ou já cobrível) e vira Venda de fato, abatendo o estoque.
  app.post('/:id/confirmar', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }

    const where: Prisma.PedidoReservaWhereInput = { id, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    const pedido = await prisma.pedidoReserva.findFirst({ where, include: { variacao: true } })
    if (!pedido) return reply.code(404).send({ erro: 'Pedido de reserva não encontrado' })
    if (pedido.status === 'CONVERTIDO') return reply.code(422).send({ erro: 'Este pedido já foi convertido em venda' })
    if (pedido.status === 'CANCELADO') return reply.code(422).send({ erro: 'Este pedido foi cancelado' })

    try {
      const venda = await prisma.$transaction(async (tx) => {
        let ok: boolean
        if (pedido.atacado) {
          const n = await tx.$executeRaw`UPDATE "variacoes_produto" SET "estoque" = "estoque" - ${pedido.quantidade} WHERE "id" = ${pedido.variacaoId} AND ("estoque" - "estoqueVarejo") >= ${pedido.quantidade}`
          ok = n > 0
        } else {
          const baixa = await tx.variacaoProduto.updateMany({
            where: { id: pedido.variacaoId, estoqueVarejo: { gte: pedido.quantidade } },
            data: { estoque: { decrement: pedido.quantidade }, estoqueVarejo: { decrement: pedido.quantidade } },
          })
          ok = baixa.count > 0
        }
        if (!ok) {
          // Ainda não cabe (pode ter sido vendido para outro cliente nesse meio-tempo).
          // Não mexe no status aqui: o throw reverte esta transação (incluindo qualquer update
          // feito nela) — o reset para PENDENTE acontece no catch, fora da transação abortada.
          throw Object.assign(new Error('Estoque insuficiente para confirmar este pedido no momento.'), { statusCode: 409 })
        }

        const criada = await tx.venda.create({
          data: {
            lojaId, clienteId: pedido.clienteId, vendedoraId: pedido.vendedoraId,
            canal: 'BALCAO', atacado: pedido.atacado, total: Number(pedido.precoUnitario) * pedido.quantidade,
            observacao: pedido.observacao ? `Pedido de reserva confirmado — ${pedido.observacao}` : 'Pedido de reserva confirmado',
            itens: { create: [{ variacaoId: pedido.variacaoId, quantidade: pedido.quantidade, precoUnitario: pedido.precoUnitario }] },
          },
        })

        await tx.movimentoEstoque.create({
          data: { variacaoId: pedido.variacaoId, tipo: 'SAIDA_VENDA', quantidade: -pedido.quantidade, vendaId: criada.id, motivo: 'Venda (pedido de reserva confirmado)' },
        })

        if (pedido.clienteId) {
          const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: pedido.clienteId }, include: { loja: true } })
          const novoTotal = Number(cliente.totalGasto) + Number(criada.total)
          let segmento = cliente.segmento
          if (pedido.atacado || novoTotal >= Number(cliente.loja.limiteAtacado)) segmento = 'ATACADO'
          else if (novoTotal > 3000) segmento = 'VIP'
          else if (cliente.segmento === 'INATIVO') segmento = 'FREQUENTE'
          await tx.cliente.update({ where: { id: pedido.clienteId }, data: { totalGasto: novoTotal, ultimaCompraEm: new Date(), segmento } })
        }

        await tx.pedidoReserva.update({ where: { id: pedido.id }, data: { status: 'CONVERTIDO', vendaId: criada.id } })

        return tx.venda.findUniqueOrThrow({
          where: { id: criada.id },
          include: { cliente: { select: { id: true, nome: true } }, vendedora: { select: { id: true, nome: true } }, itens: { include: { variacao: { include: { produto: { select: { nome: true } } } } } } },
        })
      })
      return venda
    } catch (e: unknown) {
      const statusCode = (e as { statusCode?: number }).statusCode
      if (statusCode === 409) {
        // A transação abortou sem decrementar nada; se estava DISPONIVEL, volta a PENDENTE
        // (o próximo lote de reposição reavalia FIFO do zero).
        await prisma.pedidoReserva.updateMany({ where: { id: pedido.id, status: 'DISPONIVEL' }, data: { status: 'PENDENTE', disponivelEm: null } })
      }
      if (statusCode) return reply.code(statusCode).send({ erro: (e as Error).message })
      throw e
    }
  })

  // Cancela um pedido de reserva (a própria vendedora ou gerente/gestor/admin da loja).
  app.post('/:id/cancelar', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }

    const where: Prisma.PedidoReservaWhereInput = { id, lojaId }
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    const pedido = await prisma.pedidoReserva.findFirst({ where })
    if (!pedido) return reply.code(404).send({ erro: 'Pedido de reserva não encontrado' })
    if (pedido.status === 'CONVERTIDO') return reply.code(422).send({ erro: 'Este pedido já foi convertido em venda' })

    return prisma.pedidoReserva.update({ where: { id }, data: { status: 'CANCELADO' }, include: incluirDetalhe })
  })
}

export { flagPedidosDisponiveis }

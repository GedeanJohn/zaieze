import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'

const itemSchema = z.object({
  variacaoId: z.string(),
  quantidade: z.coerce.number().int().positive(),
  // preço unitário opcional: default = preço varejo/atacado do produto
  precoUnitario: z.coerce.number().positive().optional(),
})

const criarVendaSchema = z.object({
  clienteId: z.string().optional(),
  vendedoraId: z.string().optional(), // gerente pode lançar em nome de uma vendedora
  canal: z.enum(['BALCAO', 'ONLINE']).default('BALCAO'), // ONLINE = venda pelo WhatsApp
  atacado: z.boolean().default(false),
  formaRecebimento: z.enum(['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'OUTRO']).default('DINHEIRO'),
  desconto: z.coerce.number().nonnegative().default(0),
  observacao: z.string().optional(),
  itens: z.array(itemSchema).min(1, 'Venda precisa de ao menos um item'),
})

/** Vendas — registro com baixa automática de estoque (grade) e atualização do cliente. */
export async function vendasRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { de, ate } = request.query as { de?: string; ate?: string }

    const where: Prisma.VendaWhereInput = { lojaId }
    // Vendedora vê apenas as próprias vendas — hierarquia de visualização
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    if (de || ate) {
      where.createdAt = {
        ...(de ? { gte: new Date(de) } : {}),
        ...(ate ? { lte: new Date(`${ate}T23:59:59.999`) } : {}),
      }
    }

    return prisma.venda.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        cliente: { select: { id: true, nome: true } },
        vendedora: { select: { id: true, nome: true } },
        itens: { include: { variacao: { include: { produto: { select: { nome: true } } } } } },
      },
    })
  })

  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarVendaSchema.parse(request.body)

    // Vendedora sempre vende em nome próprio; gerente/gestor podem indicar a vendedora
    const vendedoraId = request.user.role === 'VENDEDORA' ? request.user.sub : body.vendedoraId
    if (!vendedoraId) return reply.code(422).send({ erro: 'Informe a vendedora da venda' })

    const vendedora = await prisma.usuario.findFirst({
      where: { id: vendedoraId, lojaId, role: { in: ['VENDEDORA', 'GERENTE'] }, ativo: true },
    })
    if (!vendedora) return reply.code(422).send({ erro: 'Vendedora inválida para esta loja' })

    if (body.clienteId) {
      const cliente = await prisma.cliente.findFirst({ where: { id: body.clienteId, lojaId } })
      if (!cliente) return reply.code(422).send({ erro: 'Cliente inválido para esta loja' })
    }

    // Carrega variações com produto e valida loja
    const ids = body.itens.map((i) => i.variacaoId)
    const variacoes = await prisma.variacaoProduto.findMany({
      where: { id: { in: ids }, produto: { lojaId } },
      include: { produto: true },
    })
    const porId = new Map(variacoes.map((v) => [v.id, v]))

    for (const item of body.itens) {
      const v = porId.get(item.variacaoId)
      if (!v) return reply.code(422).send({ erro: `Variação ${item.variacaoId} inválida para esta loja` })
      if (v.estoque < item.quantidade) {
        return reply.code(422).send({
          erro: `Estoque insuficiente: ${v.produto.nome} ${v.cor}/${v.tamanho} tem ${v.estoque} un (pedido: ${item.quantidade})`,
        })
      }
    }

    // Preço: informado > atacado (se venda atacado e produto tem) > varejo
    const itensCalculados = body.itens.map((item) => {
      const v = porId.get(item.variacaoId)!
      const preco =
        item.precoUnitario ??
        (body.atacado && v.produto.precoAtacado ? Number(v.produto.precoAtacado) : Number(v.produto.precoVarejo))
      return { ...item, precoUnitario: preco }
    })
    const bruto = itensCalculados.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0)
    const total = Math.max(0, bruto - body.desconto)

    const venda = await prisma.$transaction(async (tx) => {
      const criada = await tx.venda.create({
        data: {
          lojaId,
          clienteId: body.clienteId,
          vendedoraId,
          canal: body.canal,
          atacado: body.atacado,
          formaRecebimento: body.formaRecebimento,
          desconto: body.desconto,
          observacao: body.observacao,
          total,
          itens: {
            create: itensCalculados.map((i) => ({
              variacaoId: i.variacaoId,
              quantidade: i.quantidade,
              precoUnitario: i.precoUnitario,
            })),
          },
        },
      })

      // Baixa automática de estoque + movimento por SKU
      for (const item of itensCalculados) {
        // Baixa atômica: só decrementa se ainda houver saldo. Impede que duas vendas
        // simultâneas (duas vendedoras) vendam a mesma peça — fecha a corrida de estoque.
        const baixa = await tx.variacaoProduto.updateMany({
          where: { id: item.variacaoId, estoque: { gte: item.quantidade } },
          data: { estoque: { decrement: item.quantidade } },
        })
        if (baixa.count === 0) {
          const v = porId.get(item.variacaoId)!
          throw Object.assign(
            new Error(`Estoque esgotado durante a venda: ${v.produto.nome} ${v.cor}/${v.tamanho}`),
            { statusCode: 409 },
          )
        }
        await tx.movimentoEstoque.create({
          data: {
            variacaoId: item.variacaoId,
            tipo: 'SAIDA_VENDA',
            quantidade: -item.quantidade,
            vendaId: criada.id,
            motivo: 'Venda',
          },
        })
      }

      // Atualiza agregados e segmento do cliente (regra simplificada; job completo na Fase 3)
      if (body.clienteId) {
        const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: body.clienteId }, include: { loja: true } })
        const novoTotal = Number(cliente.totalGasto) + total
        let segmento = cliente.segmento
        if (body.atacado || novoTotal >= Number(cliente.loja.limiteAtacado)) segmento = 'ATACADO'
        else if (novoTotal > 3000) segmento = 'VIP'
        else if (cliente.segmento === 'INATIVO') segmento = 'FREQUENTE'

        await tx.cliente.update({
          where: { id: body.clienteId },
          data: { totalGasto: novoTotal, ultimaCompraEm: new Date(), segmento },
        })
      }

      return tx.venda.findUniqueOrThrow({
        where: { id: criada.id },
        include: {
          cliente: { select: { id: true, nome: true, segmento: true } },
          vendedora: { select: { id: true, nome: true } },
          itens: { include: { variacao: { include: { produto: { select: { nome: true } } } } } },
        },
      })
    })

    return reply.code(201).send(venda)
  })

  // Cancela venda e devolve estoque
  app.post('/:id/cancelar', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }

    const venda = await prisma.venda.findFirst({ where: { id, lojaId }, include: { itens: true } })
    if (!venda) return reply.code(404).send({ erro: 'Venda não encontrada' })
    if (venda.status === 'CANCELADA') return reply.code(422).send({ erro: 'Venda já cancelada' })

    await prisma.$transaction(async (tx) => {
      await tx.venda.update({ where: { id }, data: { status: 'CANCELADA' } })
      for (const item of venda.itens) {
        await tx.variacaoProduto.update({
          where: { id: item.variacaoId },
          data: { estoque: { increment: item.quantidade } },
        })
        await tx.movimentoEstoque.create({
          data: {
            variacaoId: item.variacaoId,
            tipo: 'DEVOLUCAO',
            quantidade: item.quantidade,
            vendaId: id,
            motivo: 'Cancelamento de venda',
          },
        })
      }
      if (venda.clienteId) {
        await tx.cliente.update({
          where: { id: venda.clienteId },
          data: { totalGasto: { decrement: venda.total } },
        })
      }
    })

    return { ok: true }
  })
}

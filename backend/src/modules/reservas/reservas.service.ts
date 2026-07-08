import type { Prisma, PrismaClient } from '@prisma/client'

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

/**
 * Chamado após uma entrada de produção aumentar `estoque` de uma variação: marca como
 * DISPONIVEL os pedidos de reserva PENDENTES mais antigos (FIFO) que já cabem no novo total.
 * Aproximado por design — não separa o balde varejo/atacado (isso é remanejado à parte pelo
 * gestor de estoque); a checagem definitiva por canal acontece na confirmação (vira Venda).
 */
export async function flagPedidosDisponiveis(tx: Tx, variacaoId: string): Promise<void> {
  const variacao = await tx.variacaoProduto.findUnique({ where: { id: variacaoId }, select: { estoque: true } })
  if (!variacao) return

  const pendentes = await tx.pedidoReserva.findMany({
    where: { variacaoId, status: 'PENDENTE' },
    orderBy: { createdAt: 'asc' },
  })

  let restante = variacao.estoque
  for (const pedido of pendentes) {
    if (restante < pedido.quantidade) break // FIFO: para no primeiro que ainda não cabe
    restante -= pedido.quantidade
    await tx.pedidoReserva.update({ where: { id: pedido.id }, data: { status: 'DISPONIVEL', disponivelEm: new Date() } })
  }
}

export type PedidoReservaComDados = Prisma.PedidoReservaGetPayload<{
  include: {
    cliente: { select: { id: true; nome: true } }
    vendedora: { select: { id: true; nome: true } }
    variacao: { include: { produto: { select: { nome: true; referencia: true } } } }
  }
}>

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { redeIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'

const GESTAO = ['SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE'] as const

const criarSchema = z.object({
  lojaOrigemId: z.string(),
  lojaDestinoId: z.string(),
  observacao: z.string().optional(),
  itens: z.array(z.object({ origemVariacaoId: z.string(), quantidade: z.coerce.number().int().positive() })).min(1, 'Informe ao menos um item'),
})

const receberSchema = z.object({
  // recebimento parcial/divergente; ausente = recebe tudo que foi enviado
  itens: z.array(z.object({ itemId: z.string(), quantidadeRecebida: z.coerce.number().int().nonnegative() })).optional(),
})

type Tx = Prisma.TransactionClient

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
const limpaRef = (r: string) => r.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '').slice(0, 24)
const skuBase = (ref: string, cor: string, estampa: string, tam: string) =>
  [limpaRef(ref), norm(cor).slice(0, 8), ...(estampa ? [norm(estampa).slice(0, 8)] : []), norm(tam).slice(0, 6)].join('-')

async function skuLivreTx(tx: Tx, base: string): Promise<string> {
  let sku = base
  let n = 1
  while (await tx.variacaoProduto.findUnique({ where: { sku }, select: { id: true } })) {
    n += 1
    sku = `${base}-${n}`
  }
  return sku
}

const variacaoComProduto = Prisma.validator<Prisma.VariacaoProdutoDefaultArgs>()({
  include: { produto: { include: { categoria: true, marca: true, colecao: true } } },
})
type VarOrigem = Prisma.VariacaoProdutoGetPayload<typeof variacaoComProduto>

/**
 * Encontra (ou cria, clonando) a variação correspondente na loja de destino,
 * casando por referência do modelo + cor + tamanho. Catálogo é por loja, então
 * a "mesma" peça vira uma linha equivalente no destino.
 */
async function variacaoDestino(tx: Tx, lojaDestinoId: string, origem: VarOrigem): Promise<string> {
  const p = origem.produto
  let prodDest = p.referencia
    ? await tx.produto.findFirst({ where: { lojaId: lojaDestinoId, referencia: p.referencia } })
    : await tx.produto.findFirst({ where: { lojaId: lojaDestinoId, nome: p.nome } })

  if (!prodDest) {
    const [categoria, marca, colecao] = await Promise.all([
      p.categoria ? tx.categoria.upsert({ where: { lojaId_nome: { lojaId: lojaDestinoId, nome: p.categoria.nome } }, create: { lojaId: lojaDestinoId, nome: p.categoria.nome }, update: {} }) : null,
      p.marca ? tx.marca.upsert({ where: { lojaId_nome: { lojaId: lojaDestinoId, nome: p.marca.nome } }, create: { lojaId: lojaDestinoId, nome: p.marca.nome }, update: {} }) : null,
      p.colecao ? tx.colecao.upsert({ where: { lojaId_nome: { lojaId: lojaDestinoId, nome: p.colecao.nome } }, create: { lojaId: lojaDestinoId, nome: p.colecao.nome }, update: {} }) : null,
    ])
    prodDest = await tx.produto.create({
      data: {
        lojaId: lojaDestinoId,
        referencia: p.referencia,
        nome: p.nome,
        genero: p.genero,
        descricao: p.descricao,
        composicao: p.composicao,
        modelagem: p.modelagem,
        ncm: p.ncm,
        fornecedor: p.fornecedor,
        pesoGramas: p.pesoGramas,
        faixaEtaria: p.faixaEtaria,
        categoriaId: categoria?.id,
        marcaId: marca?.id,
        colecaoId: colecao?.id,
        precoVarejo: p.precoVarejo,
        precoAtacado: p.precoAtacado,
        custo: p.custo,
      },
    })
  }

  const existente = await tx.variacaoProduto.findUnique({
    where: { produtoId_cor_estampa_tamanho: { produtoId: prodDest.id, cor: origem.cor, estampa: origem.estampa, tamanho: origem.tamanho } },
    select: { id: true },
  })
  if (existente) return existente.id

  const sku = await skuLivreTx(tx, skuBase(prodDest.referencia ?? prodDest.nome, origem.cor, origem.estampa, origem.tamanho))
  const criada = await tx.variacaoProduto.create({
    data: { produtoId: prodDest.id, cor: origem.cor, estampa: origem.estampa, tamanho: origem.tamanho, estoque: 0, sku },
    select: { id: true },
  })
  return criada.id
}

const includeTransf = {
  lojaOrigem: { select: { id: true, nome: true } },
  lojaDestino: { select: { id: true, nome: true } },
  itens: { include: { origemVariacao: { include: { produto: { select: { nome: true, referencia: true } } } } } },
}

/** Transferências entre lojas da rede, com confirmação de recebimento (radar de extravio). */
export async function transferenciasRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireFeature('multi_loja'))

  // Listagem (rede; gerente vê só as da própria loja)
  app.get('/', { preHandler: [app.authorize(...GESTAO)] }, async (request: FastifyRequest) => {
    const redeId = redeIdDe(request)
    const { status } = request.query as { status?: string }

    const where: Prisma.TransferenciaWhereInput =
      request.user.role === 'GERENTE'
        ? { OR: [{ lojaOrigemId: request.user.lojaId! }, { lojaDestinoId: request.user.lojaId! }] }
        : { OR: [{ lojaOrigem: { redeId } }, { lojaDestino: { redeId } }] }
    if (status) where.status = status as never

    return prisma.transferencia.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: includeTransf })
  })

  // Criar/enviar transferência
  app.post('/', { preHandler: [app.authorize(...GESTAO)] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const body = criarSchema.parse(request.body)
    if (body.lojaOrigemId === body.lojaDestinoId) return reply.code(422).send({ erro: 'Origem e destino devem ser lojas diferentes' })

    const lojas = await prisma.loja.findMany({ where: { id: { in: [body.lojaOrigemId, body.lojaDestinoId] }, redeId }, select: { id: true, nome: true } })
    if (lojas.length !== 2) return reply.code(403).send({ erro: 'Loja de origem/destino inválida para a sua rede' })
    if (request.user.role === 'GERENTE' && request.user.lojaId !== body.lojaOrigemId) {
      return reply.code(403).send({ erro: 'Gerente só pode enviar da própria loja' })
    }
    const nomeDestino = lojas.find((l) => l.id === body.lojaDestinoId)!.nome

    const ids = body.itens.map((i) => i.origemVariacaoId)
    const variacoes = await prisma.variacaoProduto.findMany({
      where: { id: { in: ids }, produto: { lojaId: body.lojaOrigemId } },
      ...variacaoComProduto,
    })
    const porId = new Map(variacoes.map((v) => [v.id, v]))
    for (const it of body.itens) {
      const v = porId.get(it.origemVariacaoId)
      if (!v) return reply.code(422).send({ erro: `Variação ${it.origemVariacaoId} inválida na loja de origem` })
      if (v.estoque < it.quantidade) return reply.code(422).send({ erro: `Estoque insuficiente: ${v.produto.nome} ${v.cor}/${v.tamanho} tem ${v.estoque} un` })
    }

    const transf = await prisma.$transaction(async (tx) => {
      const itensData: Prisma.TransferenciaItemCreateManyTransferenciaInput[] = []
      for (const it of body.itens) {
        const v = porId.get(it.origemVariacaoId)!
        const baixa = await tx.variacaoProduto.updateMany({ where: { id: v.id, estoque: { gte: it.quantidade } }, data: { estoque: { decrement: it.quantidade } } })
        if (baixa.count === 0) throw Object.assign(new Error(`Estoque esgotado: ${v.produto.nome} ${v.cor}/${v.tamanho}`), { statusCode: 409 })
        await tx.movimentoEstoque.create({ data: { variacaoId: v.id, tipo: 'TRANSFERENCIA_SAIDA', quantidade: -it.quantidade, motivo: `Transferência → ${nomeDestino}` } })
        const destinoVariacaoId = await variacaoDestino(tx, body.lojaDestinoId, v)
        itensData.push({ origemVariacaoId: v.id, destinoVariacaoId, quantidadeEnviada: it.quantidade })
      }
      return tx.transferencia.create({
        data: { lojaOrigemId: body.lojaOrigemId, lojaDestinoId: body.lojaDestinoId, observacao: body.observacao, itens: { create: itensData } },
        include: includeTransf,
      })
    })
    return reply.code(201).send(transf)
  })

  // Confirmar recebimento (destino). Divergência = enviado − recebido.
  app.post('/:id/receber', { preHandler: [app.authorize(...GESTAO)] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }
    const body = receberSchema.parse(request.body)

    const transf = await prisma.transferencia.findFirst({ where: { id, lojaDestino: { redeId } }, include: { itens: true } })
    if (!transf) return reply.code(404).send({ erro: 'Transferência não encontrada na sua rede' })
    if (transf.status !== 'EM_TRANSITO') return reply.code(422).send({ erro: 'Transferência já finalizada' })
    if (request.user.role === 'GERENTE' && request.user.lojaId !== transf.lojaDestinoId) {
      return reply.code(403).send({ erro: 'Gerente só recebe transferências da própria loja' })
    }

    const recMap = new Map((body.itens ?? []).map((i) => [i.itemId, i.quantidadeRecebida]))
    await prisma.$transaction(async (tx) => {
      for (const item of transf.itens) {
        const pedido = recMap.has(item.id) ? recMap.get(item.id)! : item.quantidadeEnviada
        const recebido = Math.min(pedido, item.quantidadeEnviada) // não recebe mais do que foi enviado
        if (recebido > 0) {
          await tx.variacaoProduto.update({ where: { id: item.destinoVariacaoId }, data: { estoque: { increment: recebido } } })
          const divergente = recebido < item.quantidadeEnviada
          await tx.movimentoEstoque.create({
            data: { variacaoId: item.destinoVariacaoId, tipo: 'TRANSFERENCIA_ENTRADA', quantidade: recebido, motivo: divergente ? 'Transferência recebida (divergência)' : 'Transferência recebida' },
          })
        }
        await tx.transferenciaItem.update({ where: { id: item.id }, data: { quantidadeRecebida: recebido } })
      }
      await tx.transferencia.update({ where: { id }, data: { status: 'RECEBIDA', recebidaEm: new Date() } })
    })
    return prisma.transferencia.findUniqueOrThrow({ where: { id }, include: includeTransf })
  })

  // Cancelar (origem) — estorna o estoque enviado de volta
  app.post('/:id/cancelar', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { id } = request.params as { id: string }

    const transf = await prisma.transferencia.findFirst({ where: { id, lojaOrigem: { redeId } }, include: { itens: true } })
    if (!transf) return reply.code(404).send({ erro: 'Transferência não encontrada na sua rede' })
    if (transf.status !== 'EM_TRANSITO') return reply.code(422).send({ erro: 'Só dá para cancelar transferências em trânsito' })

    await prisma.$transaction(async (tx) => {
      for (const item of transf.itens) {
        await tx.variacaoProduto.update({ where: { id: item.origemVariacaoId }, data: { estoque: { increment: item.quantidadeEnviada } } })
        await tx.movimentoEstoque.create({ data: { variacaoId: item.origemVariacaoId, tipo: 'TRANSFERENCIA_ENTRADA', quantidade: item.quantidadeEnviada, motivo: 'Cancelamento de transferência (estorno à origem)' } })
      }
      await tx.transferencia.update({ where: { id }, data: { status: 'CANCELADA' } })
    })
    return { ok: true }
  })
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { converterCicloPorVenda } from '../leads/leads.service'

// Régua de desconto padrão (sugestão por total do pedido). Editável por rede em descontoRegua.
const REGUA_PADRAO = [
  { ate: 1000, pct: 5 }, { ate: 3000, pct: 8 }, { ate: 5000, pct: 10 },
  { ate: 10000, pct: 15 }, { ate: null as number | null, pct: 20 },
]

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
  descontoPct: z.coerce.number().min(0).max(90).optional(), // % de desconto (tem prioridade sobre o valor)
  // Autorização do desconto acima dos limites: senha da própria vendedora e/ou credenciais do gerente.
  autorizacao: z.object({
    senha: z.string().optional(),
    gerenteEmail: z.string().optional(),
    gerenteSenha: z.string().optional(),
  }).optional(),
  observacao: z.string().optional(),
  itens: z.array(itemSchema).min(1, 'Venda precisa de ao menos um item'),
})

/** Vendas — registro com baixa automática de estoque (grade) e atualização do cliente. */
export async function vendasRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { de, ate, canal } = request.query as { de?: string; ate?: string; canal?: string }

    const where: Prisma.VendaWhereInput = { lojaId }
    // Vendedora vê apenas as próprias vendas — hierarquia de visualização
    if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
    if (canal === 'ONLINE' || canal === 'BALCAO') where.canal = canal
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

  // Detalhe completo da venda (para o pedido em PDF/WhatsApp).
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const venda = await prisma.venda.findFirst({
      where: { id, lojaId, ...(request.user.role === 'VENDEDORA' ? { vendedoraId: request.user.sub } : {}) },
      include: {
        cliente: { select: { nome: true, telefone: true } },
        vendedora: { select: { nome: true } },
        loja: { select: { nome: true, rede: { select: { nome: true, logoUrl: true } } } },
        itens: {
          include: {
            variacao: {
              select: {
                cor: true, estampa: true, tamanho: true,
                produto: { select: { nome: true, referencia: true, fotos: true } },
              },
            },
          },
        },
      },
    })
    if (!venda) return reply.code(404).send({ erro: 'Venda não encontrada' })
    return venda
  })

  // Comprovante PÚBLICO (sem login): o cliente abre/imprime pelo link com o token.
  // Mesmo conteúdo do comprovante; o token é não-adivinhável (uuid/cuid).
  app.get('/publico/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const venda = await prisma.venda.findUnique({
      where: { tokenPublico: token },
      include: {
        cliente: { select: { nome: true, telefone: true } },
        vendedora: { select: { nome: true } },
        loja: { select: { nome: true, rede: { select: { nome: true, logoUrl: true } } } },
        itens: {
          include: {
            variacao: {
              select: {
                cor: true, estampa: true, tamanho: true,
                produto: { select: { nome: true, referencia: true, fotos: true } },
              },
            },
          },
        },
      },
    })
    if (!venda) return reply.code(404).send({ erro: 'Pedido não encontrado' })
    return venda
  })

  // Pedidos a separar (gestor de estoque + gerente): pedidos fechados, pendentes por padrão.
  // O gerente acompanha/cobra; o gestor de estoque marca como separado.
  app.get('/separacao', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'ESTOQUISTA')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { status } = request.query as { status?: string } // 'todos' = inclui já separados
    const where: Prisma.VendaWhereInput = { lojaId, status: 'CONCLUIDA' }
    if (status !== 'todos') where.separado = false

    const vendas = await prisma.venda.findMany({
      where,
      orderBy: [{ separado: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true, tokenPublico: true, createdAt: true, total: true, atacado: true,
        separado: true, separadoEm: true,
        cliente: { select: { nome: true } },
        vendedora: { select: { nome: true } },
        itens: { select: { quantidade: true } },
      },
    })
    return vendas.map((v) => ({
      id: v.id, tokenPublico: v.tokenPublico, createdAt: v.createdAt, total: v.total,
      atacado: v.atacado, separado: v.separado, separadoEm: v.separadoEm,
      cliente: v.cliente?.nome ?? 'Consumidor avulso',
      vendedora: v.vendedora.nome,
      pecas: v.itens.reduce((s, i) => s + i.quantidade, 0),
    }))
  })

  // Marca/desmarca o pedido como separado fisicamente.
  app.patch('/:id/separado', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'ESTOQUISTA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const { separado } = z.object({ separado: z.boolean() }).parse(request.body)
    const venda = await prisma.venda.findFirst({ where: { id, lojaId }, select: { id: true } })
    if (!venda) return reply.code(404).send({ erro: 'Pedido não encontrado' })
    return prisma.venda.update({
      where: { id },
      data: { separado, separadoEm: separado ? new Date() : null },
      select: { id: true, separado: true, separadoEm: true },
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

    // Estoque central: a peça precisa ser da rede da loja E ter a coleção distribuída a ela.
    const lojaRede = await prisma.loja.findUnique({
      where: { id: lojaId },
      select: { rede: { select: { id: true, pedidoMinimoAtacado: true, descontoAutoMaxPct: true, descontoSenhaMaxPct: true } } },
    })
    const redeId = lojaRede?.rede?.id
    if (!redeId) return reply.code(422).send({ erro: 'Loja sem marca vinculada' })

    // Carrega variações com produto e valida a distribuição à loja
    const ids = body.itens.map((i) => i.variacaoId)
    const variacoes = await prisma.variacaoProduto.findMany({
      where: { id: { in: ids }, produto: { redeId, colecao: { lojas: { some: { lojaId } } } } },
      include: { produto: { include: { colecao: { select: { status: true, nome: true } } } } },
    })
    const porId = new Map(variacoes.map((v) => [v.id, v]))

    // Canal por QUANTIDADE de peças no carrinho: nº de peças >= mínimo da rede ⇒ ATACADO.
    // O gestor também pode forçar atacado manualmente (body.atacado).
    const totalPecas = body.itens.reduce((s, i) => s + i.quantidade, 0)
    const minimoAtacado = lojaRede?.rede?.pedidoMinimoAtacado ?? 6
    const autoMax = lojaRede?.rede?.descontoAutoMaxPct ?? 10
    const senhaMax = lojaRede?.rede?.descontoSenhaMaxPct ?? 15
    const atacado = body.atacado || totalPecas >= minimoAtacado

    // Estoque por canal: a reserva de varejo (estoqueVarejo) é EXCLUSIVA do varejo;
    // o atacado só pode usar o restante (estoque − estoqueVarejo).
    for (const item of body.itens) {
      const v = porId.get(item.variacaoId)
      if (!v) return reply.code(422).send({ erro: `Variação ${item.variacaoId} indisponível nesta loja (coleção não distribuída)` })
      // Coleção em preparação ainda não está disponível para venda (liberação simultânea).
      if (request.user.role === 'VENDEDORA' && v.produto.colecao && v.produto.colecao.status !== 'LIBERADA') {
        return reply.code(422).send({ erro: `A coleção "${v.produto.colecao.nome}" ainda não foi liberada` })
      }
      const dispAtacado = v.estoque - v.estoqueVarejo
      if (atacado) {
        if (dispAtacado < item.quantidade) {
          return reply.code(422).send({ erro: `Estoque de atacado insuficiente: ${v.produto.nome} ${v.cor}/${v.tamanho} tem ${dispAtacado} un para atacado (pedido: ${item.quantidade}); o restante está reservado para varejo` })
        }
      } else if (v.estoqueVarejo < item.quantidade) {
        return reply.code(422).send({ erro: `Estoque de varejo insuficiente: ${v.produto.nome} ${v.cor}/${v.tamanho} tem ${v.estoqueVarejo} un reservada(s) para varejo (pedido: ${item.quantidade})` })
      }
    }

    // Preço: informado > atacado (se venda atacado e produto tem) > varejo
    const itensCalculados = body.itens.map((item) => {
      const v = porId.get(item.variacaoId)!
      const preco =
        item.precoUnitario ??
        (atacado && v.produto.precoAtacado ? Number(v.produto.precoAtacado) : Number(v.produto.precoVarejo))
      return { ...item, precoUnitario: preco }
    })
    const bruto = itensCalculados.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0)

    // Desconto: % tem prioridade; senão usa o valor (e deriva o %).
    const pct = body.descontoPct != null
      ? body.descontoPct
      : (bruto > 0 ? Math.round((body.desconto / bruto) * 10000) / 100 : 0)
    const descontoValor = Math.round(bruto * (pct / 100) * 100) / 100
    const total = Math.max(0, bruto - descontoValor)

    // ── Autorização do desconto por nível ──
    // ≤ autoMax: livre · (autoMax, senhaMax]: senha da própria · > senhaMax: gerente/gestor
    let autorizadoPorId: string | null = null
    let autorizadoPorNome: string | null = null
    if (pct > autoMax) {
      const ehGestor = ['SUPER_ADMIN', 'GESTOR', 'GERENTE'].includes(request.user.role)
      if (pct <= senhaMax || ehGestor) {
        // Confirma a identidade de quem está aplicando (vendedora ou o próprio gerente).
        const eu = await prisma.usuario.findUnique({ where: { id: request.user.sub }, select: { senhaHash: true, nome: true } })
        const senha = body.autorizacao?.senha ?? ''
        if (!eu || !(await bcrypt.compare(senha, eu.senhaHash))) {
          return reply.code(403).send({ erro: 'SENHA_NECESSARIA', detalhe: 'Confirme sua senha para aplicar este desconto.' })
        }
        if (ehGestor) { autorizadoPorId = request.user.sub; autorizadoPorNome = eu.nome }
      } else {
        // Vendedora aplicando acima do limite: precisa de um gerente/gestor para autorizar.
        const email = (body.autorizacao?.gerenteEmail ?? '').toLowerCase()
        const gerente = email
          ? await prisma.usuario.findFirst({
              where: { email, ativo: true, role: { in: ['GESTOR', 'GERENTE'] } },
              select: { id: true, nome: true, senhaHash: true, redeId: true, loja: { select: { redeId: true } } },
            })
          : null
        const mesmaRede = gerente && (gerente.redeId === redeId || gerente.loja?.redeId === redeId)
        if (!gerente || !mesmaRede || !(await bcrypt.compare(body.autorizacao?.gerenteSenha ?? '', gerente.senhaHash))) {
          return reply.code(403).send({ erro: 'GERENTE_NECESSARIO', detalhe: 'Desconto acima do limite: precisa da autorização de um gerente.' })
        }
        autorizadoPorId = gerente.id; autorizadoPorNome = gerente.nome
      }
    }

    const venda = await prisma.$transaction(async (tx) => {
      const criada = await tx.venda.create({
        data: {
          lojaId,
          clienteId: body.clienteId,
          vendedoraId,
          canal: body.canal,
          atacado,
          formaRecebimento: body.formaRecebimento,
          desconto: descontoValor,
          descontoPct: pct,
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

      // Auditoria de desconto (quem aplicou, quanto, quem autorizou).
      if (pct > 0) {
        const aplicador = await tx.usuario.findUnique({ where: { id: request.user.sub }, select: { nome: true } })
        await tx.auditoriaDesconto.create({
          data: {
            lojaId, vendaId: criada.id, usuarioId: request.user.sub, usuarioNome: aplicador?.nome ?? '—',
            pct, valorBruto: bruto, valorDesconto: descontoValor, autorizadoPorId, autorizadoPorNome,
          },
        })
      }

      // Baixa automática de estoque + movimento por SKU. Atômica (condição no WHERE) para
      // fechar a corrida entre vendas simultâneas, respeitando o balde do canal:
      // - VAREJO: baixa da reserva (estoque e estoqueVarejo juntos).
      // - ATACADO: baixa só do estoque, exigindo (estoque − estoqueVarejo) suficiente.
      for (const item of itensCalculados) {
        let ok: boolean
        if (atacado) {
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
        if (atacado || novoTotal >= Number(cliente.loja.limiteAtacado)) segmento = 'ATACADO'
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

    // Conversão do funil: fecha como CONVERTIDO o ciclo aberto daquele cliente (se houver).
    if (body.clienteId) {
      await converterCicloPorVenda({ lojaId, clienteId: body.clienteId, vendedoraId, vendaId: venda.id })
    }

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
        // Devolve ao balde de onde saiu: venda de varejo restaura também a reserva de varejo.
        await tx.variacaoProduto.update({
          where: { id: item.variacaoId },
          data: venda.atacado
            ? { estoque: { increment: item.quantidade } }
            : { estoque: { increment: item.quantidade }, estoqueVarejo: { increment: item.quantidade } },
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

  // Config de desconto (régua + limites) que o PDV consome.
  app.get('/config-desconto', { preHandler: [app.authenticate] }, async (request) => {
    const redeId = request.user.redeId
    const rede = redeId
      ? await prisma.rede.findUnique({ where: { id: redeId }, select: { descontoRegua: true, descontoAutoMaxPct: true, descontoSenhaMaxPct: true } })
      : null
    return {
      regua: (rede?.descontoRegua as { ate: number | null; pct: number }[] | null) ?? REGUA_PADRAO,
      autoMaxPct: rede?.descontoAutoMaxPct ?? 10,
      senhaMaxPct: rede?.descontoSenhaMaxPct ?? 15,
    }
  })

  // Gestor edita a régua/limites (UI de config vem depois; endpoint já disponível).
  app.patch('/config-desconto', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = request.user.redeId
    if (!redeId) return reply.code(400).send({ erro: 'Sem rede no contexto' })
    const body = z.object({
      regua: z.array(z.object({ ate: z.number().nullable(), pct: z.number().min(0).max(90) })).optional(),
      autoMaxPct: z.number().int().min(0).max(90).optional(),
      senhaMaxPct: z.number().int().min(0).max(90).optional(),
    }).parse(request.body)
    return prisma.rede.update({
      where: { id: redeId },
      data: {
        ...(body.regua ? { descontoRegua: body.regua } : {}),
        ...(body.autoMaxPct != null ? { descontoAutoMaxPct: body.autoMaxPct } : {}),
        ...(body.senhaMaxPct != null ? { descontoSenhaMaxPct: body.senhaMaxPct } : {}),
      },
      select: { descontoRegua: true, descontoAutoMaxPct: true, descontoSenhaMaxPct: true },
    })
  })

  // Histórico de auditoria de descontos (gestor/gerente).
  app.get('/auditoria-desconto', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    return prisma.auditoriaDesconto.findMany({ where: { lojaId }, orderBy: { createdAt: 'desc' }, take: 100 })
  })
}

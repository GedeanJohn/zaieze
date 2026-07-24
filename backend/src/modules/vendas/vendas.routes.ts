import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import sharp from 'sharp'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { gerarPedidoPdf, type VendaPdf } from './pedido-pdf.service'
import { criarVenda, VendaError } from './vendas.service'
import { enviarParaR2 } from '../midia/r2.service'
import { salvarUploadLocal } from '../midia/midia.routes'

const TIPOS_COMPROVANTE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'application/pdf'])

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
        loja: { select: { nome: true, rede: { select: { nome: true, logoUrl: true, chavePixTipo: true, chavePix: true, linkPagamentoCartao: true } } } },
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

  // Comprovante de PAGAMENTO (distinto do comprovante do pedido/PDF acima): o cliente anexa a
  // foto/PDF do PIX na própria tela pública, depois de aprovar o orçamento e pagar por fora do
  // app. Fica visível pra quem confere o recebimento em "Pedidos a separar" antes de marcar
  // `pagamentoConferido` — hoje esse passo era só de confiança, sem nenhuma evidência anexada.
  app.post('/publico/:token/comprovante', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { token } = request.params as { token: string }
    const venda = await prisma.venda.findUnique({ where: { tokenPublico: token }, select: { id: true, lojaId: true } })
    if (!venda) return reply.code(404).send({ erro: 'Pedido não encontrado' })

    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo no campo "file"' })
    if (!TIPOS_COMPROVANTE.has(arquivo.mimetype)) return reply.code(422).send({ erro: 'Formato inválido. Use PNG, JPG, WEBP, AVIF ou PDF.' })

    const original = await arquivo.toBuffer()
    let buffer = original
    let ext = 'pdf'
    let contentType = 'application/pdf'
    if (arquivo.mimetype !== 'application/pdf') {
      buffer = await sharp(original).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
      ext = 'webp'
      contentType = 'image/webp'
    }
    const url = (await enviarParaR2({ buffer, contentType, ext, lojaId: venda.lojaId, pasta: 'comprovantes' })) ?? (await salvarUploadLocal(buffer, ext))

    await prisma.venda.update({ where: { id: venda.id }, data: { comprovantePagamentoUrl: url, comprovanteEnviadoEm: new Date() } })
    return { comprovantePagamentoUrl: url }
  })

  // PDF do comprovante (público, por token): gerado no backend, baixável/anexável.
  app.get('/publico/:token/pdf', async (request, reply) => {
    const { token } = request.params as { token: string }
    const venda = await prisma.venda.findUnique({
      where: { tokenPublico: token },
      include: {
        cliente: { select: { nome: true, telefone: true } },
        vendedora: { select: { nome: true } },
        loja: { select: { nome: true, rede: { select: { nome: true } } } },
        itens: { include: { variacao: { select: { cor: true, estampa: true, tamanho: true, produto: { select: { nome: true, referencia: true } } } } } },
      },
    })
    if (!venda) return reply.code(404).send({ erro: 'Pedido não encontrado' })
    const pdf = await gerarPedidoPdf(venda as unknown as VendaPdf)
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `inline; filename="pedido-${venda.id.slice(-6).toUpperCase()}.pdf"`)
    return reply.send(pdf)
  })

  // Pedidos a separar (gestor de estoque + gerente): pedidos fechados, pendentes por padrão.
  // O gerente acompanha/cobra a equipe inteira aqui — inclusive a etapa ENTREGUE, que só a
  // vendedora confirma (ver /:id/status-entrega); esta tela é só leitura pra essa última etapa.
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
        id: true, tokenPublico: true, createdAt: true, total: true, atacado: true, canal: true,
        separado: true, separadoEm: true, statusEntrega: true, statusEntregaEm: true,
        pagamentoConferido: true, pagamentoConferidoEm: true,
        comprovantePagamentoUrl: true,
        cliente: { select: { nome: true } },
        vendedora: { select: { nome: true } },
        itens: { select: { quantidade: true } },
      },
    })
    return vendas.map((v) => ({
      id: v.id, tokenPublico: v.tokenPublico, createdAt: v.createdAt, total: v.total,
      atacado: v.atacado, canal: v.canal, separado: v.separado, separadoEm: v.separadoEm,
      statusEntrega: v.statusEntrega, statusEntregaEm: v.statusEntregaEm,
      pagamentoConferido: v.pagamentoConferido, pagamentoConferidoEm: v.pagamentoConferidoEm,
      comprovantePagamentoUrl: v.comprovantePagamentoUrl,
      cliente: v.cliente?.nome ?? 'Consumidor avulso',
      vendedora: v.vendedora.nome,
      pecas: v.itens.reduce((s, i) => s + i.quantidade, 0),
    }))
  })

  // Etapas de entrega: SEPARANDO → TRANSPORTADORA → EM_TRANSITO são do gestor de estoque/gerente
  // (tela "Pedidos a separar"); ENTREGUE só a VENDEDORA dona do pedido confirma (em "Meu pedido").
  // `separado` (booleano legado) continua em sincronia — vira true assim que sai de SEPARANDO.
  const statusEntregaSchema = z.object({ statusEntrega: z.enum(['SEPARANDO', 'TRANSPORTADORA', 'EM_TRANSITO', 'ENTREGUE']) })
  app.patch('/:id/status-entrega', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'ESTOQUISTA', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const { statusEntrega } = statusEntregaSchema.parse(request.body)
    const role = request.user.role

    if (statusEntrega === 'ENTREGUE') {
      if (role !== 'VENDEDORA' && role !== 'SUPER_ADMIN') return reply.code(403).send({ erro: 'Só a vendedora do pedido confirma a entrega.' })
    } else if (role === 'VENDEDORA') {
      return reply.code(403).send({ erro: 'Essa etapa é do gestor de estoque.' })
    }

    const where: Prisma.VendaWhereInput = { id, lojaId }
    if (role === 'VENDEDORA') where.vendedoraId = request.user.sub
    const venda = await prisma.venda.findFirst({ where, select: { id: true } })
    if (!venda) return reply.code(404).send({ erro: 'Pedido não encontrado' })

    return prisma.venda.update({
      where: { id },
      data: {
        statusEntrega, statusEntregaEm: new Date(),
        separado: statusEntrega !== 'SEPARANDO',
        separadoEm: statusEntrega !== 'SEPARANDO' ? new Date() : null,
      },
      select: { id: true, statusEntrega: true, statusEntregaEm: true, separado: true, separadoEm: true },
    })
  })

  // Marca/desmarca a conferência do recebimento (bater com o extrato bancário) — passo manual
  // antes da separação física. Mais relevante para vendas ONLINE (Vendedora ZAIEZE): ninguém
  // humano viu o pagamento até este ponto.
  app.patch('/:id/pagamento-conferido', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'ESTOQUISTA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const { pagamentoConferido } = z.object({ pagamentoConferido: z.boolean() }).parse(request.body)
    const venda = await prisma.venda.findFirst({ where: { id, lojaId }, select: { id: true } })
    if (!venda) return reply.code(404).send({ erro: 'Pedido não encontrado' })
    return prisma.venda.update({
      where: { id },
      data: { pagamentoConferido, pagamentoConferidoEm: pagamentoConferido ? new Date() : null },
      select: { id: true, pagamentoConferido: true, pagamentoConferidoEm: true },
    })
  })

  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarVendaSchema.parse(request.body)

    // Vendedora sempre vende em nome próprio; gerente/gestor podem indicar a vendedora
    const vendedoraId = request.user.role === 'VENDEDORA' ? request.user.sub : body.vendedoraId
    if (!vendedoraId) return reply.code(422).send({ erro: 'Informe a vendedora da venda' })

    try {
      const venda = await criarVenda({
        lojaId,
        solicitanteId: request.user.sub,
        solicitanteRole: request.user.role,
        vendedoraId,
        clienteId: body.clienteId,
        canal: body.canal,
        atacado: body.atacado,
        formaRecebimento: body.formaRecebimento,
        desconto: body.desconto,
        descontoPct: body.descontoPct,
        observacao: body.observacao,
        itens: body.itens,
        autorizacao: body.autorizacao,
      })
      return reply.code(201).send(venda)
    } catch (err) {
      if (err instanceof VendaError) return reply.code(err.statusCode).send({ erro: err.message, detalhe: err.detalhe })
      throw err
    }
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

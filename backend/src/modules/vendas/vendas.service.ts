import bcrypt from 'bcryptjs'
import type { CanalVenda, FormaRecebimento, Role } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { converterCicloPorVenda } from '../leads/leads.service'

/** Erro de negócio da venda — carrega o status HTTP certo pra quem chamou por uma rota
 *  traduzir; quem chama internamente (ex.: Vendedora ZAIEZE) só lê message/detalhe. */
export class VendaError extends Error {
  statusCode: number
  detalhe?: string
  constructor(statusCode: number, message: string, detalhe?: string) {
    super(message)
    this.statusCode = statusCode
    this.detalhe = detalhe
  }
}

export interface ItemVendaInput { variacaoId: string; quantidade: number; precoUnitario?: number }

export interface CriarVendaParams {
  lojaId: string
  // Quem está fazendo a chamada (auditoria de desconto + regra de coleção liberada/nível de
  // autorização). Numa venda humana é o usuário logado; na Vendedora ZAIEZE é o Usuario sintético.
  solicitanteId: string
  solicitanteRole: Role
  vendedoraId: string
  clienteId?: string
  canal: CanalVenda
  atacado?: boolean
  formaRecebimento?: FormaRecebimento
  desconto?: number
  descontoPct?: number
  observacao?: string
  itens: ItemVendaInput[]
  autorizacao?: { senha?: string; gerenteEmail?: string; gerenteSenha?: string }
}

/**
 * Cria uma Venda com toda a validação de estoque/preço/atacado/desconto já existente —
 * extraída de `POST /vendas` pra ser reaproveitada pela Vendedora ZAIEZE (fecha venda sozinha,
 * sem passar por uma rota HTTP autenticada por sessão humana) sem duplicar essas regras.
 */
export async function criarVenda(params: CriarVendaParams) {
  const {
    lojaId, solicitanteId, solicitanteRole, vendedoraId, clienteId, canal,
    atacado: atacadoForcado = false, formaRecebimento = 'DINHEIRO', desconto = 0, descontoPct,
    observacao, itens, autorizacao,
  } = params

  const vendedora = await prisma.usuario.findFirst({
    where: { id: vendedoraId, lojaId, role: { in: ['VENDEDORA', 'GERENTE'] }, ativo: true },
  })
  if (!vendedora) throw new VendaError(422, 'Vendedora inválida para esta loja')

  if (clienteId) {
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, lojaId } })
    if (!cliente) throw new VendaError(422, 'Cliente inválido para esta loja')
  }

  // Estoque central: a peça precisa ser da rede da loja E ter a coleção distribuída a ela.
  const lojaRede = await prisma.loja.findUnique({
    where: { id: lojaId },
    select: { rede: { select: { id: true, pedidoMinimoAtacado: true, descontoAutoMaxPct: true, descontoSenhaMaxPct: true } } },
  })
  const redeId = lojaRede?.rede?.id
  if (!redeId) throw new VendaError(422, 'Loja sem marca vinculada')

  // Carrega variações com produto e valida a distribuição à loja
  const ids = itens.map((i) => i.variacaoId)
  const variacoes = await prisma.variacaoProduto.findMany({
    where: { id: { in: ids }, produto: { redeId, colecao: { lojas: { some: { lojaId } } } } },
    include: { produto: { include: { colecao: { select: { status: true, nome: true } } } } },
  })
  const porId = new Map(variacoes.map((v) => [v.id, v]))

  // Canal por QUANTIDADE de peças no carrinho: nº de peças >= mínimo da rede ⇒ ATACADO.
  const totalPecas = itens.reduce((s, i) => s + i.quantidade, 0)
  const minimoAtacado = lojaRede?.rede?.pedidoMinimoAtacado ?? 6
  const autoMax = lojaRede?.rede?.descontoAutoMaxPct ?? 10
  const senhaMax = lojaRede?.rede?.descontoSenhaMaxPct ?? 15
  const atacado = atacadoForcado || totalPecas >= minimoAtacado

  // Estoque por canal: a reserva de varejo (estoqueVarejo) é EXCLUSIVA do varejo;
  // o atacado só pode usar o restante (estoque − estoqueVarejo).
  for (const item of itens) {
    const v = porId.get(item.variacaoId)
    if (!v) throw new VendaError(422, `Variação ${item.variacaoId} indisponível nesta loja (coleção não distribuída)`)
    // Coleção em preparação ainda não está disponível para venda (liberação simultânea).
    if (solicitanteRole === 'VENDEDORA' && v.produto.colecao && v.produto.colecao.status !== 'LIBERADA') {
      throw new VendaError(422, `A coleção "${v.produto.colecao.nome}" ainda não foi liberada`)
    }
    const dispAtacado = v.estoque - v.estoqueVarejo
    if (atacado) {
      if (dispAtacado < item.quantidade) {
        throw new VendaError(422, `Estoque de atacado insuficiente: ${v.produto.nome} ${v.cor}/${v.tamanho} tem ${dispAtacado} un para atacado (pedido: ${item.quantidade}); o restante está reservado para varejo`)
      }
    } else if (v.estoqueVarejo < item.quantidade) {
      throw new VendaError(422, `Estoque de varejo insuficiente: ${v.produto.nome} ${v.cor}/${v.tamanho} tem ${v.estoqueVarejo} un reservada(s) para varejo (pedido: ${item.quantidade})`)
    }
  }

  // Preço: informado > atacado (se venda atacado e produto tem) > varejo
  const itensCalculados = itens.map((item) => {
    const v = porId.get(item.variacaoId)!
    const preco = item.precoUnitario ?? (atacado && v.produto.precoAtacado ? Number(v.produto.precoAtacado) : Number(v.produto.precoVarejo))
    return { ...item, precoUnitario: preco }
  })
  const bruto = itensCalculados.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0)

  // Desconto: % tem prioridade; senão usa o valor (e deriva o %).
  const pct = descontoPct != null
    ? descontoPct
    : (bruto > 0 ? Math.round((desconto / bruto) * 10000) / 100 : 0)
  const descontoValor = Math.round(bruto * (pct / 100) * 100) / 100
  const total = Math.max(0, bruto - descontoValor)

  // ── Autorização do desconto por nível ──
  // ≤ autoMax: livre · (autoMax, senhaMax]: senha da própria · > senhaMax: gerente/gestor
  let autorizadoPorId: string | null = null
  let autorizadoPorNome: string | null = null
  if (pct > autoMax) {
    const ehGestor = ['SUPER_ADMIN', 'GESTOR', 'GERENTE'].includes(solicitanteRole)
    if (pct <= senhaMax || ehGestor) {
      const eu = await prisma.usuario.findUnique({ where: { id: solicitanteId }, select: { senhaHash: true, nome: true } })
      const senha = autorizacao?.senha ?? ''
      if (!eu || !(await bcrypt.compare(senha, eu.senhaHash))) {
        throw new VendaError(403, 'SENHA_NECESSARIA', 'Confirme sua senha para aplicar este desconto.')
      }
      if (ehGestor) { autorizadoPorId = solicitanteId; autorizadoPorNome = eu.nome }
    } else {
      const email = (autorizacao?.gerenteEmail ?? '').toLowerCase()
      const gerente = email
        ? await prisma.usuario.findFirst({
            where: { email, ativo: true, role: { in: ['GESTOR', 'GERENTE'] } },
            select: { id: true, nome: true, senhaHash: true, redeId: true, loja: { select: { redeId: true } } },
          })
        : null
      const mesmaRede = gerente && (gerente.redeId === redeId || gerente.loja?.redeId === redeId)
      if (!gerente || !mesmaRede || !(await bcrypt.compare(autorizacao?.gerenteSenha ?? '', gerente.senhaHash))) {
        throw new VendaError(403, 'GERENTE_NECESSARIO', 'Desconto acima do limite: precisa da autorização de um gerente.')
      }
      autorizadoPorId = gerente.id; autorizadoPorNome = gerente.nome
    }
  }

  const venda = await prisma.$transaction(async (tx) => {
    const criada = await tx.venda.create({
      data: {
        lojaId,
        clienteId,
        vendedoraId,
        canal,
        atacado,
        formaRecebimento,
        desconto: descontoValor,
        descontoPct: pct,
        observacao,
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
      const aplicador = await tx.usuario.findUnique({ where: { id: solicitanteId }, select: { nome: true } })
      await tx.auditoriaDesconto.create({
        data: {
          lojaId, vendaId: criada.id, usuarioId: solicitanteId, usuarioNome: aplicador?.nome ?? '—',
          pct, valorBruto: bruto, valorDesconto: descontoValor, autorizadoPorId, autorizadoPorNome,
        },
      })
    }

    // Baixa automática de estoque + movimento por SKU. Atômica (condição no WHERE) para
    // fechar a corrida entre vendas simultâneas, respeitando o balde do canal.
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
        throw new VendaError(409, `Estoque esgotado durante a venda: ${v.produto.nome} ${v.cor}/${v.tamanho}`)
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
    if (clienteId) {
      const cliente = await tx.cliente.findUniqueOrThrow({ where: { id: clienteId }, include: { loja: true } })
      const novoTotal = Number(cliente.totalGasto) + total
      let segmento = cliente.segmento
      if (atacado || novoTotal >= Number(cliente.loja.limiteAtacado)) segmento = 'ATACADO'
      else if (novoTotal > 3000) segmento = 'VIP'
      else if (cliente.segmento === 'INATIVO') segmento = 'FREQUENTE'

      await tx.cliente.update({
        where: { id: clienteId },
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
  if (clienteId) {
    await converterCicloPorVenda({ lojaId, clienteId, vendedoraId, vendaId: venda.id })
  }

  return venda
}

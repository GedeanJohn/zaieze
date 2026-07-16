import { prisma } from '../../lib/prisma'
import { criarVenda, VendaError } from '../vendas/vendas.service'

/** Contexto fixo da conversa (não muda entre chamadas de ferramenta de um mesmo turno). */
export interface ContextoIA {
  redeId: string
  lojaId: string
  usuarioIaId: string
  clienteId: string
}

/** Descrição das ferramentas no formato esperado pela Messages API da Anthropic
 *  (JSON Schema em `input_schema`). Mantém a orquestração do prompt (service) separada
 *  da definição/execução das ferramentas, pra ficar testável isoladamente. */
export const FERRAMENTAS = [
  {
    name: 'buscar_colecoes',
    description: 'Lista as coleções (categorias de produtos) atualmente disponíveis para venda nesta loja.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'buscar_produtos',
    description: 'Busca produtos dentro de uma coleção e/ou por palavra-chave no nome. Devolve preço e as cores/tamanhos com estoque disponível.',
    input_schema: {
      type: 'object' as const,
      properties: {
        colecaoId: { type: 'string', description: 'id de uma coleção (opcional, vindo de buscar_colecoes)' },
        busca: { type: 'string', description: 'palavra-chave no nome do produto (opcional)' },
      },
      required: [],
    },
  },
  {
    name: 'checar_estoque',
    description: 'Confirma o estoque exato (por cor/tamanho) de um produto específico antes de fechar a venda.',
    input_schema: {
      type: 'object' as const,
      properties: { produtoId: { type: 'string' } },
      required: ['produtoId'],
    },
  },
  {
    name: 'fechar_venda',
    description:
      'Fecha o pedido do cliente. Só use depois que o cliente CONFIRMOU explicitamente os itens e disse que já pagou (PIX/transferência) ou está enviando o comprovante. Não aplica desconto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        itens: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              variacaoId: { type: 'string', description: 'id exato vindo de checar_estoque' },
              quantidade: { type: 'integer', minimum: 1 },
            },
            required: ['variacaoId', 'quantidade'],
          },
        },
        observacao: { type: 'string', description: 'algo que o cliente pediu pra anotar no pedido (opcional)' },
      },
      required: ['itens'],
    },
  },
  {
    name: 'transferir_para_humano',
    description: 'Sinaliza que este atendimento precisa de uma pessoa da equipe (pedido fora do que você resolve: reclamação, negociação, dúvida que você não sabe responder). Avisa o cliente com uma frase gentil e encerra sua participação neste turno.',
    input_schema: {
      type: 'object' as const,
      properties: { motivo: { type: 'string' } },
      required: [],
    },
  },
]

async function buscarColecoes(ctx: ContextoIA) {
  const colecoes = await prisma.colecao.findMany({
    where: {
      lojas: { some: { lojaId: ctx.lojaId } },
      status: 'LIBERADA',
      OR: [{ validadeAte: null }, { validadeAte: { gte: new Date() } }],
      produtos: { some: { ativo: true } },
    },
    select: { id: true, nome: true, descricao: true, outlet: true },
    orderBy: { nome: 'asc' },
    take: 20,
  })
  return { colecoes }
}

async function buscarProdutos(ctx: ContextoIA, input: { colecaoId?: string; busca?: string }) {
  const produtos = await prisma.produto.findMany({
    where: {
      redeId: ctx.redeId,
      ativo: true,
      colecao: { lojas: { some: { lojaId: ctx.lojaId } }, status: 'LIBERADA' },
      ...(input.colecaoId ? { colecaoId: input.colecaoId } : {}),
      ...(input.busca ? { nome: { contains: input.busca, mode: 'insensitive' } } : {}),
    },
    select: {
      id: true, nome: true, descricao: true, precoVarejo: true, precoAtacado: true,
      variacoes: { select: { cor: true, tamanho: true, estoque: true, estoqueVarejo: true } },
    },
    take: 12,
  })
  return {
    produtos: produtos.map((p) => ({
      id: p.id, nome: p.nome, descricao: p.descricao,
      precoVarejo: Number(p.precoVarejo), precoAtacado: p.precoAtacado != null ? Number(p.precoAtacado) : null,
      coresTamanhosDisponiveis: p.variacoes.filter((v) => v.estoqueVarejo > 0).map((v) => `${v.cor}/${v.tamanho}`),
    })),
  }
}

async function checarEstoque(ctx: ContextoIA, input: { produtoId: string }) {
  const produto = await prisma.produto.findFirst({
    where: { id: input.produtoId, redeId: ctx.redeId },
    select: {
      id: true, nome: true,
      variacoes: { select: { id: true, cor: true, tamanho: true, estoque: true, estoqueVarejo: true } },
    },
  })
  if (!produto) return { erro: 'Produto não encontrado.' }
  return {
    produto: produto.nome,
    variacoes: produto.variacoes.map((v) => ({
      variacaoId: v.id, cor: v.cor, tamanho: v.tamanho, disponivel: v.estoqueVarejo,
    })),
  }
}

async function fecharVenda(ctx: ContextoIA, input: { itens: { variacaoId: string; quantidade: number }[]; observacao?: string }) {
  if (!input.itens?.length) return { erro: 'Nenhum item informado.' }
  try {
    const venda = await criarVenda({
      lojaId: ctx.lojaId,
      solicitanteId: ctx.usuarioIaId,
      solicitanteRole: 'VENDEDORA',
      vendedoraId: ctx.usuarioIaId,
      clienteId: ctx.clienteId,
      canal: 'ONLINE',
      formaRecebimento: 'PIX',
      itens: input.itens,
      observacao: input.observacao,
    })
    return {
      sucesso: true, vendaId: venda.id, total: Number(venda.total),
      mensagem: 'Pedido fechado. Vai passar por conferência do pagamento antes da separação — combine com o cliente que a equipe confirma o recebimento em breve.',
    }
  } catch (err) {
    if (err instanceof VendaError) return { sucesso: false, erro: err.message }
    throw err
  }
}

async function transferirParaHumano(ctx: ContextoIA, input: { motivo?: string }) {
  await prisma.cliente.update({
    where: { id: ctx.clienteId },
    data: {
      observacoes: input.motivo
        ? `Vendedora ZAIEZE pediu apoio humano: ${input.motivo}`
        : 'Vendedora ZAIEZE pediu apoio humano.',
    },
  })
  return { ok: true }
}

/** Executa uma ferramenta pelo nome (chamada pelo motor de conversa após o Claude decidir usá-la). */
export async function executarFerramenta(nome: string, input: unknown, ctx: ContextoIA): Promise<unknown> {
  switch (nome) {
    case 'buscar_colecoes': return buscarColecoes(ctx)
    case 'buscar_produtos': return buscarProdutos(ctx, input as { colecaoId?: string; busca?: string })
    case 'checar_estoque': return checarEstoque(ctx, input as { produtoId: string })
    case 'fechar_venda': return fecharVenda(ctx, input as { itens: { variacaoId: string; quantidade: number }[]; observacao?: string })
    case 'transferir_para_humano': return transferirParaHumano(ctx, input as { motivo?: string })
    default: return { erro: `Ferramenta desconhecida: ${nome}` }
  }
}

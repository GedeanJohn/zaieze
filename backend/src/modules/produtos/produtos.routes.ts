import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { excluirDoR2 } from '../midia/r2.service'

const variacaoSchema = z.object({
  cor: z.string().min(1),
  estampa: z.string().trim().optional().default(''), // opcional; vazio = sem estampa
  tamanho: z.string().min(1),
  codigoBarras: z.string().optional(), // EAN/GTIN — opcional
  estoque: z.coerce.number().int().nonnegative().default(0),
  estoqueMinimo: z.coerce.number().int().nonnegative().default(2),
})

const criarProdutoSchema = z.object({
  // Essenciais
  nome: z.string().min(2), // nome do modelo (ex.: "Júlia")
  genero: z.enum(['FEMININO', 'MASCULINO', 'UNISSEX', 'INFANTIL']).default('FEMININO'),
  categoria: z.string().optional(), // tipo de peça (ex.: "Vestido Longo")
  precoVarejo: z.coerce.number().positive(),
  // Referência do modelo (estoquista informa; gerada automaticamente quando vazia)
  referencia: z.string().optional(),
  // Opcionais
  descricao: z.string().optional(),
  marca: z.string().optional(),
  colecao: z.string().optional(),
  precoAtacado: z.coerce.number().positive().optional(),
  custo: z.coerce.number().nonnegative().optional(),
  composicao: z.string().optional(),
  modelagem: z.string().optional(),
  ncm: z.string().optional(),
  fornecedor: z.string().optional(),
  pesoGramas: z.coerce.number().int().nonnegative().optional(),
  faixaEtaria: z.string().optional(),
  fotos: z.array(z.string().url()).default([]),
  fotosCores: z.array(z.string()).default([]), // cor de cada foto, alinhado a `fotos` ('' = todas)
  videos: z.array(z.string().url()).default([]),
  variacoes: z.array(variacaoSchema).min(1, 'Informe ao menos uma variação (cor × tamanho)'),
})

const atualizarProdutoSchema = criarProdutoSchema.partial().extend({
  ativo: z.boolean().optional(),
})

/** Normaliza um texto para compor códigos: sem acento, só A-Z0-9, maiúsculo. */
function normCodigo(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
}

/** Mantém a referência legível (preserva hífens), só limpa espaços/símbolos. */
function limpaReferencia(referencia: string): string {
  return referencia.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '').slice(0, 24)
}

/** SKU legível = referência + cor + (estampa) + tamanho (ex.: VST-1042-AZUL-PAISLEY-M). */
function skuBase(referencia: string, cor: string, estampa: string, tamanho: string): string {
  return [
    limpaReferencia(referencia),
    normCodigo(cor).slice(0, 8),
    ...(estampa ? [normCodigo(estampa).slice(0, 8)] : []),
    normCodigo(tamanho).slice(0, 6),
  ].join('-')
}

/** Garante SKU único globalmente, sufixando -2, -3… apenas em colisão. */
async function skuLivre(base: string): Promise<string> {
  let sku = base
  let n = 1
  while (await prisma.variacaoProduto.findUnique({ where: { sku }, select: { id: true } })) {
    n += 1
    sku = `${base}-${n}`
  }
  return sku
}

/** Garante referência única na loja. */
async function referenciaLivre(lojaId: string, base: string): Promise<string> {
  let ref = base || 'REF'
  let n = 1
  while (await prisma.produto.findFirst({ where: { lojaId, referencia: ref }, select: { id: true } })) {
    n += 1
    ref = `${base}-${n}`
  }
  return ref
}

/**
 * Referência efetiva do modelo:
 * - se a estoquista informou, respeita o que veio da confecção;
 * - se veio vazia, sugere a partir de coleção + tipo + nome do modelo.
 */
async function resolverReferencia(
  lojaId: string,
  body: { referencia?: string; colecao?: string; categoria?: string },
  nome: string,
): Promise<string> {
  if (body.referencia && body.referencia.trim()) return body.referencia.trim()
  const base = normCodigo([body.colecao, body.categoria, nome].filter(Boolean).join('-')).slice(0, 24) || normCodigo(nome)
  return referenciaLivre(lojaId, base)
}

async function resolverTaxonomia(lojaId: string, body: { categoria?: string; marca?: string; colecao?: string }) {
  const [categoria, marca, colecao] = await Promise.all([
    body.categoria
      ? prisma.categoria.upsert({ where: { lojaId_nome: { lojaId, nome: body.categoria } }, create: { lojaId, nome: body.categoria }, update: {} })
      : null,
    body.marca
      ? prisma.marca.upsert({ where: { lojaId_nome: { lojaId, nome: body.marca } }, create: { lojaId, nome: body.marca }, update: {} })
      : null,
    body.colecao
      ? prisma.colecao.upsert({ where: { lojaId_nome: { lojaId, nome: body.colecao } }, create: { lojaId, nome: body.colecao }, update: {} })
      : null,
  ])
  return { categoriaId: categoria?.id, marcaId: marca?.id, colecaoId: colecao?.id }
}

const includeProduto = {
  categoria: true,
  marca: true,
  colecao: true,
  variacoes: { orderBy: [{ cor: 'asc' as const }, { tamanho: 'asc' as const }] },
}

// Campos escalares (sem taxonomia/variações) aplicáveis direto no update.
function escalaresProduto(body: z.infer<typeof atualizarProdutoSchema>) {
  const { variacoes, categoria, marca, colecao, ...dados } = body
  void variacoes; void categoria; void marca; void colecao
  // Mantém fotosCores alinhado por índice com fotos quando ambos vierem no update.
  if (dados.fotos) dados.fotosCores = dados.fotos.map((_, i) => dados.fotosCores?.[i] ?? '')
  return dados
}

export async function produtosRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { busca, ativo, colecaoId } = request.query as { busca?: string; ativo?: string; colecaoId?: string }
    const and: import('@prisma/client').Prisma.ProdutoWhereInput[] = []
    if (ativo !== undefined) and.push({ ativo: ativo === 'true' })
    if (colecaoId) and.push({ colecaoId })
    if (busca) and.push({ OR: [{ nome: { contains: busca, mode: 'insensitive' } }, { referencia: { contains: busca, mode: 'insensitive' } }] })
    // Vendedora só enxerga peças avulsas ou de coleção LIBERADA (coleção em preparação fica oculta).
    if (request.user.role === 'VENDEDORA') and.push({ OR: [{ colecaoId: null }, { colecao: { status: 'LIBERADA' } }] })
    return prisma.produto.findMany({
      where: { lojaId, ...(and.length ? { AND: and } : {}) },
      orderBy: { nome: 'asc' },
      include: includeProduto,
    })
  })

  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const produto = await prisma.produto.findFirst({ where: { id, lojaId }, include: includeProduto })
    if (!produto) return reply.code(404).send({ erro: 'Produto não encontrado' })
    return produto
  })

  app.post('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarProdutoSchema.parse(request.body)
    const taxonomia = await resolverTaxonomia(lojaId, body)
    const referencia = await resolverReferencia(lojaId, body, body.nome)

    // SKU por variação derivado da referência (cor × tamanho), com unicidade garantida
    const variacoesData = []
    for (const v of body.variacoes) {
      const sku = await skuLivre(skuBase(referencia, v.cor, v.estampa, v.tamanho))
      variacoesData.push({
        cor: v.cor,
        estampa: v.estampa,
        tamanho: v.tamanho,
        estoque: v.estoque,
        estoqueMinimo: v.estoqueMinimo,
        sku,
        codigoBarras: v.codigoBarras?.trim() || null,
        movimentos: v.estoque > 0 ? { create: { tipo: 'ENTRADA' as const, quantidade: v.estoque, motivo: 'Estoque inicial' } } : undefined,
      })
    }

    try {
      const produto = await prisma.produto.create({
        data: {
          lojaId,
          referencia,
          nome: body.nome,
          genero: body.genero,
          descricao: body.descricao,
          composicao: body.composicao,
          modelagem: body.modelagem,
          ncm: body.ncm,
          fornecedor: body.fornecedor,
          pesoGramas: body.pesoGramas,
          faixaEtaria: body.faixaEtaria,
          ...taxonomia,
          precoVarejo: body.precoVarejo,
          precoAtacado: body.precoAtacado,
          custo: body.custo,
          fotos: body.fotos,
          fotosCores: body.fotos.map((_, i) => body.fotosCores[i] ?? ''), // alinha por índice
          videos: body.videos,
          variacoes: { create: variacoesData },
        },
        include: includeProduto,
      })
      return reply.code(201).send(produto)
    } catch (e: unknown) {
      const err = e as { code?: string; meta?: { target?: string[] } }
      if (err.code === 'P2002') {
        const alvo = err.meta?.target?.join(', ') ?? ''
        if (alvo.includes('referencia')) return reply.code(409).send({ erro: `Referência "${referencia}" já existe nesta loja` })
        if (alvo.includes('codigoBarras')) return reply.code(409).send({ erro: 'Código de barras já cadastrado em outra peça' })
        return reply.code(409).send({ erro: 'Registro duplicado' })
      }
      throw e
    }
  })

  app.patch('/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = atualizarProdutoSchema.parse(request.body)

    const existente = await prisma.produto.findFirst({ where: { id, lojaId } })
    if (!existente) return reply.code(404).send({ erro: 'Produto não encontrado' })

    const taxonomia = await resolverTaxonomia(lojaId, body)
    const dados = escalaresProduto(body)
    const referencia = body.referencia?.trim() || existente.referencia || existente.nome

    try {
      const produto = await prisma.$transaction(async (tx) => {
        await tx.produto.update({ where: { id }, data: { ...dados, ...taxonomia } })

        // Variações: upsert por (cor, tamanho); não remove SKUs com histórico
        if (body.variacoes) {
          for (const v of body.variacoes) {
            const atual = await tx.variacaoProduto.findUnique({
              where: { produtoId_cor_estampa_tamanho: { produtoId: id, cor: v.cor, estampa: v.estampa, tamanho: v.tamanho } },
            })
            if (atual) {
              const delta = v.estoque - atual.estoque
              await tx.variacaoProduto.update({
                where: { id: atual.id },
                data: {
                  estoque: v.estoque,
                  estoqueMinimo: v.estoqueMinimo,
                  codigoBarras: v.codigoBarras?.trim() || atual.codigoBarras,
                  movimentos: delta !== 0 ? { create: { tipo: 'AJUSTE', quantidade: delta, motivo: 'Ajuste manual de grade' } } : undefined,
                },
              })
            } else {
              const sku = await skuLivre(skuBase(referencia, v.cor, v.estampa, v.tamanho))
              await tx.variacaoProduto.create({
                data: {
                  produtoId: id,
                  cor: v.cor,
                  estampa: v.estampa,
                  tamanho: v.tamanho,
                  estoque: v.estoque,
                  estoqueMinimo: v.estoqueMinimo,
                  sku,
                  codigoBarras: v.codigoBarras?.trim() || null,
                  movimentos: v.estoque > 0 ? { create: { tipo: 'ENTRADA', quantidade: v.estoque, motivo: 'Nova variação' } } : undefined,
                },
              })
            }
          }
        }
        return tx.produto.findUniqueOrThrow({ where: { id }, include: includeProduto })
      })
      return produto
    } catch (e: unknown) {
      const err = e as { code?: string; meta?: { target?: string[] } }
      if (err.code === 'P2002') {
        const alvo = err.meta?.target?.join(', ') ?? ''
        if (alvo.includes('referencia')) return reply.code(409).send({ erro: 'Referência já usada em outro modelo desta loja' })
        if (alvo.includes('codigoBarras')) return reply.code(409).send({ erro: 'Código de barras já cadastrado em outra peça' })
      }
      throw e
    }
  })

  // Exclui o produto. Apaga a mídia do R2 (fotos+vídeos) sempre. Se NÃO houver vendas,
  // exclui de verdade (cascata em variações/movimentos); se houver vendas (FK), desativa
  // (preserva o histórico) já com a mídia removida.
  app.delete('/:id', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const produto = await prisma.produto.findFirst({ where: { id, lojaId }, select: { id: true, fotos: true, videos: true } })
    if (!produto) return reply.code(404).send({ erro: 'Produto não encontrado' })

    const urls = [...produto.fotos, ...produto.videos]
    if (urls.length) { try { await excluirDoR2(urls) } catch { /* segue mesmo se o R2 falhar */ } }

    try {
      await prisma.produto.delete({ where: { id } }) // cascata: variações + movimentos
      return { removido: true }
    } catch {
      // tem venda/transferência vinculada → não dá pra apagar; desativa e limpa a mídia
      await prisma.produto.update({ where: { id }, data: { ativo: false, fotos: [], videos: [] } })
      return { removido: false, desativado: true }
    }
  })

  // Taxonomias para selects do frontend
  app.get('/taxonomias/listar', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const [categorias, marcas, colecoes] = await Promise.all([
      prisma.categoria.findMany({ where: { lojaId }, orderBy: { nome: 'asc' } }),
      prisma.marca.findMany({ where: { lojaId }, orderBy: { nome: 'asc' } }),
      prisma.colecao.findMany({ where: { lojaId }, orderBy: { nome: 'asc' } }),
    ])
    return { categorias, marcas, colecoes }
  })
}

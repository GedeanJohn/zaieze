import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDeQualquer } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'

const PARADO_DIAS = 60
const num = (v: unknown) => Number(v ?? 0)

/** Vendedora só enxerga a própria carteira como alvo; gerente/gestor a loja toda. */
function filtroCarteira(request: FastifyRequest, lojaId: string): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = { lojaId, ativo: true, consentimentoLgpd: true }
  if (request.user.role === 'VENDEDORA') where.vendedoraId = request.user.sub
  return where
}

/**
 * Radar de Oportunidades (★ diferencial): cruza estoque parado/encalhado com o
 * perfil dos clientes (quem já comprou aquela categoria) → campanha em 1 clique.
 */
export async function radarRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireFeature('radar'))

  app.get('/', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const redeId = await redeIdDeQualquer(request)
    const loja = await prisma.loja.findUniqueOrThrow({ where: { id: lojaId }, select: { nome: true } })
    const desde = new Date(Date.now() - PARADO_DIAS * 86_400_000)

    // Estoque central: encalhados da marca entre as coleções distribuídas a esta loja.
    const [produtos, vendidasRecentes] = await Promise.all([
      prisma.produto.findMany({
        where: { redeId, ativo: true, colecao: { lojas: { some: { lojaId } } } },
        select: {
          id: true, nome: true, referencia: true, categoriaId: true,
          categoria: { select: { nome: true } }, custo: true,
          variacoes: { select: { id: true, estoque: true } },
        },
      }),
      prisma.movimentoEstoque.findMany({
        where: { tipo: 'SAIDA_VENDA', createdAt: { gte: desde }, variacao: { produto: { redeId } } },
        select: { variacaoId: true }, distinct: ['variacaoId'],
      }),
    ])
    const vendidas = new Set(vendidasRecentes.map((m) => m.variacaoId))
    const carteira = filtroCarteira(request, lojaId)

    const oportunidades: {
      produtoId: string; produto: string; referencia: string | null; categoria: string | null
      estoqueParado: number; valorParado: number; clientesAlvo: number; clienteIds: string[]; mensagemSugerida: string
    }[] = []

    for (const p of produtos) {
      const estoqueParado = p.variacoes.reduce((s, v) => s + v.estoque, 0)
      const vendeu = p.variacoes.some((v) => vendidas.has(v.id))
      if (vendeu || estoqueParado <= 0) continue // só produtos encalhados com saldo

      // Clientes que combinam: já compraram a mesma categoria (ou VIP/Frequente se sem categoria)
      const where: Prisma.ClienteWhereInput = p.categoriaId
        ? { ...carteira, vendas: { some: { status: 'CONCLUIDA', itens: { some: { variacao: { produto: { categoriaId: p.categoriaId } } } } } } }
        : { ...carteira, segmento: { in: ['VIP', 'FREQUENTE'] } }

      const alvo = await prisma.cliente.findMany({ where, select: { id: true }, take: 200 })
      if (alvo.length === 0) continue

      oportunidades.push({
        produtoId: p.id,
        produto: p.nome,
        referencia: p.referencia,
        categoria: p.categoria?.nome ?? null,
        estoqueParado,
        valorParado: estoqueParado * num(p.custo),
        clientesAlvo: alvo.length,
        clienteIds: alvo.map((a) => a.id),
        mensagemSugerida: `Oi {primeiroNome}! 😍 Separei *${p.nome}* aqui na {loja}, achei com a sua cara. Quer dar uma olhada? — {vendedora}`,
      })
    }

    oportunidades.sort((a, b) => b.valorParado - a.valorParado || b.clientesAlvo - a.clientesAlvo)
    return { loja: loja.nome, oportunidades }
  })
}

import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { lojaIdDe, redeIdDeQualquer } from '../../plugins/auth'
import { requireAddon } from '../../plugins/planos'
import { explicarOportunidade } from '../whatsapp/ia.service'
import { statusCreditos } from '../prospeccao/radar-creditos.service'
import { googlePlacesConfigurado, geocodificar, buscarEmpresas, gerarResultadosSimulados } from '../prospeccao/places.service'

const PARADO_DIAS = 60
// Fixo no servidor (não ajustável pelo tenant) — mantém o custo por crédito previsível.
const QUANTIDADE_PROSPECCAO = 10
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
  app.addHook('onRequest', requireAddon('RADAR'))

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

    // Explicação por IA de cada match — incluída na mensalidade do add-on (não consome crédito).
    const comExplicacao = await Promise.all(oportunidades.map(async (o) => {
      const ia = await explicarOportunidade({
        produto: o.produto, categoria: o.categoria, diasParado: PARADO_DIAS,
        valorParado: o.valorParado, clientesAlvo: o.clientesAlvo,
      })
      return { ...o, explicacaoIa: ia.texto, viaIa: ia.viaIa }
    }))

    return { loja: loja.nome, oportunidades: comExplicacao }
  })

  // ─────────── Prospecção de empresas novas (créditos de IA Captador) ───────────

  app.get('/creditos', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    return statusCreditos(redeId)
  })

  const prospeccaoSchema = z.object({
    segmento: z.string().min(2),
    cidade: z.string().min(2),
    uf: z.string().length(2),
    tipoEmpresa: z.string().trim().optional(),
    perfilIdeal: z.string().trim().optional(),
  })
  app.post('/prospeccao', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const b = prospeccaoSchema.parse(request.body)
    const uf = b.uf.toUpperCase()

    const creditos = await statusCreditos(redeId)
    if (!creditos.ok) {
      return reply.code(422).send({ erro: `Créditos de IA Captador esgotados este mês (${creditos.usados}/${creditos.limite}). Renova no início do próximo ciclo.` })
    }

    const simulada = !googlePlacesConfigurado()
    const empresas = simulada
      ? gerarResultadosSimulados({ segmento: b.segmento, cidade: b.cidade, uf, quantidade: QUANTIDADE_PROSPECCAO })
      : await (async () => {
          const ponto = await geocodificar(b.cidade, uf)
          if (!ponto) return null
          return buscarEmpresas({ segmento: b.segmento, tipoEmpresa: b.tipoEmpresa, ponto, quantidade: QUANTIDADE_PROSPECCAO })
        })()
    if (empresas === null) return reply.code(422).send({ erro: 'Não foi possível localizar essa cidade/UF.' })

    const busca = await prisma.prospeccaoBusca.create({
      data: {
        criadoPorId: request.user.sub, redeId, segmento: b.segmento, cidade: b.cidade, uf,
        tipoEmpresa: b.tipoEmpresa ?? null, perfilIdeal: b.perfilIdeal ?? null,
        quantidade: QUANTIDADE_PROSPECCAO, simulada,
        empresas: { create: empresas.map((e) => ({ ...e, horarioFuncionamento: e.horarioFuncionamento ?? undefined })) },
      },
      include: { empresas: true },
    })
    return reply.code(201).send(busca)
  })
}

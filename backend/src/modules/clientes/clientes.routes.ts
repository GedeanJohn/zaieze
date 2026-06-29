import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature } from '../../plugins/planos'
import { SEGMENTOS, segmentarLoja, type Distribuicao } from './segmentacao'
import { garantirSlugCatalogo, urlCatalogoPublica } from '../catalogo/catalogo.routes'
import { enviarWhatsapp } from '../whatsapp/whatsapp.service'

const criarClienteSchema = z.object({
  nome: z.string().min(2),
  telefone: z.string().min(8),
  email: z.string().email().optional(),
  cpf: z.string().optional(),
  instagram: z.string().optional(),
  cep: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().length(2).optional(),
  vendedoraId: z.string().optional(),
  consentimentoLgpd: z.boolean().default(false),
  observacoes: z.string().optional(),
})

// Regiões do Brasil por UF (para o filtro "região" derivado da UF do cliente).
const UF_POR_REGIAO: Record<string, string[]> = {
  Norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
}

/** Extrai o DDD (2 dígitos) de um telefone brasileiro, ignorando o 55 do país. */
function dddDoTelefone(telefone: string): string | null {
  let d = telefone.replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  return d.length >= 10 ? d.slice(0, 2) : null
}

const atualizarClienteSchema = criarClienteSchema.partial().extend({
  ativo: z.boolean().optional(),
})

/**
 * Filtro de carteira (regra crítica da spec):
 * - VENDEDORA enxerga apenas clientes da própria carteira — aplicado no backend.
 * - DONO_LOJA / SUPER_ADMIN enxergam todos os clientes da loja.
 */
function filtroCarteira(request: FastifyRequest, lojaId: string): Prisma.ClienteWhereInput {
  const where: Prisma.ClienteWhereInput = { lojaId }
  if (request.user.role === 'VENDEDORA') {
    where.vendedoraId = request.user.sub
  }
  return where
}

export async function clientesRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const { busca, segmento, cidade, uf, regiao, ddd } = request.query as
      { busca?: string; segmento?: string; cidade?: string; uf?: string; regiao?: string; ddd?: string }

    const where = filtroCarteira(request, lojaId)
    if (segmento) where.segmento = segmento as never
    if (cidade) where.cidade = { equals: cidade, mode: 'insensitive' }
    if (uf) where.uf = uf.toUpperCase()
    else if (regiao && UF_POR_REGIAO[regiao]) where.uf = { in: UF_POR_REGIAO[regiao] }
    if (busca) {
      where.OR = [
        { nome: { contains: busca, mode: 'insensitive' } },
        { telefone: { contains: busca } },
      ]
    }

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: { vendedora: { select: { id: true, nome: true } } },
    })
    // DDD é derivado do telefone (não há coluna) → filtra em memória quando pedido.
    return ddd ? clientes.filter((c) => dddDoTelefone(c.telefone) === ddd.replace(/\D/g, '')) : clientes
  })

  // Cidades/UFs presentes na carteira — alimenta os selects de filtro no frontend.
  app.get('/resumo/locais', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const clientes = await prisma.cliente.findMany({
      where: { ...filtroCarteira(request, lojaId), ativo: true },
      select: { cidade: true, uf: true, telefone: true },
    })
    const cidades = [...new Set(clientes.map((c) => c.cidade).filter((v): v is string => !!v))].sort()
    const ufs = [...new Set(clientes.map((c) => c.uf).filter((v): v is string => !!v))].sort()
    const ddds = [...new Set(clientes.map((c) => dddDoTelefone(c.telefone)).filter((v): v is string => !!v))].sort()
    return { cidades, ufs, ddds, regioes: Object.keys(UF_POR_REGIAO) }
  })

  // R1 — envia o LINK DO CATÁLOGO para os clientes selecionados (roteado pela vendedora dona).
  // Respeita LGPD; envia pelo número OFICIAL da marca (Cloud API; SIMULADA sem config).
  app.post('/enviar-catalogo', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = z.object({
      clienteIds: z.array(z.string()).min(1).max(500),
      mensagem: z.string().max(800).optional(),
    }).parse(request.body)

    const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { nome: true, redeId: true, rede: { select: { slug: true, textoDisparoPadrao: true, disparoVendedoraEditavel: true, waPhoneNumberId: true, waTokenCifrado: true } } } })
    if (!loja?.rede) return reply.code(422).send({ erro: 'Loja sem marca vinculada' })
    const redeWA = { waPhoneNumberId: loja.rede.waPhoneNumberId, waTokenCifrado: loja.rede.waTokenCifrado }

    // Texto: gestor define um padrão; se a vendedora não pode editar, força o padrão.
    const travada = request.user.role === 'VENDEDORA' && !loja.rede.disparoVendedoraEditavel
    const textoBase = (travada ? loja.rede.textoDisparoPadrao : (body.mensagem?.trim() || loja.rede.textoDisparoPadrao))?.trim() || null

    // Só envia para clientes da carteira visível ao usuário (vendedora = própria carteira).
    const clientes = await prisma.cliente.findMany({
      where: { ...filtroCarteira(request, lojaId), id: { in: body.clienteIds } },
      select: { id: true, nome: true, telefone: true, consentimentoLgpd: true, vendedoraId: true },
    })

    const res = { alcance: clientes.length, enviados: 0, simulados: 0, falhas: 0, semConsentimento: 0, semVendedora: 0 }
    const cache = new Map<string, { link: string } | null>() // link do catálogo por vendedoraId

    for (const c of clientes) {
      if (!c.consentimentoLgpd) { res.semConsentimento += 1; continue }
      if (!c.vendedoraId) { res.semVendedora += 1; continue }

      if (!cache.has(c.vendedoraId)) {
        const v = await prisma.usuario.findUnique({
          where: { id: c.vendedoraId },
          select: { id: true, nome: true, slugCatalogo: true },
        })
        if (!v) cache.set(c.vendedoraId, null)
        else {
          const slug = await garantirSlugCatalogo(v, loja.redeId)
          cache.set(c.vendedoraId, { link: urlCatalogoPublica(loja.rede.slug, slug) })
        }
      }
      const dados = cache.get(c.vendedoraId)
      if (!dados) { res.semVendedora += 1; continue }

      const saud = textoBase
        ? textoBase.replaceAll('{primeiroNome}', c.nome.split(/\s+/)[0]).replaceAll('{nome}', c.nome)
        : `Oi ${c.nome.split(/\s+/)[0]}! Dá uma olhada no nosso catálogo 💛`
      const r = await enviarWhatsapp({ rede: redeWA, telefone: c.telefone, texto: `${saud}\n\n${dados.link}` })
      if (r.status === 'ENVIADA') res.enviados += 1
      else if (r.status === 'SIMULADA') res.simulados += 1
      else res.falhas += 1
    }
    return res
  })

  // Distribuição da carteira por segmento (respeita o isolamento da vendedora)
  app.get('/resumo/segmentos', { preHandler: [app.authenticate] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const grupos = await prisma.cliente.groupBy({
      by: ['segmento'],
      where: { ...filtroCarteira(request, lojaId), ativo: true },
      _count: { _all: true },
    })
    const distribuicao = Object.fromEntries(SEGMENTOS.map((s) => [s, 0])) as Distribuicao
    for (const g of grupos) distribuicao[g.segmento] += g._count._all
    const total = Object.values(distribuicao).reduce((s, n) => s + n, 0)
    return { total, distribuicao }
  })

  // Recalcula a segmentação automática da loja (módulo 3) — gerente/gestor
  app.post('/segmentar', { preHandler: [requireFeature('crm_segmentacao'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    return segmentarLoja(lojaId)
  })

  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }

    const cliente = await prisma.cliente.findFirst({
      where: { ...filtroCarteira(request, lojaId), id },
      include: {
        vendedora: { select: { id: true, nome: true } },
        vendas: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { itens: { include: { variacao: { include: { produto: { select: { nome: true } } } } } } },
        },
      },
    })
    if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado ou fora da sua carteira' })
    return cliente
  })

  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const body = criarClienteSchema.parse(request.body)

    // Vendedora cadastrando cliente assume o cliente na própria carteira
    const vendedoraId = request.user.role === 'VENDEDORA' ? request.user.sub : body.vendedoraId

    if (vendedoraId) {
      const vendedora = await prisma.usuario.findFirst({ where: { id: vendedoraId, lojaId, role: 'VENDEDORA' } })
      if (!vendedora) return reply.code(422).send({ erro: 'Vendedora inválida para esta loja' })
    }

    try {
      const cliente = await prisma.cliente.create({
        data: { ...body, lojaId, vendedoraId },
        include: { vendedora: { select: { id: true, nome: true } } },
      })
      return reply.code(201).send(cliente)
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        return reply.code(409).send({ erro: 'Já existe um cliente com este telefone nesta loja' })
      }
      throw e
    }
  })

  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { id } = request.params as { id: string }
    const body = atualizarClienteSchema.parse(request.body)

    const existente = await prisma.cliente.findFirst({ where: { ...filtroCarteira(request, lojaId), id } })
    if (!existente) return reply.code(404).send({ erro: 'Cliente não encontrado ou fora da sua carteira' })

    // Somente dono/admin transfere carteira
    if (body.vendedoraId !== undefined && request.user.role === 'VENDEDORA') {
      return reply.code(403).send({ erro: 'Apenas o gerente pode transferir clientes de carteira' })
    }

    return prisma.cliente.update({
      where: { id },
      data: body,
      include: { vendedora: { select: { id: true, nome: true } } },
    })
  })
}

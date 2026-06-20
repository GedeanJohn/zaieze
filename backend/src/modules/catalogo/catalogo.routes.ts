import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature, planoInclui } from '../../plugins/planos'
import { garantirCicloAberto } from '../leads/leads.service'

/** URL pública do catálogo da vendedora: <scheme>://<rede>.<dominio>/<slug>. */
export function urlCatalogoPublica(redeSlug: string, vendSlug: string): string {
  return `${env.TENANT_SCHEME}://${redeSlug}.${env.DOMINIO_BASE}/${vendSlug}`
}

/**
 * Catálogo público (Portal do Cliente) + link por vendedora.
 * URL pública: <marca>.zaieze.com/<vendedora>  (marca = rede; engloba todas as lojas).
 * Fluxo: cliente abre o link da vendedora → vê o catálogo (coleções liberadas) →
 * "Falar com a vendedora" cria o lead (ponto de entrada no CRM) e abre o WhatsApp dela.
 */

// Palavras reservadas pelas rotas do CRM/SPA — um slug de vendedora nunca pode colidir.
const RESERVADOS = new Set([
  'login', 'vendas', 'estoque', 'transferencias', 'clientes', 'campanhas', 'caixa', 'radar',
  'ranking', 'mural', 'provador', 'atacado', 'produtos', 'equipe', 'estoquistas', 'planos',
  'colecoes', 'marca', 'leads', 'catalogo', 'cat', 'api', 'assets', 'uploads', 'checkout', 'sucesso', 'entrar', 'convite',
])

/** Gera um slug a partir do nome (sem acento, kebab-case). */
function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'vendedora'
}

/** Garante slug de catálogo único na MARCA (rede) para a vendedora; gera na primeira vez. */
export async function garantirSlugCatalogo(
  vend: { id: string; nome: string; slugCatalogo: string | null },
  redeId: string,
): Promise<string> {
  if (vend.slugCatalogo) return vend.slugCatalogo
  const base = slugify(vend.nome)
  let slug = RESERVADOS.has(base) ? `${base}-loja` : base
  let n = 1
  while (await prisma.usuario.findFirst({ where: { slugCatalogo: slug, loja: { redeId }, id: { not: vend.id } }, select: { id: true } })) {
    n += 1
    slug = `${base}-${n}`
  }
  await prisma.usuario.update({ where: { id: vend.id }, data: { slugCatalogo: slug } })
  return slug
}

/** Monta a URL wa.me da vendedora com mensagem pré-preenchida (ou null se não tem número). */
function whatsappUrl(numero: string | null, texto: string): string | null {
  const digits = (numero ?? '').replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(texto)}`
}

/** Resolve a vendedora pública por (marca, slug) e devolve dados de loja/marca para o catálogo. */
async function resolverVendedoraPublica(redeSlug: string, vendSlug: string) {
  const rede = await prisma.rede.findUnique({
    where: { slug: redeSlug },
    select: { id: true, nome: true, plano: true, ativo: true, logoUrl: true, corPrimaria: true, corSecundaria: true, pedidoMinimoAtacado: true },
  })
  if (!rede || !rede.ativo || !planoInclui(rede.plano, 'portal_cliente')) return null
  const vend = await prisma.usuario.findFirst({
    where: { slugCatalogo: vendSlug, role: 'VENDEDORA', ativo: true, loja: { redeId: rede.id, ativo: true } },
    select: { id: true, nome: true, waNumero: true, lojaId: true, loja: { select: { id: true, nome: true } } },
  })
  if (!vend || !vend.loja) return null
  return { rede, vend }
}

const leadSchema = z.object({
  nome: z.string().min(1).optional(),
  telefone: z.string().min(8).optional(),
  produtoId: z.string().optional(),
  resumo: z.string().max(1000).optional(), // 1ª mensagem montada pelo agente (qualificação)
})

export async function catalogoRoutes(app: FastifyInstance) {
  // Link da própria vendedora (gera o slug na primeira vez).
  app.get('/meu-link', { preHandler: [requireFeature('portal_cliente'), app.authorize('VENDEDORA')] }, async (request, reply) => {
    const vend = await prisma.usuario.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { id: true, nome: true, slugCatalogo: true, waNumero: true, loja: { select: { nome: true, rede: { select: { id: true, slug: true } } } } },
    })
    if (!vend.loja?.rede) return reply.code(422).send({ erro: 'Vendedora sem marca vinculada' })
    const slug = await garantirSlugCatalogo(vend, vend.loja.rede.id)
    return { slug, redeSlug: vend.loja.rede.slug, lojaNome: vend.loja.nome, path: `/${slug}`, temWhatsapp: !!vend.waNumero }
  })

  // Links de todas as vendedoras da loja (gestor/gerente distribuem/auditam).
  app.get('/links', { preHandler: [requireFeature('portal_cliente'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const loja = await prisma.loja.findUniqueOrThrow({ where: { id: lojaId }, select: { redeId: true, rede: { select: { slug: true } } } })
    const vendedoras = await prisma.usuario.findMany({
      where: { lojaId, role: 'VENDEDORA', ativo: true },
      select: { id: true, nome: true, slugCatalogo: true, waNumero: true },
      orderBy: { nome: 'asc' },
    })
    const out = []
    for (const v of vendedoras) {
      const slug = await garantirSlugCatalogo(v, loja.redeId)
      out.push({ id: v.id, nome: v.nome, slug, redeSlug: loja.rede.slug, path: `/${slug}`, temWhatsapp: !!v.waNumero })
    }
    return out
  })

  // ─────────── Endpoints PÚBLICOS (sem auth) ───────────

  // Verifica se a loja/marca (slug) existe e está ativa — usado na tela "Acessar meu painel"
  // para avisar antes de redirecionar a um endereço inexistente.
  app.get('/rede-existe/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const rede = await prisma.rede.findUnique({ where: { slug: slug.toLowerCase() }, select: { nome: true, ativo: true } })
    if (!rede || !rede.ativo) return reply.code(404).send({ existe: false })
    return { existe: true, nome: rede.nome }
  })

  // Dados do catálogo da vendedora (coleções liberadas + branding da marca).
  app.get('/publico/:redeSlug/:vendSlug', async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Catálogo indisponível' })
    const { rede, vend } = ctx

    const colecoes = await prisma.colecao.findMany({
      where: { lojaId: vend.lojaId!, status: 'LIBERADA' },
      orderBy: { liberadaEm: 'desc' },
      include: {
        produtos: {
          where: { ativo: true },
          orderBy: { nome: 'asc' },
          select: {
            id: true, nome: true, descricao: true, precoVarejo: true, descontoOutletPct: true, fotos: true, videos: true,
            categoria: { select: { nome: true } },
            variacoes: { select: { cor: true, tamanho: true, estoque: true } },
          },
        },
      },
    })

    const colecoesOut = colecoes
      .map((c) => ({
        id: c.id, nome: c.nome, descricao: c.descricao,
        outlet: c.outlet,
        produtos: c.produtos.map((p) => {
          const base = Number(p.precoVarejo)
          // Desconto de outlet: peça tem prioridade sobre o da coleção; só vale se a coleção é Outlet.
          const pct = c.outlet ? (p.descontoOutletPct ?? c.descontoOutletPct ?? 0) : 0
          const preco = pct > 0 ? Math.round(base * (1 - pct / 100) * 100) / 100 : base
          return {
            id: p.id, nome: p.nome, descricao: p.descricao, preco, fotos: p.fotos,
            outlet: c.outlet,
            descontoPct: pct > 0 ? pct : null,
            precoOriginal: pct > 0 ? base : null,
            categoria: p.categoria?.nome ?? null,
            cores: [...new Set(p.variacoes.map((v) => v.cor))],
            tamanhos: [...new Set(p.variacoes.map((v) => v.tamanho))],
            disponivel: p.variacoes.some((v) => v.estoque > 0),
          }
        }),
      }))
      .filter((c) => c.produtos.length > 0)

    return {
      marca: { nome: rede.nome, logoUrl: rede.logoUrl, corPrimaria: rede.corPrimaria, corSecundaria: rede.corSecundaria },
      loja: { nome: vend.loja!.nome },
      vendedora: { nome: vend.nome, primeiroNome: vend.nome.trim().split(/\s+/)[0], temWhatsapp: !!vend.waNumero },
      pedidoMinimoAtacado: rede.pedidoMinimoAtacado,
      colecoes: colecoesOut,
    }
  })

  // Cliente clica em "Falar com a vendedora": registra o lead e devolve a URL do WhatsApp.
  app.post('/publico/:redeSlug/:vendSlug/lead', async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const body = leadSchema.parse(request.body ?? {})
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Catálogo indisponível' })
    const { rede, vend } = ctx

    const texto = body.resumo?.trim() || `Olá ${vend.nome.split(/\s+/)[0]}! Vim pelo catálogo e quero saber mais. 😊`
    const url = whatsappUrl(vend.waNumero, texto)

    // Sem telefone não dá para materializar o cliente; ainda assim devolve o WhatsApp
    // (em produção, o webhook da Evolution cria o lead quando a mensagem chegar).
    const telefone = body.telefone?.replace(/\D/g, '')
    if (!telefone) return { whatsappUrl: url }

    // Cliente entra na carteira da vendedora dona do link (não rouba carteira existente).
    const cliente = await prisma.cliente.upsert({
      where: { lojaId_telefone: { lojaId: vend.lojaId!, telefone } },
      create: {
        lojaId: vend.lojaId!, telefone, nome: body.nome?.trim() || 'Cliente do catálogo',
        vendedoraId: vend.id, consentimentoLgpd: true, observacoes: 'Entrou pelo catálogo (Portal do Cliente)',
      },
      update: {}, // mantém dados e carteira atuais
      select: { id: true },
    })

    // Reaproveita o ciclo aberto do cliente ou abre um novo (reentrada após fechado = novo ciclo).
    const { leadId } = await garantirCicloAberto({
      lojaId: vend.lojaId!, vendedoraId: vend.id, redeId: rede.id, clienteId: cliente.id,
      telefone, nome: body.nome?.trim(), slugCatalogo: vendSlug, produtoId: body.produtoId,
    })

    return { whatsappUrl: url, leadId }
  })
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { lojaIdDe } from '../../plugins/auth'
import { requireFeature, planoInclui } from '../../plugins/planos'
import { garantirCicloAberto } from '../leads/leads.service'
import { enviarTemplatePlataforma } from '../whatsapp/meta.service'
import { TERMO_CLIENTE_VERSAO, TERMO_CLIENTE_TEXTO } from './termo-cliente.template'
import type { JwtUser } from '../../types/fastify'

/** Token do cliente público verificado (perfil da vendedora) — formato bem diferente do JwtUser
 *  de funcionário (sem role/redeId), reaproveitando só o mecanismo de assinatura do @fastify/jwt.
 *  O cast via JwtUser é só pra satisfazer o tipo fixo de app.jwt.sign/verify — nunca passa por
 *  requireFeature/authorize (que exigem role), então não há confusão com o JWT de equipe. */
interface ClientePedidosPayload { tipo: 'cliente_pedidos'; lojaId: string; telefone: string }

/** URL pública do catálogo da vendedora: <scheme>://<rede>.<dominio>/<slug>. */
export function urlCatalogoPublica(redeSlug: string, vendSlug: string): string {
  return `${env.TENANT_SCHEME}://${redeSlug}.${env.DOMINIO_BASE}/${vendSlug}`
}

/** URL pública do pré-pedido (carrinho montado na vitrine, ainda não virou Orçamento/Venda). */
function urlPrePedidoPublica(redeSlug: string, token: string): string {
  return `${env.TENANT_SCHEME}://${redeSlug}.${env.DOMINIO_BASE}/pre-pedido/publico/${token}`
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
  'look', // página pública do provador (link da selfie por token)
  'pre-pedido', // página pública do pré-pedido (link por token)
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
    select: {
      id: true, nome: true, plano: true, ativo: true, logoUrl: true, bannerUrl: true, descricaoPublica: true, corPrimaria: true, corSecundaria: true,
      pedidoMinimoAtacado: true, pedidoMinimoInfantil: true, waPhoneNumberId: true, waNumeroExibicao: true,
      parcelasMax: true, parcelasFormaPagamento: true, parcelasMinPecas: true, parcelasMinValor: true,
      entregaPrazoTexto: true, entregaFreteGratisValor: true, entregaTexto: true,
      devolucaoPrazoDias: true, devolucaoTexto: true,
    },
  })
  if (!rede || !rede.ativo || !planoInclui(rede.plano, 'portal_cliente')) return null
  const vend = await prisma.usuario.findFirst({
    where: { slugCatalogo: vendSlug, role: 'VENDEDORA', ativo: true, loja: { redeId: rede.id, ativo: true } },
    select: { id: true, nome: true, fotoUrl: true, bioCatalogo: true, telefone: true, lojaId: true, loja: { select: { id: true, nome: true } } },
  })
  if (!vend || !vend.loja) return null
  return { rede, vend }
}

/** Média (1 casa decimal), total de avaliações APROVADAS e até 3 depoimentos mais recentes da
 *  vendedora — mesmo padrão de resumoAvaliacoes (assessores.routes.ts). Sem nenhuma aprovada
 *  ainda, statAvaliacao vem null (esconde o selo em vez de mostrar nota zerada). */
async function resumoAvaliacoesVendedora(vendedoraId: string) {
  const [agregado, amostras] = await Promise.all([
    prisma.vendedoraAvaliacao.aggregate({ where: { vendedoraId, status: 'APROVADA' }, _avg: { nota: true }, _count: true }),
    prisma.vendedoraAvaliacao.findMany({
      where: { vendedoraId, status: 'APROVADA' }, orderBy: { moderadoEm: 'desc' }, take: 3,
      select: { nota: true, comentario: true, nomeCliente: true, createdAt: true },
    }),
  ])
  return {
    statAvaliacao: agregado._avg.nota != null ? Math.round(agregado._avg.nota * 10) / 10 : null,
    totalAvaliacoes: agregado._count,
    depoimentos: amostras,
  }
}

const leadSchema = z.object({
  nome: z.string().min(1).optional(),
  telefone: z.string().min(8).optional(),
  produtoId: z.string().optional(),
  resumo: z.string().max(1000).optional(), // 1ª mensagem montada pelo agente (qualificação)
  // Carrinho montado no catálogo (Portal do Cliente) — snapshot denormalizado (preço/foto do
  // momento da compra) pra vendedora ver o pedido formatado no card do Funil.
  itens: z.array(z.object({
    produtoId: z.string(),
    nome: z.string(),
    fotoUrl: z.string().nullable().optional(),
    cor: z.string().optional(),
    estampa: z.string().optional(),
    tamanho: z.string().optional(),
    modo: z.enum(['ATACADO', 'VAREJO']),
    precoUnit: z.number().nonnegative(),
    qtd: z.number().int().positive(),
  })).max(50).optional(),
})

export async function catalogoRoutes(app: FastifyInstance) {
  // Link da própria vendedora (gera o slug na primeira vez).
  app.get('/meu-link', { preHandler: [requireFeature('portal_cliente'), app.authorize('VENDEDORA')] }, async (request, reply) => {
    const vend = await prisma.usuario.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { id: true, nome: true, slugCatalogo: true, telefone: true, loja: { select: { nome: true, rede: { select: { id: true, slug: true } } } } },
    })
    if (!vend.loja?.rede) return reply.code(422).send({ erro: 'Vendedora sem marca vinculada' })
    const slug = await garantirSlugCatalogo(vend, vend.loja.rede.id)
    return { slug, redeSlug: vend.loja.rede.slug, lojaNome: vend.loja.nome, path: `/${slug}`, temWhatsapp: !!vend.telefone }
  })

  // Links de todas as vendedoras da loja (gestor/gerente distribuem/auditam).
  app.get('/links', { preHandler: [requireFeature('portal_cliente'), app.authorize('SUPER_ADMIN', 'GESTOR', 'GERENTE')] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const loja = await prisma.loja.findUniqueOrThrow({ where: { id: lojaId }, select: { redeId: true, rede: { select: { slug: true } } } })
    const vendedoras = await prisma.usuario.findMany({
      where: { lojaId, role: 'VENDEDORA', ativo: true },
      select: { id: true, nome: true, slugCatalogo: true, telefone: true },
      orderBy: { nome: 'asc' },
    })
    const out = []
    for (const v of vendedoras) {
      const slug = await garantirSlugCatalogo(v, loja.redeId)
      out.push({ id: v.id, nome: v.nome, slug, redeSlug: loja.rede.slug, path: `/${slug}`, temWhatsapp: !!v.telefone })
    }
    return out
  })

  // ─────────── Endpoints PÚBLICOS (sem auth) ───────────

  // Verifica se o slug existe e está ativo — usado na tela "Acessar meu painel" para avisar antes
  // de redirecionar a um endereço inexistente. Slug pode ser de uma Rede (loja) OU de um Assessor
  // (Brand Partner tem subdomínio próprio, fora da tabela Rede — ver auth.routes.ts).
  app.get('/rede-existe/:slug', async (request, reply) => {
    const s = (request.params as { slug: string }).slug.toLowerCase()
    const rede = await prisma.rede.findUnique({ where: { slug: s }, select: { nome: true, ativo: true } })
    if (rede) {
      if (!rede.ativo) return reply.code(404).send({ existe: false })
      return { existe: true, nome: rede.nome }
    }
    const assessor = await prisma.assessor.findUnique({
      where: { slug: s },
      select: { usuario: { select: { nome: true, ativo: true } } },
    })
    if (!assessor || !assessor.usuario.ativo) return reply.code(404).send({ existe: false })
    return { existe: true, nome: assessor.usuario.nome }
  })

  // Dados do catálogo da vendedora (coleções liberadas + branding da marca).
  app.get('/publico/:redeSlug/:vendSlug', async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Catálogo indisponível' })
    const { rede, vend } = ctx

    // Estoque central: a vendedora vende as coleções LIBERADAS distribuídas à sua loja.
    const colecoes = await prisma.colecao.findMany({
      where: {
        lojas: { some: { lojaId: vend.lojaId! } },
        status: 'LIBERADA',
        OR: [{ validadeAte: null }, { validadeAte: { gte: new Date() } }],
      },
      orderBy: { liberadaEm: 'desc' },
      include: {
        produtos: {
          where: { ativo: true },
          orderBy: { nome: 'asc' },
          select: {
            id: true, nome: true, descricao: true, referencia: true, genero: true, pesoGramas: true,
            precoVarejo: true, precoAtacado: true, descontoOutletPct: true, fotos: true, fotosCores: true, videos: true,
            destaque: true, destaqueEspecial: true, createdAt: true,
            categoria: { select: { nome: true } },
            variacoes: { select: { cor: true, estampa: true, tamanho: true, estoque: true } },
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
          const loteMinimo = p.genero === 'INFANTIL' ? rede.pedidoMinimoInfantil : rede.pedidoMinimoAtacado
          // Galeria por cor: foto entra na cor marcada ('' = serve para todas, fica só na geral).
          const fotosPorCor: Record<string, string[]> = {}
          p.fotos.forEach((url, i) => {
            const corFoto = p.fotosCores?.[i] ?? ''
            if (corFoto) (fotosPorCor[corFoto] ??= []).push(url)
          })
          return {
            id: p.id, nome: p.nome, descricao: p.descricao, referencia: p.referencia,
            genero: p.genero, pesoGramas: p.pesoGramas ?? null, loteMinimo,
            // preço = varejo já com desconto de outlet aplicado; atacado é o preço cheio de atacado da peça
            preco, precoVarejo: preco,
            precoAtacado: p.precoAtacado != null ? Number(p.precoAtacado) : null,
            fotos: p.fotos, fotosPorCor, videos: p.videos,
            destaque: p.destaque, destaqueEspecial: p.destaqueEspecial, createdAt: p.createdAt,
            outlet: c.outlet,
            descontoPct: pct > 0 ? pct : null,
            precoOriginal: pct > 0 ? base : null,
            categoria: p.categoria?.nome ?? null,
            cores: [...new Set(p.variacoes.map((v) => v.cor))],
            // estampas só entram se houver (campo vazio não aparece pro cliente/vendedora)
            estampas: [...new Set(p.variacoes.map((v) => v.estampa).filter(Boolean))],
            tamanhos: [...new Set(p.variacoes.map((v) => v.tamanho))],
            // grade completa para estoque por (cor × tamanho) no carrinho
            variacoes: p.variacoes.map((v) => ({ cor: v.cor, estampa: v.estampa, tamanho: v.tamanho, estoque: v.estoque })),
            disponivel: p.variacoes.some((v) => v.estoque > 0),
          }
        }),
      }))
      .filter((c) => c.produtos.length > 0)

    // Estatísticas reais do perfil público (nada fabricado): clientes ativos na carteira dela,
    // vendas concluídas e coleções já liberadas pra sua loja (histórico, não só as vigentes).
    const [clientesAtivos, pedidosEntregues, colecoesLancadas, avaliacaoResumo] = await Promise.all([
      prisma.cliente.count({ where: { vendedoraId: vend.id, ativo: true, consumidorOutro: false } }),
      prisma.venda.count({ where: { vendedoraId: vend.id, status: 'CONCLUIDA' } }),
      prisma.colecao.count({ where: { lojas: { some: { lojaId: vend.lojaId! } }, status: 'LIBERADA' } }),
      resumoAvaliacoesVendedora(vend.id),
    ])

    return {
      marca: {
        nome: rede.nome, logoUrl: rede.logoUrl, bannerUrl: rede.bannerUrl, descricaoPublica: rede.descricaoPublica,
        corPrimaria: rede.corPrimaria, corSecundaria: rede.corSecundaria,
        parcelasMax: rede.parcelasMax, parcelasFormaPagamento: rede.parcelasFormaPagamento,
        parcelasMinPecas: rede.parcelasMinPecas, parcelasMinValor: Number(rede.parcelasMinValor),
        entregaPrazoTexto: rede.entregaPrazoTexto,
        entregaFreteGratisValor: rede.entregaFreteGratisValor != null ? Number(rede.entregaFreteGratisValor) : null,
        entregaTexto: rede.entregaTexto,
        devolucaoPrazoDias: rede.devolucaoPrazoDias, devolucaoTexto: rede.devolucaoTexto,
      },
      loja: { nome: vend.loja!.nome },
      vendedora: {
        nome: vend.nome, primeiroNome: vend.nome.trim().split(/\s+/)[0], fotoUrl: vend.fotoUrl, bio: vend.bioCatalogo, temWhatsapp: !!vend.telefone,
        stats: { clientesAtivos, pedidosEntregues, colecoesLancadas },
        ...avaliacaoResumo,
      },
      pedidoMinimoAtacado: rede.pedidoMinimoAtacado,
      pedidoMinimoInfantil: rede.pedidoMinimoInfantil,
      colecoes: colecoesOut,
    }
  })

  // Manifesto PWA por vendedora: "Adicionar à Tela de Início" (Android) precisa buscar o
  // manifest.webmanifest por uma URL de rede de verdade — um Blob URL gerado em JS (como era
  // antes) não é instalável como app (WebAPK): o Chrome resolve o ícone/nome do app a partir do
  // <link rel="manifest"> tal como estava no carregamento da página, ignorando a troca feita
  // depois via JS, então caía sempre no manifest.webmanifest estático (ícone genérico ZAIEZE)
  // mesmo com o <link> já reescrito para a logo da marca. Mesmo padrão de assessores.routes.ts.
  app.get('/publico/:redeSlug/:vendSlug/manifest.webmanifest', async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Catálogo indisponível' })
    const { rede, vend } = ctx
    const titulo = `${rede.nome}/${vend.nome.trim().split(/\s+/)[0]}`
    reply.type('application/manifest+json')
    return {
      name: titulo,
      short_name: titulo,
      description: `Catálogo de moda — ${titulo}`,
      start_url: `/${vendSlug}?pwa=1`,
      scope: `/${vendSlug}`,
      display: 'standalone',
      background_color: '#000000',
      theme_color: '#000000',
      icons: rede.logoUrl
        ? [
            { src: rede.logoUrl, sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: rede.logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' },
          ]
        : [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
    }
  })

  // Lista completa dos depoimentos aprovados da vendedora (pro "ver mais" no perfil público).
  app.get('/publico/:redeSlug/:vendSlug/avaliacoes', async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Página não encontrada' })
    return prisma.vendedoraAvaliacao.findMany({
      where: { vendedoraId: ctx.vend.id, status: 'APROVADA' },
      orderBy: { moderadoEm: 'desc' },
      take: 50,
      select: { nota: true, comentario: true, nomeCliente: true, createdAt: true },
    })
  })

  // Envio de avaliação pelo cliente — público, sem login. Nasce PENDENTE (só entra na média/
  // depoimentos depois que a vendedora aprova em "Minha conta"). Rate-limit contra spam/flood.
  const avaliacaoSchema = z.object({
    nota: z.number().int().min(1).max(5),
    comentario: z.string().trim().max(400).nullable().optional(),
    nomeCliente: z.string().trim().max(80).nullable().optional(),
    // Opcional: se bater com um Cliente já cadastrado NESTA vendedora, a avaliação aparece
    // também no card dele no Funil — nunca cria Cliente novo a partir disso.
    telefone: z.string().trim().max(20).nullable().optional(),
  })
  app.post('/publico/:redeSlug/:vendSlug/avaliacao', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Página não encontrada' })
    const { vend } = ctx
    const b = avaliacaoSchema.parse(request.body)

    let clienteId: string | null = null
    const telefoneLimpo = b.telefone?.replace(/\D/g, '')
    if (telefoneLimpo) {
      const cliente = await prisma.cliente.findUnique({
        where: { lojaId_telefone: { lojaId: vend.lojaId!, telefone: telefoneLimpo } },
        select: { id: true, vendedoraId: true },
      })
      if (cliente && cliente.vendedoraId === vend.id) clienteId = cliente.id
    }

    await prisma.vendedoraAvaliacao.create({
      data: { vendedoraId: vend.id, nota: b.nota, comentario: b.comentario || null, nomeCliente: b.nomeCliente || null, clienteId },
    })
    return reply.code(201).send({ ok: true })
  })

  // ─────────── Avaliações de atendimento (moderação da própria vendedora) ───────────
  app.get('/minhas-avaliacoes', { preHandler: [requireFeature('portal_cliente'), app.authorize('VENDEDORA')] }, async (request) => {
    const { status } = request.query as { status?: string }
    return prisma.vendedoraAvaliacao.findMany({
      where: { vendedoraId: request.user.sub, ...(status ? { status: status as 'PENDENTE' | 'APROVADA' | 'RECUSADA' } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, nota: true, comentario: true, nomeCliente: true, status: true, createdAt: true },
    })
  })

  app.post('/minhas-avaliacoes/:id/aprovar', { preHandler: [requireFeature('portal_cliente'), app.authorize('VENDEDORA')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const av = await prisma.vendedoraAvaliacao.findFirst({ where: { id, vendedoraId: request.user.sub } })
    if (!av) return reply.code(404).send({ erro: 'Avaliação não encontrada' })
    return prisma.vendedoraAvaliacao.update({ where: { id }, data: { status: 'APROVADA', moderadoEm: new Date() } })
  })

  app.post('/minhas-avaliacoes/:id/recusar', { preHandler: [requireFeature('portal_cliente'), app.authorize('VENDEDORA')] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const av = await prisma.vendedoraAvaliacao.findFirst({ where: { id, vendedoraId: request.user.sub } })
    if (!av) return reply.code(404).send({ erro: 'Avaliação não encontrada' })
    return prisma.vendedoraAvaliacao.update({ where: { id }, data: { status: 'RECUSADA', moderadoEm: new Date() } })
  })

  // Cliente clica em "Falar com a vendedora": registra o lead e devolve a URL do WhatsApp.
  app.post('/publico/:redeSlug/:vendSlug/lead', async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const body = leadSchema.parse(request.body ?? {})
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Catálogo indisponível' })
    const { rede, vend } = ctx

    // Handoff pelo número OFICIAL da marca (a conversa entra no CRM, roteada pela carteira).
    // Quando a marca ainda não conectou a WABA, cai no número pessoal da vendedora (fallback).
    const marcaConectada = !!(rede.waPhoneNumberId && rede.waNumeroExibicao)
    const saudacaoPadrao = body.resumo?.trim() || `Olá ${vend.nome.split(/\s+/)[0]}! Vim pelo catálogo e quero saber mais. 😊`

    // Sem telefone não dá para materializar o cliente aqui; ainda assim devolve o WhatsApp
    // (ao mandar a mensagem, o webhook cria o lead — por telefone ou pelo marcador (ref:)).
    const telefone = body.telefone?.replace(/\D/g, '')
    if (!telefone) {
      const textoSemTelefone = marcaConectada ? `${saudacaoPadrao}\n\n(ref: ${vendSlug})` : saudacaoPadrao
      return { whatsappUrl: whatsappUrl(marcaConectada ? rede.waNumeroExibicao : vend.telefone, textoSemTelefone) }
    }

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

    // Com carrinho: a mensagem vira curta + um link pro pedido no mesmo formato visual do
    // comprovante (sem QR/pagamento, que só fazem sentido depois de virar Orçamento/Venda de
    // verdade) — em vez do resumo em texto corrido montado no catálogo (Catalogo.tsx).
    let base = saudacaoPadrao
    if (body.itens?.length) {
      const pecas = body.itens.reduce((s, i) => s + i.qtd, 0)
      const subtotal = body.itens.reduce((s, i) => s + i.precoUnit * i.qtd, 0)
      const pedidoCatalogo = await prisma.pedidoCatalogo.create({
        data: { leadId, itens: body.itens, pecas, subtotal },
        select: { tokenPublico: true },
      })
      const linkPedido = urlPrePedidoPublica(redeSlug, pedidoCatalogo.tokenPublico)
      const valor = `R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      base = `Olá ${vend.nome.split(/\s+/)[0]}! Novo pedido pelo catálogo — ${pecas} peça(s), ${valor}.\nVeja os detalhes: ${linkPedido}`
    }
    // Marcador de atribuição: se a mensagem chegar ao número da marca sem casar por telefone,
    // o webhook usa o (ref:<slug>) para achar a vendedora dona do link.
    const texto = marcaConectada ? `${base}\n\n(ref: ${vendSlug})` : base
    const url = whatsappUrl(marcaConectada ? rede.waNumeroExibicao : vend.telefone, texto)

    return { whatsappUrl: url, leadId }
  })

  // Pré-pedido público (sem login): link enviado à vendedora no WhatsApp assim que o cliente
  // monta o carrinho na vitrine — mesmo formato visual do comprovante (Pedido.tsx), sem QR nem
  // seção de pagamento (ainda não virou Orçamento/Venda de verdade).
  app.get('/publico/pre-pedido/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const pedido = await prisma.pedidoCatalogo.findUnique({
      where: { tokenPublico: token },
      select: {
        id: true, itens: true, pecas: true, subtotal: true, createdAt: true, orcamentoId: true,
        lead: {
          select: {
            vendedora: { select: { nome: true } },
            cliente: { select: { nome: true, telefone: true } },
            loja: { select: { nome: true, rede: { select: { nome: true, logoUrl: true } } } },
          },
        },
      },
    })
    if (!pedido) return reply.code(404).send({ erro: 'Pedido não encontrado' })
    return {
      id: pedido.id, itens: pedido.itens, pecas: pedido.pecas, subtotal: pedido.subtotal, createdAt: pedido.createdAt,
      convertido: !!pedido.orcamentoId,
      vendedora: { nome: pedido.lead.vendedora.nome },
      cliente: pedido.lead.cliente ? { nome: pedido.lead.cliente.nome, telefone: pedido.lead.cliente.telefone } : null,
      loja: { nome: pedido.lead.loja.nome },
      marca: { nome: pedido.lead.loja.rede.nome, logoUrl: pedido.lead.loja.rede.logoUrl },
    }
  })

  // ─────── Verificação por WhatsApp (código de 6 dígitos) pro "Meus pedidos" ───────
  // Antes bastava digitar QUALQUER telefone pra ver os pedidos dele — agora precisa provar que é
  // dono do número, recebendo um código pelo WhatsApp da própria ZAIEZE (mesmo canal do "esqueci
  // minha senha" — enviarTemplatePlataforma —, não depende da marca ter WhatsApp oficial). Depois
  // de confirmado, vira um token assinado (JWT) que o /meus-pedidos exige — quem só tem o
  // telefone, sem o código, não passa mais.
  function gerarCodigo(): string {
    return String(Math.floor(100000 + Math.random() * 900000))
  }

  app.get('/publico/termo-cliente', async () => ({ versao: TERMO_CLIENTE_VERSAO, texto: TERMO_CLIENTE_TEXTO }))

  const enviarCodigoSchema = z.object({ telefone: z.string().min(8) })
  app.post('/publico/:redeSlug/:vendSlug/verificar-telefone/enviar', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Página não encontrada' })
    const { vend } = ctx
    const { telefone } = enviarCodigoSchema.parse(request.body)
    const telefoneLimpo = telefone.replace(/\D/g, '')
    if (telefoneLimpo.length < 8) return reply.code(422).send({ erro: 'WhatsApp inválido' })

    const codigo = gerarCodigo()
    await prisma.verificacaoTelefonePublico.create({
      data: {
        lojaId: vend.lojaId!, telefone: telefoneLimpo, codigoHash: await bcrypt.hash(codigo, 10),
        expiraEm: new Date(Date.now() + 10 * 60_000),
      },
    })
    await enviarTemplatePlataforma({ telefone: telefoneLimpo, templateNome: env.ZAIEZE_WA_TEMPLATE_OTP, params: [{ texto: codigo }] })
    return { ok: true }
  })

  const confirmarCodigoSchema = z.object({
    telefone: z.string().min(8), codigo: z.string().length(6),
    aceiteTermo: z.literal(true, { errorMap: () => ({ message: 'É preciso aceitar o termo pra continuar.' }) }),
  })
  app.post('/publico/:redeSlug/:vendSlug/verificar-telefone/confirmar', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Página não encontrada' })
    const { vend } = ctx
    const body = confirmarCodigoSchema.parse(request.body)
    const telefoneLimpo = body.telefone.replace(/\D/g, '')

    const verificacao = await prisma.verificacaoTelefonePublico.findFirst({
      where: { lojaId: vend.lojaId!, telefone: telefoneLimpo, usado: false, expiraEm: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!verificacao) return reply.code(400).send({ erro: 'Código expirado ou não encontrado. Peça um novo.' })
    if (verificacao.tentativas >= 5) return reply.code(429).send({ erro: 'Muitas tentativas. Peça um novo código.' })

    const confere = await bcrypt.compare(body.codigo, verificacao.codigoHash)
    if (!confere) {
      await prisma.verificacaoTelefonePublico.update({ where: { id: verificacao.id }, data: { tentativas: { increment: 1 } } })
      return reply.code(400).send({ erro: 'Código incorreto.' })
    }

    await prisma.$transaction([
      prisma.verificacaoTelefonePublico.update({ where: { id: verificacao.id }, data: { usado: true } }),
      prisma.aceiteTermoClientePublico.create({
        data: {
          lojaId: vend.lojaId!, telefone: telefoneLimpo, versao: TERMO_CLIENTE_VERSAO,
          ip: request.ip, userAgent: request.headers['user-agent'] ?? null,
        },
      }),
    ])

    const payloadToken: ClientePedidosPayload = { tipo: 'cliente_pedidos', lojaId: vend.lojaId!, telefone: telefoneLimpo }
    const token = app.jwt.sign(payloadToken as unknown as JwtUser, { expiresIn: '90d' })
    return { ok: true, token }
  })

  // "Ver Carrinho" (abertos) / "Ver Pedidos" (fechados) do perfil público — exige o token emitido
  // por /verificar-telefone/confirmar (mostra os pedidos do cliente NA LOJA inteira, não só os
  // desta vendedora: do ponto de vista dele é "meu histórico aqui", não importa quem atendeu).
  app.post('/publico/:redeSlug/:vendSlug/meus-pedidos', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Página não encontrada' })
    const { vend } = ctx
    const { token } = z.object({ token: z.string() }).parse(request.body)

    let payload: Partial<ClientePedidosPayload>
    try {
      payload = app.jwt.verify(token) as unknown as ClientePedidosPayload
    } catch {
      return reply.code(401).send({ erro: 'Verificação expirada. Confirme seu WhatsApp de novo.' })
    }
    if (payload.tipo !== 'cliente_pedidos' || payload.lojaId !== vend.lojaId || !payload.telefone) {
      return reply.code(401).send({ erro: 'Verificação expirada. Confirme seu WhatsApp de novo.' })
    }
    const telefoneLimpo = payload.telefone

    const cliente = await prisma.cliente.findUnique({
      where: { lojaId_telefone: { lojaId: vend.lojaId!, telefone: telefoneLimpo } },
      select: { id: true },
    })
    if (!cliente) return { abertos: [], fechados: [] }

    const [leadsAbertos, vendas] = await Promise.all([
      prisma.lead.findMany({
        where: { clienteId: cliente.id, status: { in: ['ENTROU', 'ATENDIDO', 'NEGOCIANDO'] } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true, createdAt: true,
          pedidosCatalogo: {
            orderBy: { createdAt: 'desc' }, take: 1,
            select: { pecas: true, subtotal: true, orcamento: { select: { status: true, tokenPublico: true } } },
          },
        },
      }),
      prisma.venda.findMany({
        where: { clienteId: cliente.id, status: 'CONCLUIDA' },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, tokenPublico: true, createdAt: true, total: true, statusEntrega: true, itens: { select: { quantidade: true } } },
      }),
    ])

    return {
      abertos: leadsAbertos.map((l) => {
        const pedido = l.pedidosCatalogo[0]
        return {
          id: l.id, status: l.status, createdAt: l.createdAt,
          pecas: pedido?.pecas ?? null, subtotal: pedido?.subtotal ?? null,
          statusOrcamento: pedido?.orcamento?.status ?? null,
          tokenOrcamento: pedido?.orcamento?.tokenPublico ?? null,
        }
      }),
      fechados: vendas.map((v) => ({
        id: v.id, tokenPublico: v.tokenPublico, createdAt: v.createdAt, total: v.total,
        statusEntrega: v.statusEntrega, pecas: v.itens.reduce((s, i) => s + i.quantidade, 0),
      })),
    }
  })

  // ─────── Favoritos da vitrine sincronizados (Portal do Cliente) ───────
  // Mesmo token do /meus-pedidos (verificação por WhatsApp). Sem verificar, os favoritos
  // continuam só no localStorage do navegador — isso aqui é o "espelho" no servidor.
  function verificarTokenCliente(reply: import('fastify').FastifyReply, token: string, lojaId: string): string | null {
    let payload: Partial<ClientePedidosPayload>
    try {
      payload = app.jwt.verify(token) as unknown as ClientePedidosPayload
    } catch {
      reply.code(401).send({ erro: 'Verificação expirada. Confirme seu WhatsApp de novo.' })
      return null
    }
    if (payload.tipo !== 'cliente_pedidos' || payload.lojaId !== lojaId || !payload.telefone) {
      reply.code(401).send({ erro: 'Verificação expirada. Confirme seu WhatsApp de novo.' })
      return null
    }
    return payload.telefone
  }

  // Busca os favoritos já salvos pra esse cliente (chamado ao verificar/abrir a vitrine).
  app.post('/publico/:redeSlug/:vendSlug/favoritos/buscar', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Página não encontrada' })
    const { vend } = ctx
    const { token } = z.object({ token: z.string() }).parse(request.body)
    const telefone = verificarTokenCliente(reply, token, vend.lojaId!)
    if (!telefone) return

    const cliente = await prisma.cliente.findUnique({
      where: { lojaId_telefone: { lojaId: vend.lojaId!, telefone } },
      select: { favoritosVitrine: true },
    })
    return { favoritos: cliente?.favoritosVitrine ?? [] }
  })

  // Salva (substitui) a lista de favoritos do cliente — o cliente sempre manda a lista completa
  // e atual (já mesclada no front), então dá pra favoritar E desfavoritar corretamente.
  const salvarFavoritosSchema = z.object({ token: z.string(), favoritos: z.array(z.string()).max(500) })
  app.post('/publico/:redeSlug/:vendSlug/favoritos', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { redeSlug, vendSlug } = request.params as { redeSlug: string; vendSlug: string }
    const ctx = await resolverVendedoraPublica(redeSlug, vendSlug)
    if (!ctx) return reply.code(404).send({ erro: 'Página não encontrada' })
    const { vend } = ctx
    const body = salvarFavoritosSchema.parse(request.body)
    const telefone = verificarTokenCliente(reply, body.token, vend.lojaId!)
    if (!telefone) return

    // Cliente pode não existir ainda (verificou o WhatsApp só pra favoritar, sem nunca ter
    // mandado mensagem) — cria com o mínimo, igual ao /lead, na carteira desta vendedora.
    const cliente = await prisma.cliente.upsert({
      where: { lojaId_telefone: { lojaId: vend.lojaId!, telefone } },
      create: {
        lojaId: vend.lojaId!, telefone, nome: 'Cliente do catálogo', vendedoraId: vend.id,
        consentimentoLgpd: true, favoritosVitrine: body.favoritos,
        observacoes: 'Entrou pelo catálogo (Portal do Cliente)',
      },
      update: { favoritosVitrine: body.favoritos },
      select: { favoritosVitrine: true },
    })
    return { favoritos: cliente.favoritosVitrine }
  })
}

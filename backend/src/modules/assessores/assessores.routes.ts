import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { exportarCsv, exportarTxt, exportarXlsx, exportarPdf, type LinhaVendaAssessora } from './exportar-vendas'
import { normalizarSlug, slugDisponivel } from './assessor.service'
import { criarPreapproval, mpConfigurado } from '../assinaturas/mercadopago.service'
import { validarCodigo, consumirCodigo, descricaoBeneficio } from '../promo/promo.service'
import { percentualEfetivoIndicacao } from './comissao-assessor.service'
import { proximoCicloFimAssessor, solicitarCancelamentoAssessor, reativarAssinaturaAssessor } from './assinatura-assessor.service'
import { montarContratoAssessor, CONTRATO_ASSESSOR_VERSAO } from './contrato-assessor.template'
import { PRIVACIDADE_VERSAO } from '../privacidade/privacidade.template'
import { TERMOS_USO_VERSAO } from '../termos-uso/termos-uso.template'
import { calcularDisponivelPorAgenda, agruparPorDia } from './agenda-disponibilidade.service'

const num = (v: unknown) => Number(v ?? 0)

/** O Decimal do Prisma serializa como string — normaliza percentualComissaoSugerido para number|null. */
function serializarMarca<T extends { percentualComissaoSugerido: unknown }>(m: T) {
  return { ...m, percentualComissaoSugerido: m.percentualComissaoSugerido != null ? Number(m.percentualComissaoSugerido) : null }
}

const TIPOS_LOGO: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' }
const TIPOS_VIDEO: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }

/** Limite de mídia de destaque por marca, conforme o plano do Brand Partner. */
const LIMITES_GALERIA: Record<'BASICO' | 'AVANCADO', { fotos: number; videos: number }> = {
  BASICO: { fotos: 3, videos: 0 },
  AVANCADO: { fotos: 10, videos: 5 },
}

const midiaSelect = { id: true, tipo: true, url: true, ordem: true } as const
const whatsappMarcaSelect = { id: true, numero: true, rotulo: true } as const

const marcaSelect = {
  id: true, redeId: true, nome: true, logoUrl: true, bannerUrl: true, exibirLogo: true, cliques: true,
  midias: { select: midiaSelect, orderBy: { ordem: 'asc' } },
  descricao: true, formasPagamento: true, modoEnvio: true, condicoesCompra: true,
  tamanhos: true, valores: true, endereco: true, cnpj: true,
  instagram: true, facebook: true, telegram: true, tiktok: true, site: true, googleEmpresas: true, linkCatalogo: true,
  whatsapps: { select: whatsappMarcaSelect, orderBy: { ordem: 'asc' } },
  percentualComissaoSugerido: true, ordem: true, ativo: true, autorizadoEm: true, recusadoEm: true,
} as const

// Vitrine/catálogo público só mostra marcas ativas e já autorizadas pelo gestor (ou externas,
// que nascem autorizadas — ver POST /minha/marcas e o provisionamento no checkout de Redes).
const marcaPublicaWhere = { ativo: true, autorizadoEm: { not: null } } as const

/** Fundo do card de marca na vitrine: a primeira foto de produto cadastrada na loja (Rede) que a
 *  marca representa — só existe pra marcas que já são clientes ZAIEZE (redeId preenchido); marcas
 *  externas (cadastradas manualmente pela assessora) não têm loja/catálogo, então caem na arte
 *  abstrata de fallback do frontend. "Primeira" = produto ativo mais antigo que já tem alguma
 *  foto (pula produtos sem foto ainda) — um produto por loja (distinct). */
async function primeiraFotoProdutoPorRede(redeIds: (string | null)[]): Promise<Map<string, string>> {
  const idsUnicos = [...new Set(redeIds.filter((id): id is string => !!id))]
  if (idsUnicos.length === 0) return new Map()
  const produtos = await prisma.produto.findMany({
    where: { redeId: { in: idsUnicos }, ativo: true, fotos: { isEmpty: false } },
    orderBy: { createdAt: 'asc' },
    distinct: ['redeId'],
    select: { redeId: true, fotos: true },
  })
  return new Map(produtos.map((p) => [p.redeId, p.fotos[0]]))
}

/** Painel da assessora de moda (perfil, marcas representadas, lançamento manual de vendas)
 *  + vitrine pública no subdomínio próprio dela. */
export async function assessoresRoutes(app: FastifyInstance) {
  // Preços dos 2 planos "Brand Partner" (página comercial) — editáveis em /admin/assessores/config.
  app.get('/plano', async () => {
    const config = await prisma.configAssessores.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
    return {
      precoMensalBasico: num(config.precoMensalBasico), precoMensalAvancado: num(config.precoMensalAvancado),
      limites: LIMITES_GALERIA,
    }
  })

  // Verifica disponibilidade do endereço (slug) — usado pelo formulário de cadastro em tempo real
  app.get('/slug-disponivel', async (request) => {
    const { slug } = request.query as { slug?: string }
    const normalizado = normalizarSlug(slug ?? '')
    return { slug: normalizado, disponivel: normalizado.length >= 2 && (await slugDisponivel(normalizado)) }
  })

  // Contrato de credenciamento — lido no cadastro antes do aceite (checkbox) e do pagamento
  app.get('/contrato', async () => montarContratoAssessor())

  // Validação pública de código promocional (cadastro mostra o benefício antes de enviar)
  app.get('/codigo-promo', async (request) => {
    const { codigo } = request.query as { codigo?: string }
    const c = await validarCodigo(codigo, 'ASSESSOR')
    if (!c) return { valido: false }
    return { valido: true, beneficio: descricaoBeneficio(c), tipo: c.tipo, dias: c.dias, percentual: c.percentual }
  })

  // Cadastro público (self-service): cria a conta + aceite do contrato + assinatura (real via MP
  // ou simulada) numa transação. Espelha /assinaturas/checkout (fluxo de signup de uma Rede).
  const cadastroSchema = z.object({
    nome: z.string().min(2),
    email: z.string().email(),
    senha: z.string().min(6),
    telefone: z.string().trim().optional(),
    slug: z.string().trim().min(2).max(60),
    plano: z.enum(['BASICO', 'AVANCADO']).default('BASICO'),
    cupom: z.string().trim().optional(),
    aceiteContrato: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar o contrato para continuar.' }) }),
    aceitePrivacidade: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar a Política de Privacidade para continuar.' }) }),
    aceiteTermosUso: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar os Termos de Uso para continuar.' }) }),
  })
  app.post('/cadastro', async (request, reply) => {
    const b = cadastroSchema.parse(request.body)
    const email = b.email.toLowerCase()
    const slug = normalizarSlug(b.slug)

    if (await prisma.usuario.findUnique({ where: { email } })) {
      return reply.code(409).send({ erro: 'Já existe uma conta com este e-mail.' })
    }
    if (!(await slugDisponivel(slug))) {
      return reply.code(409).send({ erro: 'Este endereço (subdomínio) já está em uso. Escolha outro.' })
    }

    const config = await prisma.configAssessores.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })

    // Código promocional (opcional): % de desconto na mensalidade ou dias grátis.
    const promo = await validarCodigo(b.cupom, 'ASSESSOR')
    if (b.cupom && b.cupom.trim() && !promo) {
      return reply.code(422).send({ erro: 'Código promocional inválido ou expirado.' })
    }
    let valor = b.plano === 'BASICO' ? num(config.precoMensalBasico) : num(config.precoMensalAvancado)
    if (promo?.tipo === 'PERCENTUAL' && promo.percentual) {
      valor = Math.round(valor * (1 - Number(promo.percentual) / 100) * 100) / 100
    }
    const diasGratis = promo?.tipo === 'DIAS_GRATIS' ? promo.dias ?? 0 : 0

    const senhaHash = await bcrypt.hash(b.senha, 10)
    const simulada = !mpConfigurado()
    // início do 1º ciclo: com dias grátis, o acesso vai até now+dias (depois cobra)
    const cicloFimComDiasGratis = () => {
      const d = new Date(); d.setDate(d.getDate() + diasGratis); return d
    }

    const assessor = await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.create({ data: { nome: b.nome, email, senhaHash, role: 'ASSESSORA', telefone: b.telefone ?? null } })
      const a = await tx.assessor.create({ data: { usuarioId: usuario.id, slug, plano: b.plano } })
      await tx.aceiteContratoAssessor.create({
        data: {
          assessorId: a.id, versao: CONTRATO_ASSESSOR_VERSAO, assinanteNome: b.nome, assinanteEmail: email,
          ip: request.ip, userAgent: request.headers['user-agent'] ?? null,
        },
      })
      await tx.aceitePrivacidadeAssessor.create({
        data: {
          assessorId: a.id, versao: PRIVACIDADE_VERSAO, assinanteNome: b.nome, assinanteEmail: email,
          ip: request.ip, userAgent: request.headers['user-agent'] ?? null,
        },
      })
      await tx.aceiteTermosUsoAssessor.create({
        data: {
          assessorId: a.id, versao: TERMOS_USO_VERSAO, assinanteNome: b.nome, assinanteEmail: email,
          ip: request.ip, userAgent: request.headers['user-agent'] ?? null,
        },
      })
      await tx.assinaturaAssessor.create({
        data: {
          assessorId: a.id, valor, simulada, status: simulada ? 'ATIVA' : 'PENDENTE',
          cicloFimEm: simulada ? (diasGratis ? cicloFimComDiasGratis() : proximoCicloFimAssessor()) : null,
        },
      })
      return a
    })

    const urlLogin = `${env.TENANT_SCHEME}://${slug}.${env.DOMINIO_BASE}/login`
    if (simulada) {
      if (promo) await consumirCodigo(promo.id)
      return reply.code(201).send({ simulado: true, slug, redirect: urlLogin })
    }

    try {
      const pre = await criarPreapproval({ reason: 'ZAIEZE — Corretor(a) de Moda', valor, email, redeSlug: slug, backUrl: urlLogin, diasGratis })
      await prisma.assinaturaAssessor.update({ where: { assessorId: assessor.id }, data: { mpPreapprovalId: pre.id } })
      if (promo) await consumirCodigo(promo.id)
      return reply.code(201).send({ simulado: false, slug, initPoint: pre.initPoint })
    } catch (e) {
      // Desfaz o provisionamento se o Mercado Pago falhar (cascade: assessor + assinatura + aceite)
      await prisma.usuario.delete({ where: { id: assessor.usuarioId } })
      throw e
    }
  })

  // Clique no link de indicação de lojista (?refAssessor=<slug>), disparado pelo checkout/landing.
  // Sempre responde ok — não expõe se o slug existe (mesmo critério do clique de afiliado).
  app.post('/publico/indicacao-clique', async (request) => {
    const { slug } = request.body as { slug?: string }
    if (slug?.trim()) {
      await prisma.assessor.updateMany({ where: { slug: normalizarSlug(slug) }, data: { cliquesIndicacao: { increment: 1 } } })
    }
    return { ok: true }
  })

  /** Média (1 casa decimal), total de avaliações APROVADAS e até 3 depoimentos mais recentes —
   *  usado na vitrine pública. Sem nenhuma aprovada ainda, statAvaliacao vem null (esconde o selo
   *  em vez de mostrar nota zerada). */
  async function resumoAvaliacoes(assessorId: string) {
    const [agregado, amostras] = await Promise.all([
      prisma.assessorAvaliacao.aggregate({ where: { assessorId, status: 'APROVADA' }, _avg: { nota: true }, _count: true }),
      prisma.assessorAvaliacao.findMany({
        where: { assessorId, status: 'APROVADA' }, orderBy: { moderadoEm: 'desc' }, take: 3,
        select: { nota: true, comentario: true, nomeCliente: true, createdAt: true },
      }),
    ])
    return {
      statAvaliacao: agregado._avg.nota != null ? Math.round(agregado._avg.nota * 10) / 10 : null,
      totalAvaliacoes: agregado._count,
      depoimentos: amostras,
    }
  }

  // ─────────── Público (sem auth) — vitrine no subdomínio <slug>.zaieze.com ───────────
  app.get('/publico/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const assessor = await prisma.assessor.findUnique({
      where: { slug },
      select: {
        id: true, slug: true, bio: true, tagline: true, disponivel: true, seguirAgenda: true, whatsapp: true, instagram: true, site: true,
        statProdutos: true, plano: true,
        usuario: { select: { nome: true, fotoUrl: true, ativo: true } },
        marcas: { where: marcaPublicaWhere, orderBy: { ordem: 'asc' }, select: marcaSelect },
        horarios: { select: { diaSemana: true, inicio: true, fim: true } },
        _count: { select: { clientes: true } },
      },
    })
    if (!assessor || !assessor.usuario.ativo) return reply.code(404).send({ erro: 'Página não encontrada' })
    const { statAvaliacao, totalAvaliacoes, depoimentos } = await resumoAvaliacoes(assessor.id)
    const fotoPorRede = await primeiraFotoProdutoPorRede(assessor.marcas.map((m) => m.redeId))
    return {
      nome: assessor.usuario.nome,
      fotoUrl: assessor.usuario.fotoUrl,
      bio: assessor.bio,
      tagline: assessor.tagline,
      plano: assessor.plano,
      disponivel: assessor.seguirAgenda ? calcularDisponivelPorAgenda(assessor.horarios) : assessor.disponivel,
      whatsapp: assessor.whatsapp,
      instagram: assessor.instagram,
      site: assessor.site,
      statMarcas: assessor.marcas.length,
      statProdutos: assessor.statProdutos,
      statClientes: assessor._count.clientes,
      statAvaliacao, totalAvaliacoes, depoimentos,
      marcas: assessor.marcas.map((m) => ({ ...serializarMarca(m), fotoProdutoUrl: (m.redeId && fotoPorRede.get(m.redeId)) || null })),
    }
  })

  // Manifesto PWA por assessora: "Adicionar à Tela de Início" (Android) mostra o nome dela e a
  // foto de perfil (já quadrada 512x512, mesmo endpoint de /usuarios/me/foto) em vez do ícone/
  // título genérico "ZAIEZE". Consumido pelo <link rel="manifest"> reescrito em pwaAssessora.ts
  // no frontend (só quando o subdomínio é dela — pra Rede o manifesto padrão continua valendo).
  app.get('/publico/:slug/manifest.webmanifest', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const assessor = await prisma.assessor.findUnique({
      where: { slug },
      select: { usuario: { select: { nome: true, fotoUrl: true, ativo: true } } },
    })
    if (!assessor || !assessor.usuario.ativo) return reply.code(404).send({ erro: 'Página não encontrada' })
    const nome = assessor.usuario.nome
    reply.type('application/manifest+json')
    return {
      name: nome,
      short_name: nome,
      description: `Vitrine e catálogo de moda — ${nome}`,
      start_url: '/?pwa=1',
      scope: '/',
      display: 'standalone',
      background_color: '#000000',
      theme_color: '#000000',
      icons: assessor.usuario.fotoUrl
        ? [{ src: assessor.usuario.fotoUrl, sizes: '512x512', type: 'image/webp', purpose: 'any' }]
        : [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
    }
  })

  // Lista completa dos depoimentos aprovados (pro "ver mais" na vitrine — o resumo acima só
  // manda os 3 mais recentes).
  app.get('/publico/:slug/avaliacoes', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const assessor = await prisma.assessor.findUnique({ where: { slug }, select: { id: true } })
    if (!assessor) return reply.code(404).send({ erro: 'Página não encontrada' })
    return prisma.assessorAvaliacao.findMany({
      where: { assessorId: assessor.id, status: 'APROVADA' },
      orderBy: { moderadoEm: 'desc' },
      take: 50,
      select: { nota: true, comentario: true, nomeCliente: true, createdAt: true },
    })
  })

  // Envio de avaliação pelo cliente — público, sem login. Nasce PENDENTE (só entra na média/
  // depoimentos depois que a Brand Partner aprova). Rate-limit contra spam/flood.
  const avaliacaoSchema = z.object({
    nota: z.number().int().min(1).max(5),
    comentario: z.string().trim().max(400).nullable().optional(),
    nomeCliente: z.string().trim().max(80).nullable().optional(),
  })
  app.post('/publico/:slug/avaliacao', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const assessor = await prisma.assessor.findUnique({ where: { slug }, select: { id: true } })
    if (!assessor) return reply.code(404).send({ erro: 'Página não encontrada' })
    const b = avaliacaoSchema.parse(request.body)
    await prisma.assessorAvaliacao.create({
      data: { assessorId: assessor.id, nota: b.nota, comentario: b.comentario || null, nomeCliente: b.nomeCliente || null },
    })
    return reply.code(201).send({ ok: true })
  })

  // Lançamentos ativos, ordenados pela comissão sugerida da marca (quem paga mais aparece
  // primeiro) e, dentro do mesmo nível, pelo mais recente. Só de marcas públicas/autorizadas.
  app.get('/publico/:slug/lancamentos', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const assessor = await prisma.assessor.findUnique({ where: { slug }, select: { id: true } })
    if (!assessor) return reply.code(404).send({ erro: 'Página não encontrada' })
    const lancamentos = await prisma.assessorLancamento.findMany({
      where: { assessorId: assessor.id, ativo: true, fotoUrl: { not: null }, assessorMarca: marcaPublicaWhere },
      orderBy: [{ assessorMarca: { percentualComissaoSugerido: 'desc' } }, { createdAt: 'desc' }],
      select: {
        id: true, nome: true, fotoUrl: true, preco: true, descricao: true,
        assessorMarca: { select: { id: true, nome: true, linkCatalogo: true, whatsapps: { select: whatsappMarcaSelect, orderBy: { ordem: 'asc' } } } },
      },
    })
    return lancamentos.map((l) => ({ ...l, preco: l.preco != null ? num(l.preco) : null }))
  })

  // Clique num link de contato (WhatsApp, catálogo etc.) de uma marca representada — público,
  // sem login. Métrica pra Brand Partner acompanhar quantos clientes ela mandou pra cada loja
  // (não confirma atendimento/venda do lado do lojista). Rate-limit generoso: um visitante
  // navegando pode abrir vários links da mesma marca em sequência.
  app.post('/publico/marcas/:id/clique', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, ...marcaPublicaWhere }, select: { id: true } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    await prisma.assessorMarca.update({ where: { id }, data: { cliques: { increment: 1 } } })
    return reply.code(204).send()
  })

  // preHandler por rota (não addHook): este módulo mistura a vitrine pública acima com o
  // painel autenticado abaixo — um onRequest global gataria também a rota pública.
  const protegido = { preHandler: [app.authorize('ASSESSORA')] }

  async function assessorDoUsuario(usuarioId: string) {
    return prisma.assessor.findUniqueOrThrow({ where: { usuarioId } })
  }

  // ─────────── Perfil ───────────
  app.get('/minha', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const [horarios, totalClientes] = await Promise.all([
      prisma.assessorHorario.findMany({
        where: { assessorId: assessor.id },
        orderBy: [{ diaSemana: 'asc' }, { ordem: 'asc' }],
        select: { diaSemana: true, inicio: true, fim: true },
      }),
      prisma.assessorCliente.count({ where: { assessorId: assessor.id } }),
    ])
    return {
      slug: assessor.slug, bio: assessor.bio, tagline: assessor.tagline,
      disponivel: assessor.disponivel, seguirAgenda: assessor.seguirAgenda,
      disponivelAgora: assessor.seguirAgenda ? calcularDisponivelPorAgenda(horarios) : assessor.disponivel,
      horarios: agruparPorDia(horarios),
      whatsapp: assessor.whatsapp, instagram: assessor.instagram, site: assessor.site,
      statProdutos: assessor.statProdutos, statClientes: totalClientes,
      plano: assessor.plano, limites: LIMITES_GALERIA[assessor.plano],
    }
  })

  const trocarPlanoSchema = z.object({ plano: z.enum(['BASICO', 'AVANCADO']) })
  // Troca de plano self-service — mesmo padrão de POST /assinaturas/trocar-plano (Rede): aplica
  // imediatamente, sem interação com o Mercado Pago (a próxima cobrança reflete o novo valor).
  app.post('/minha/trocar-plano', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { plano } = trocarPlanoSchema.parse(request.body)
    if (plano === assessor.plano) return reply.code(422).send({ erro: 'Você já está nesse plano.' })
    const assinatura = await prisma.assinaturaAssessor.findUnique({ where: { assessorId: assessor.id } })
    if (!assinatura) return reply.code(404).send({ erro: 'Assinatura não encontrada.' })
    const config = await prisma.configAssessores.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
    const valor = plano === 'BASICO' ? num(config.precoMensalBasico) : num(config.precoMensalAvancado)
    await prisma.$transaction([
      prisma.assessor.update({ where: { id: assessor.id }, data: { plano } }),
      prisma.assinaturaAssessor.update({ where: { assessorId: assessor.id }, data: { valor } }),
    ])
    return { ok: true, plano, valor, limites: LIMITES_GALERIA[plano] }
  })

  const perfilSchema = z.object({
    bio: z.string().trim().max(600).nullable().optional(),
    tagline: z.string().trim().max(140).nullable().optional(),
    disponivel: z.boolean().optional(),
    seguirAgenda: z.boolean().optional(),
    whatsapp: z.string().trim().max(30).nullable().optional(),
    instagram: z.string().trim().max(200).nullable().optional(),
    site: z.string().trim().max(200).nullable().optional(),
    statProdutos: z.coerce.number().int().min(0).nullable().optional(),
  })
  app.patch('/minha', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const b = perfilSchema.parse(request.body)
    return prisma.assessor.update({ where: { id: assessor.id }, data: b })
  })

  // ─────────── Meus Clientes (contagem real da vitrine) ───────────
  // Sem rastreio automático de conversa (o WhatsApp abre por fora do sistema) — a assessora
  // marca manualmente quem virou cliente dela. statClientes na vitrine é o total desses registros.
  app.get('/minha/clientes', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    return prisma.assessorCliente.findMany({
      where: { assessorId: assessor.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, nome: true, telefone: true, createdAt: true },
    })
  })

  const clienteSchema = z.object({
    nome: z.string().trim().min(1).max(120),
    telefone: z.string().trim().max(30).nullable().optional(),
  })
  app.post('/minha/clientes', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const b = clienteSchema.parse(request.body)
    const cliente = await prisma.assessorCliente.create({
      data: { assessorId: assessor.id, nome: b.nome, telefone: b.telefone || null },
      select: { id: true, nome: true, telefone: true, createdAt: true },
    })
    return reply.code(201).send(cliente)
  })

  app.delete('/minha/clientes/:id', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const existente = await prisma.assessorCliente.findFirst({ where: { id, assessorId: assessor.id } })
    if (!existente) return reply.code(404).send({ erro: 'Cliente não encontrado' })
    await prisma.assessorCliente.delete({ where: { id } })
    return { ok: true }
  })

  // ─────────── Avaliações de atendimento (moderação) ───────────
  app.get('/minha/avaliacoes', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { status } = request.query as { status?: string }
    const avaliacoes = await prisma.assessorAvaliacao.findMany({
      where: { assessorId: assessor.id, ...(status ? { status: status as 'PENDENTE' | 'APROVADA' | 'RECUSADA' } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, nota: true, comentario: true, nomeCliente: true, status: true, createdAt: true },
    })
    return avaliacoes
  })

  app.post('/minha/avaliacoes/:id/aprovar', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const avaliacao = await prisma.assessorAvaliacao.findFirst({ where: { id, assessorId: assessor.id } })
    if (!avaliacao) return reply.code(404).send({ erro: 'Avaliação não encontrada' })
    return prisma.assessorAvaliacao.update({ where: { id }, data: { status: 'APROVADA', moderadoEm: new Date() } })
  })

  app.post('/minha/avaliacoes/:id/recusar', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const avaliacao = await prisma.assessorAvaliacao.findFirst({ where: { id, assessorId: assessor.id } })
    if (!avaliacao) return reply.code(404).send({ erro: 'Avaliação não encontrada' })
    return prisma.assessorAvaliacao.update({ where: { id }, data: { status: 'RECUSADA', moderadoEm: new Date() } })
  })

  // ─────────── Lançamentos (modelos das marcas que ela quer destacar) ───────────
  function serializarLancamento<T extends { preco: unknown }>(l: T) {
    return { ...l, preco: (l as { preco: unknown }).preco != null ? num((l as { preco: unknown }).preco) : null }
  }
  const lancamentoSelect = {
    id: true, nome: true, fotoUrl: true, preco: true, descricao: true, ativo: true, createdAt: true,
    assessorMarcaId: true, assessorMarca: { select: { id: true, nome: true } },
  } as const

  app.get('/minha/lancamentos', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const lancamentos = await prisma.assessorLancamento.findMany({
      where: { assessorId: assessor.id }, orderBy: { createdAt: 'desc' }, select: lancamentoSelect,
    })
    return lancamentos.map(serializarLancamento)
  })

  const lancamentoSchema = z.object({
    assessorMarcaId: z.string().min(1),
    nome: z.string().trim().min(1).max(120),
    preco: z.coerce.number().positive().nullable().optional(),
    descricao: z.string().trim().max(300).nullable().optional(),
    ativo: z.boolean().optional(),
  })
  app.post('/minha/lancamentos', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const b = lancamentoSchema.parse(request.body)
    const marca = await prisma.assessorMarca.findFirst({ where: { id: b.assessorMarcaId, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    const lancamento = await prisma.assessorLancamento.create({
      data: { assessorId: assessor.id, assessorMarcaId: b.assessorMarcaId, nome: b.nome, preco: b.preco ?? null, descricao: b.descricao ?? null },
      select: lancamentoSelect,
    })
    return reply.code(201).send(serializarLancamento(lancamento))
  })

  app.patch('/minha/lancamentos/:id', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const lancamento = await prisma.assessorLancamento.findFirst({ where: { id, assessorId: assessor.id } })
    if (!lancamento) return reply.code(404).send({ erro: 'Lançamento não encontrado' })
    const b = lancamentoSchema.partial().parse(request.body)
    const atualizado = await prisma.assessorLancamento.update({ where: { id }, data: b, select: lancamentoSelect })
    return serializarLancamento(atualizado)
  })

  app.delete('/minha/lancamentos/:id', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const lancamento = await prisma.assessorLancamento.findFirst({ where: { id, assessorId: assessor.id } })
    if (!lancamento) return reply.code(404).send({ erro: 'Lançamento não encontrado' })
    if (lancamento.fotoUrl?.startsWith('/api/uploads/')) {
      const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
      fs.unlink(path.join(dir, path.basename(lancamento.fotoUrl))).catch(() => {})
    }
    await prisma.assessorLancamento.delete({ where: { id } })
    return { ok: true }
  })

  app.post('/minha/lancamentos/:id/foto', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const lancamento = await prisma.assessorLancamento.findFirst({ where: { id, assessorId: assessor.id } })
    if (!lancamento) return reply.code(404).send({ erro: 'Lançamento não encontrado' })

    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo de imagem no campo "file"' })
    const ext = TIPOS_LOGO[arquivo.mimetype]
    if (!ext) return reply.code(422).send({ erro: 'Formato inválido. Use PNG ou JPG.' })

    const buffer = await arquivo.toBuffer()
    const nome = `lancamento-${id}-${crypto.randomBytes(6).toString('hex')}.${ext}`
    const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, nome), buffer)

    const fotoUrl = `/api/uploads/${nome}`
    const atualizado = await prisma.assessorLancamento.update({ where: { id }, data: { fotoUrl }, select: lancamentoSelect })

    if (lancamento.fotoUrl?.startsWith('/api/uploads/') && lancamento.fotoUrl !== fotoUrl) {
      fs.unlink(path.join(dir, path.basename(lancamento.fotoUrl))).catch(() => {})
    }
    return serializarLancamento(atualizado)
  })

  // Agenda semanal (7 dias fixos, domingo a sábado) — controla o badge Disponível/Offline da
  // vitrine quando seguirAgenda=true. Cada dia pode ter vários períodos (ex.: manhã e tarde).
  // Substitui a semana inteira de uma vez (mais simples que CRUD individual por período).
  const periodoSchema = z.object({
    inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    fim: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  }).refine((p) => p.inicio < p.fim, { message: 'O início precisa ser antes do fim.' })
  const horarioDiaSchema = z.object({
    diaSemana: z.number().int().min(0).max(6),
    periodos: z.array(periodoSchema).max(6), // limite generoso — dificilmente passa de 2-3 na prática
  })
  const horariosSchema = z.array(horarioDiaSchema).length(7)

  app.put('/minha/horarios', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const b = horariosSchema.parse(request.body)
    const linhas = b.flatMap((d) => d.periodos.map((p, i) => ({
      assessorId: assessor.id, diaSemana: d.diaSemana, ordem: i, inicio: p.inicio, fim: p.fim,
    })))
    await prisma.$transaction([
      prisma.assessorHorario.deleteMany({ where: { assessorId: assessor.id } }),
      ...(linhas.length > 0 ? [prisma.assessorHorario.createMany({ data: linhas })] : []),
    ])
    const horarios = await prisma.assessorHorario.findMany({
      where: { assessorId: assessor.id },
      orderBy: [{ diaSemana: 'asc' }, { ordem: 'asc' }],
      select: { diaSemana: true, inicio: true, fim: true },
    })
    return { horarios: agruparPorDia(horarios), disponivelAgora: calcularDisponivelPorAgenda(horarios) }
  })

  // ─────────── Indicação de lojistas (link ?refAssessor=<slug>, comissão recorrente) ───────────
  app.get('/minha/indicacao', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const [redesIndicadas, somas, percentualEfetivo] = await Promise.all([
      prisma.rede.count({ where: { assessorOrigemId: assessor.id } }),
      prisma.comissaoAssessor.groupBy({ by: ['status'], where: { assessorId: assessor.id }, _sum: { valorComissao: true } }),
      percentualEfetivoIndicacao(assessor),
    ])
    const pendente = somas.find((s) => s.status === 'PENDENTE')?._sum.valorComissao
    const paga = somas.find((s) => s.status === 'PAGA')?._sum.valorComissao
    return {
      slug: assessor.slug,
      percentual: num(percentualEfetivo),
      cliques: assessor.cliquesIndicacao,
      redesIndicadas,
      pendente: num(pendente),
      paga: num(paga),
    }
  })

  // ─────────── Marcas representadas ───────────
  app.get('/minha/marcas', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const marcas = await prisma.assessorMarca.findMany({ where: { assessorId: assessor.id }, orderBy: { ordem: 'asc' }, select: marcaSelect })
    return marcas.map(serializarMarca)
  })

  // Campos que a vitrine pública renderiza direto como href (VitrineAssessora.tsx) — sem exigir
  // http(s), um valor tipo "javascript:..." viraria link clicável e executaria script na origem
  // do app pra qualquer visitante, sem autenticação nenhuma. Vazio continua permitido (campo opcional).
  const linkSeguro = (max: number) =>
    z.string().trim().max(max)
      .refine((v) => v === '' || /^https?:\/\//i.test(v), { message: 'Informe um link começando com http:// ou https://' })
      .nullable().optional()

  const marcaSchema = z.object({
    nome: z.string().trim().min(1).max(120),
    descricao: z.string().trim().max(2000).nullable().optional(),
    formasPagamento: z.string().trim().max(1000).nullable().optional(),
    modoEnvio: z.string().trim().max(1000).nullable().optional(),
    condicoesCompra: z.string().trim().max(1000).nullable().optional(),
    tamanhos: z.string().trim().max(200).nullable().optional(),
    valores: z.string().trim().max(200).nullable().optional(),
    endereco: z.string().trim().max(500).nullable().optional(),
    cnpj: z.string().trim().max(30).nullable().optional(),
    instagram: linkSeguro(200),
    facebook: linkSeguro(200),
    telegram: linkSeguro(200),
    tiktok: linkSeguro(200),
    site: linkSeguro(200),
    googleEmpresas: linkSeguro(300),
    linkCatalogo: linkSeguro(300),
    percentualComissaoSugerido: z.coerce.number().positive().max(100).nullable().optional(),
    ativo: z.boolean().optional(),
    exibirLogo: z.boolean().optional(),
  })

  app.post('/minha/marcas', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const b = marcaSchema.parse(request.body)
    const maiorOrdem = await prisma.assessorMarca.aggregate({ where: { assessorId: assessor.id }, _max: { ordem: true } })
    const marca = await prisma.assessorMarca.create({
      // Cadastro manual = marca externa (sem redeId), nasce autorizada — não há gestor para aceitar.
      data: { ...b, assessorId: assessor.id, ordem: (maiorOrdem._max.ordem ?? -1) + 1, autorizadoEm: new Date() },
      select: marcaSelect,
    })
    return serializarMarca(marca)
  })

  app.patch('/minha/marcas/:id', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    const b = marcaSchema.partial().parse(request.body)
    const atualizada = await prisma.assessorMarca.update({ where: { id }, data: b, select: marcaSelect })
    return serializarMarca(atualizada)
  })

  app.delete('/minha/marcas/:id', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    await prisma.assessorMarca.delete({ where: { id } })
    return { ok: true }
  })

  // Upload da logo de uma marca representada — mesma lógica do banner abaixo (disco local).
  app.post('/minha/marcas/:id/logo', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })

    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo de imagem no campo "file"' })
    const ext = TIPOS_LOGO[arquivo.mimetype]
    if (!ext) return reply.code(422).send({ erro: 'Formato inválido. Use PNG ou JPG.' })

    const buffer = await arquivo.toBuffer()
    const nome = `logo-assessor-${id}-${crypto.randomBytes(6).toString('hex')}.${ext}`
    const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, nome), buffer)

    const logoUrl = `/api/uploads/${nome}`
    const atualizada = await prisma.assessorMarca.update({ where: { id }, data: { logoUrl }, select: marcaSelect })

    const anterior = (request.query as { anterior?: string }).anterior
    if (anterior?.startsWith('/api/uploads/') && anterior !== logoUrl) {
      fs.unlink(path.join(dir, path.basename(anterior))).catch(() => {})
    }
    return serializarMarca(atualizada)
  })

  app.delete('/minha/marcas/:id/logo', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    if (marca.logoUrl?.startsWith('/api/uploads/')) {
      const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
      fs.unlink(path.join(dir, path.basename(marca.logoUrl))).catch(() => {})
    }
    const atualizada = await prisma.assessorMarca.update({ where: { id }, data: { logoUrl: null }, select: marcaSelect })
    return serializarMarca(atualizada)
  })

  // Upload do banner (imagem grande do card na vitrine) de uma marca representada — mesma
  // lógica de backend/src/modules/marca/marca.routes.ts (disco local, não usa R2).
  app.post('/minha/marcas/:id/banner', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })

    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo de imagem no campo "file"' })
    const ext = TIPOS_LOGO[arquivo.mimetype]
    if (!ext) return reply.code(422).send({ erro: 'Formato inválido. Use PNG ou JPG.' })

    const buffer = await arquivo.toBuffer()
    const nome = `banner-assessor-${id}-${crypto.randomBytes(6).toString('hex')}.${ext}`
    const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, nome), buffer)

    const bannerUrl = `/api/uploads/${nome}`
    const atualizada = await prisma.assessorMarca.update({ where: { id }, data: { bannerUrl }, select: marcaSelect })

    const anterior = (request.query as { anterior?: string }).anterior
    if (anterior?.startsWith('/api/uploads/') && anterior !== bannerUrl) {
      fs.unlink(path.join(dir, path.basename(anterior))).catch(() => {})
    }
    return serializarMarca(atualizada)
  })

  app.delete('/minha/marcas/:id/banner', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    if (marca.bannerUrl?.startsWith('/api/uploads/')) {
      const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
      fs.unlink(path.join(dir, path.basename(marca.bannerUrl))).catch(() => {})
    }
    const atualizada = await prisma.assessorMarca.update({ where: { id }, data: { bannerUrl: null }, select: marcaSelect })
    return serializarMarca(atualizada)
  })

  // Galeria de destaque dos produtos (fotos/vídeos) — aparece na janela de links da vitrine.
  // Limite por tipo definido pelo plano do Brand Partner (ver LIMITES_GALERIA).
  app.post('/minha/marcas/:id/midia', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const { tipo } = request.query as { tipo?: string }
    if (tipo !== 'FOTO' && tipo !== 'VIDEO') return reply.code(400).send({ erro: 'Tipo inválido.' })
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })

    const limite = LIMITES_GALERIA[assessor.plano][tipo === 'FOTO' ? 'fotos' : 'videos']
    const atuais = await prisma.assessorMarcaMidia.count({ where: { assessorMarcaId: id, tipo } })
    if (atuais >= limite) {
      return reply.code(422).send({
        erro: limite === 0
          ? 'Seu plano atual não inclui vídeo — faça upgrade para o plano Avançado.'
          : `Seu plano permite até ${limite} ${tipo === 'FOTO' ? 'fotos' : 'vídeos'} por marca. Remova um item ou faça upgrade.`,
      })
    }

    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo no campo "file"' })
    const tipos = tipo === 'FOTO' ? TIPOS_LOGO : TIPOS_VIDEO
    const ext = tipos[arquivo.mimetype]
    if (!ext) return reply.code(422).send({ erro: tipo === 'FOTO' ? 'Formato inválido. Use PNG ou JPG.' : 'Formato inválido. Use MP4, WEBM ou MOV.' })

    const buffer = await arquivo.toBuffer()
    const nome = `midia-assessor-${id}-${crypto.randomBytes(6).toString('hex')}.${ext}`
    const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, nome), buffer)

    const url = `/api/uploads/${nome}`
    const maiorOrdem = await prisma.assessorMarcaMidia.aggregate({ where: { assessorMarcaId: id, tipo }, _max: { ordem: true } })
    return prisma.assessorMarcaMidia.create({
      data: { assessorMarcaId: id, tipo, url, ordem: (maiorOrdem._max.ordem ?? -1) + 1 },
      select: midiaSelect,
    })
  })

  app.delete('/minha/marcas/:id/midia/:midiaId', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id, midiaId } = request.params as { id: string; midiaId: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    const midia = await prisma.assessorMarcaMidia.findFirst({ where: { id: midiaId, assessorMarcaId: id } })
    if (!midia) return reply.code(404).send({ erro: 'Mídia não encontrada' })
    if (midia.url.startsWith('/api/uploads/')) {
      const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
      fs.unlink(path.join(dir, path.basename(midia.url))).catch(() => {})
    }
    await prisma.assessorMarcaMidia.delete({ where: { id: midiaId } })
    return { ok: true }
  })

  // Números de WhatsApp de uma marca representada — mais de um permitido (ex.: "Atendimento",
  // "Vendas"), cada um vira uma linha própria na janela de links da vitrine.
  const whatsappMarcaSchema = z.object({
    numero: z.string().trim().min(1).max(30),
    rotulo: z.string().trim().max(60).nullable().optional(),
  })
  app.post('/minha/marcas/:id/whatsapps', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    const b = whatsappMarcaSchema.parse(request.body)
    const maiorOrdem = await prisma.assessorMarcaWhatsapp.aggregate({ where: { assessorMarcaId: id }, _max: { ordem: true } })
    const numero = await prisma.assessorMarcaWhatsapp.create({
      data: { assessorMarcaId: id, numero: b.numero, rotulo: b.rotulo || null, ordem: (maiorOrdem._max.ordem ?? -1) + 1 },
      select: whatsappMarcaSelect,
    })
    return reply.code(201).send(numero)
  })

  app.delete('/minha/marcas/:id/whatsapps/:whatsappId', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id, whatsappId } = request.params as { id: string; whatsappId: string }
    const marca = await prisma.assessorMarca.findFirst({ where: { id, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    const numero = await prisma.assessorMarcaWhatsapp.findFirst({ where: { id: whatsappId, assessorMarcaId: id } })
    if (!numero) return reply.code(404).send({ erro: 'Número não encontrado' })
    await prisma.assessorMarcaWhatsapp.delete({ where: { id: whatsappId } })
    return { ok: true }
  })

  // ─────────── Vendas (lançamento manual de comissão) ───────────
  const filtroVendasSchema = z.object({
    de: z.string().optional(),
    ate: z.string().optional(),
    marcaId: z.string().optional(),
  })

  async function buscarVendas(assessorId: string, query: unknown) {
    const f = filtroVendasSchema.parse(query)
    return prisma.vendaAssessora.findMany({
      where: {
        assessorId,
        ...(f.marcaId ? { assessorMarcaId: f.marcaId } : {}),
        ...(f.de || f.ate ? { data: { ...(f.de ? { gte: new Date(f.de) } : {}), ...(f.ate ? { lte: new Date(f.ate) } : {}) } } : {}),
      },
      orderBy: { data: 'desc' },
      include: { assessorMarca: { select: { nome: true } } },
    })
  }

  app.get('/minha/vendas', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const vendas = await buscarVendas(assessor.id, request.query)
    return vendas.map((v) => ({
      id: v.id, data: v.data, marca: v.assessorMarca.nome, assessorMarcaId: v.assessorMarcaId,
      valorVenda: num(v.valorVenda), percentualComissao: num(v.percentualComissao), totalComissao: num(v.totalComissao),
      observacao: v.observacao,
    }))
  })

  const vendaSchema = z.object({
    assessorMarcaId: z.string().min(1),
    data: z.coerce.date(),
    valorVenda: z.coerce.number().positive(),
    percentualComissao: z.coerce.number().positive().max(100),
    observacao: z.string().trim().max(500).nullable().optional(),
  })

  app.post('/minha/vendas', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const b = vendaSchema.parse(request.body)
    const marca = await prisma.assessorMarca.findFirst({ where: { id: b.assessorMarcaId, assessorId: assessor.id } })
    if (!marca) return reply.code(404).send({ erro: 'Marca não encontrada' })
    const totalComissao = Math.round(b.valorVenda * b.percentualComissao) / 100
    const venda = await prisma.vendaAssessora.create({
      data: { ...b, assessorId: assessor.id, totalComissao },
      include: { assessorMarca: { select: { nome: true } } },
    })
    return reply.code(201).send({
      id: venda.id, data: venda.data, marca: venda.assessorMarca.nome, assessorMarcaId: venda.assessorMarcaId,
      valorVenda: num(venda.valorVenda), percentualComissao: num(venda.percentualComissao), totalComissao: num(venda.totalComissao),
      observacao: venda.observacao,
    })
  })

  app.delete('/minha/vendas/:id', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { id } = request.params as { id: string }
    const venda = await prisma.vendaAssessora.findFirst({ where: { id, assessorId: assessor.id } })
    if (!venda) return reply.code(404).send({ erro: 'Venda não encontrada' })
    await prisma.vendaAssessora.delete({ where: { id } })
    return { ok: true }
  })

  app.get('/minha/vendas/exportar', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const { formato } = request.query as { formato?: string }
    const vendas = await buscarVendas(assessor.id, request.query)
    const linhas: LinhaVendaAssessora[] = vendas.map((v) => ({
      data: v.data, marca: v.assessorMarca.nome, valorVenda: num(v.valorVenda),
      percentualComissao: num(v.percentualComissao), totalComissao: num(v.totalComissao),
    }))
    const usuario = await prisma.usuario.findUnique({ where: { id: request.user.sub }, select: { nome: true } })
    const nomeArquivo = `vendas-${assessor.slug}`

    if (formato === 'xlsx') {
      const buffer = await exportarXlsx(linhas)
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      reply.header('Content-Disposition', `attachment; filename="${nomeArquivo}.xlsx"`)
      return reply.send(buffer)
    }
    if (formato === 'pdf') {
      const buffer = await exportarPdf(linhas, usuario?.nome ?? '')
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `attachment; filename="${nomeArquivo}.pdf"`)
      return reply.send(buffer)
    }
    if (formato === 'txt') {
      reply.header('Content-Type', 'text/plain; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${nomeArquivo}.txt"`)
      return reply.send(exportarTxt(linhas))
    }
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', `attachment; filename="${nomeArquivo}.csv"`)
    return reply.send(exportarCsv(linhas))
  })

  // ─────────── Assinatura (recorrência mensal via Mercado Pago) ───────────
  app.get('/minha/assinatura', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const a = await prisma.assinaturaAssessor.findUnique({ where: { assessorId: assessor.id } })
    if (!a) return { existe: false as const }
    return {
      existe: true as const, status: a.status, valor: num(a.valor), simulada: a.simulada,
      cicloFimEm: a.cicloFimEm, cancelamentoSolicitadoEm: a.cancelamentoSolicitadoEm,
    }
  })

  app.post('/minha/assinatura/cancelar', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const r = await solicitarCancelamentoAssessor(assessor.id, 'ASSESSORA')
    return { ok: true, acessoAte: r.acessoAte }
  })

  app.post('/minha/assinatura/reativar', protegido, async (request, reply) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const ok = await reativarAssinaturaAssessor(assessor.id)
    if (!ok) return reply.code(422).send({ erro: 'Assinatura já encerrada — assine novamente.' })
    return { ok: true }
  })
}

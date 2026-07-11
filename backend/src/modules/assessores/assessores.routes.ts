import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { exportarCsv, exportarTxt, exportarXlsx, exportarPdf, type LinhaVendaAssessora } from './exportar-vendas'
import { gerarCatalogoPdf } from './catalogo-pdf.service'
import { normalizarSlug, slugDisponivel } from './assessor.service'
import { criarPreapproval, mpConfigurado } from '../assinaturas/mercadopago.service'
import { validarCodigo, consumirCodigo, descricaoBeneficio } from '../promo/promo.service'
import { proximoCicloFimAssessor, solicitarCancelamentoAssessor, reativarAssinaturaAssessor } from './assinatura-assessor.service'
import { montarContratoAssessor, CONTRATO_ASSESSOR_VERSAO } from './contrato-assessor.template'

const num = (v: unknown) => Number(v ?? 0)

/** O Decimal do Prisma serializa como string — normaliza percentualComissaoSugerido para number|null. */
function serializarMarca<T extends { percentualComissaoSugerido: unknown }>(m: T) {
  return { ...m, percentualComissaoSugerido: m.percentualComissaoSugerido != null ? Number(m.percentualComissaoSugerido) : null }
}

const marcaSelect = {
  id: true, redeId: true, nome: true, logoUrl: true,
  descricao: true, formasPagamento: true, modoEnvio: true, condicoesCompra: true,
  tamanhos: true, valores: true, endereco: true, cnpj: true,
  instagram: true, facebook: true, whatsapp: true, telegram: true, tiktok: true, site: true,
  percentualComissaoSugerido: true, ordem: true, ativo: true,
} as const

/** Painel da assessora de moda (perfil, marcas representadas, lançamento manual de vendas)
 *  + vitrine pública no subdomínio próprio dela. */
export async function assessoresRoutes(app: FastifyInstance) {
  // Preço do plano "Assessor(a) de Moda" (página comercial) — editável em /admin/assessores/config.
  app.get('/plano', async () => {
    const config = await prisma.configAssessores.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
    return { precoMensal: num(config.precoMensal) }
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
    cupom: z.string().trim().optional(),
    aceiteContrato: z.literal(true, { errorMap: () => ({ message: 'É necessário aceitar o contrato para continuar.' }) }),
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
    let valor = num(config.precoMensal)
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
      const a = await tx.assessor.create({ data: { usuarioId: usuario.id, slug } })
      await tx.aceiteContratoAssessor.create({
        data: {
          assessorId: a.id, versao: CONTRATO_ASSESSOR_VERSAO, assinanteNome: b.nome, assinanteEmail: email,
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
      const pre = await criarPreapproval({ reason: 'ZAIEZE — Assessor(a) de Moda', valor, email, redeSlug: slug, backUrl: urlLogin, diasGratis })
      await prisma.assinaturaAssessor.update({ where: { assessorId: assessor.id }, data: { mpPreapprovalId: pre.id } })
      if (promo) await consumirCodigo(promo.id)
      return reply.code(201).send({ simulado: false, slug, initPoint: pre.initPoint })
    } catch (e) {
      // Desfaz o provisionamento se o Mercado Pago falhar (cascade: assessor + assinatura + aceite)
      await prisma.usuario.delete({ where: { id: assessor.usuarioId } })
      throw e
    }
  })

  // ─────────── Público (sem auth) — vitrine no subdomínio <slug>.zaieze.com ───────────
  app.get('/publico/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const assessor = await prisma.assessor.findUnique({
      where: { slug },
      select: {
        slug: true, bio: true, whatsapp: true, instagram: true, site: true,
        usuario: { select: { nome: true, fotoUrl: true, ativo: true } },
        marcas: { where: { ativo: true }, orderBy: { ordem: 'asc' }, select: marcaSelect },
      },
    })
    if (!assessor || !assessor.usuario.ativo) return reply.code(404).send({ erro: 'Página não encontrada' })
    return {
      nome: assessor.usuario.nome,
      fotoUrl: assessor.usuario.fotoUrl,
      bio: assessor.bio,
      whatsapp: assessor.whatsapp,
      instagram: assessor.instagram,
      site: assessor.site,
      marcas: assessor.marcas.map(serializarMarca),
    }
  })

  // Catálogo em PDF (1 página por marca ativa, links clicáveis) — mesma fonte de dados da
  // vitrine web; ela baixa no painel e manda pelo WhatsApp, e também fica linkado na vitrine.
  app.get('/publico/:slug/catalogo.pdf', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const assessor = await prisma.assessor.findUnique({
      where: { slug },
      select: {
        bio: true, whatsapp: true, instagram: true, site: true,
        usuario: { select: { nome: true, ativo: true } },
        marcas: { where: { ativo: true }, orderBy: { ordem: 'asc' }, select: marcaSelect },
      },
    })
    if (!assessor || !assessor.usuario.ativo) return reply.code(404).send({ erro: 'Página não encontrada' })
    const buffer = await gerarCatalogoPdf(
      { nome: assessor.usuario.nome, bio: assessor.bio, whatsapp: assessor.whatsapp, instagram: assessor.instagram, site: assessor.site },
      assessor.marcas,
    )
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="catalogo-${slug}.pdf"`)
    return reply.send(buffer)
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
    return {
      slug: assessor.slug, bio: assessor.bio, whatsapp: assessor.whatsapp, instagram: assessor.instagram, site: assessor.site,
    }
  })

  const perfilSchema = z.object({
    bio: z.string().trim().max(600).nullable().optional(),
    whatsapp: z.string().trim().max(30).nullable().optional(),
    instagram: z.string().trim().max(200).nullable().optional(),
    site: z.string().trim().max(200).nullable().optional(),
  })
  app.patch('/minha', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const b = perfilSchema.parse(request.body)
    return prisma.assessor.update({ where: { id: assessor.id }, data: b })
  })

  // ─────────── Marcas representadas ───────────
  app.get('/minha/marcas', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const marcas = await prisma.assessorMarca.findMany({ where: { assessorId: assessor.id }, orderBy: { ordem: 'asc' }, select: marcaSelect })
    return marcas.map(serializarMarca)
  })

  const marcaSchema = z.object({
    nome: z.string().trim().min(1).max(120),
    logoUrl: z.string().trim().max(500).nullable().optional(),
    descricao: z.string().trim().max(2000).nullable().optional(),
    formasPagamento: z.string().trim().max(1000).nullable().optional(),
    modoEnvio: z.string().trim().max(1000).nullable().optional(),
    condicoesCompra: z.string().trim().max(1000).nullable().optional(),
    tamanhos: z.string().trim().max(200).nullable().optional(),
    valores: z.string().trim().max(200).nullable().optional(),
    endereco: z.string().trim().max(500).nullable().optional(),
    cnpj: z.string().trim().max(30).nullable().optional(),
    instagram: z.string().trim().max(200).nullable().optional(),
    facebook: z.string().trim().max(200).nullable().optional(),
    whatsapp: z.string().trim().max(30).nullable().optional(),
    telegram: z.string().trim().max(200).nullable().optional(),
    tiktok: z.string().trim().max(200).nullable().optional(),
    site: z.string().trim().max(200).nullable().optional(),
    percentualComissaoSugerido: z.coerce.number().positive().max(100).nullable().optional(),
    ativo: z.boolean().optional(),
  })

  app.post('/minha/marcas', protegido, async (request) => {
    const assessor = await assessorDoUsuario(request.user.sub)
    const b = marcaSchema.parse(request.body)
    const maiorOrdem = await prisma.assessorMarca.aggregate({ where: { assessorId: assessor.id }, _max: { ordem: true } })
    const marca = await prisma.assessorMarca.create({
      data: { ...b, assessorId: assessor.id, ordem: (maiorOrdem._max.ordem ?? -1) + 1 },
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

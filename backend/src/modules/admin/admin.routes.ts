import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { aplicarReajuste, definirPrecos, listarPlanos, listarReajustes, percentualDescontoAnual, definirDescontoAnual } from '../planos/planos.service'
import { listarAddons, definirPrecoAddon } from '../addons/addon.service'
import { normalizarCodigo } from '../promo/promo.service'
import { cancelarPreapproval, mpConfigurado } from '../assinaturas/mercadopago.service'
import { excluirDoR2 } from '../midia/r2.service'
import { removerUploadLocal } from '../midia/limpeza.service'
import { gerarSenhaProvisoria } from '../auth/senha-provisoria'
import { criarAfiliado } from '../afiliados/afiliado.service'
import { criarAssessor, slugDisponivel, normalizarSlug } from '../assessores/assessor.service'

const num = (v: unknown) => Number(v ?? 0)

/** Painel do Admin (operador do SaaS — SUPER_ADMIN): preços, reajuste IGP-M, redes e códigos promocionais. */
export async function adminRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authorize('SUPER_ADMIN'))

  // Solicitações de "esqueci minha senha" de GESTORES sem WhatsApp cadastrado — as dos demais
  // papéis (equipe da marca) caem para o GESTOR da própria rede (ver /usuarios/solicitacoes-senha).
  app.get('/solicitacoes-senha', async () => ({
    solicitacoes: await prisma.solicitacaoSenha.findMany({
      where: { atendidaEm: null, usuario: { role: 'GESTOR' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, usuario: { select: { id: true, nome: true, email: true } } },
    }),
  }))

  app.post('/solicitacoes-senha/:id/gerar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const solicitacao = await prisma.solicitacaoSenha.findFirst({
      where: { id, atendidaEm: null, usuario: { role: 'GESTOR' } },
      select: { id: true, usuarioId: true },
    })
    if (!solicitacao) return reply.code(404).send({ erro: 'Solicitação não encontrada' })

    const senha = gerarSenhaProvisoria()
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: solicitacao.usuarioId }, data: { senhaHash: await bcrypt.hash(senha, 10) } }),
      prisma.solicitacaoSenha.update({ where: { id: solicitacao.id }, data: { atendidaEm: new Date() } }),
    ])
    return { senha }
  })

  // ── Planos & Preços ──
  app.get('/planos', async () => ({ planos: await listarPlanos() }))

  const precosSchema = z.object({
    precos: z.record(z.enum(['START', 'PRO', 'ELITE']), z.coerce.number().nonnegative()),
  })
  app.put('/planos', async (request) => {
    const { precos } = precosSchema.parse(request.body)
    await definirPrecos(precos)
    return { ok: true, planos: await listarPlanos() }
  })

  // ── Add-ons (assinaturas à parte dos planos, ex.: Provador Virtual) ──
  app.get('/addons', async () => ({ addons: await listarAddons() }))

  const precoAddonSchema = z.object({ preco: z.coerce.number().nonnegative() })
  app.put('/addons/:tipo/preco', async (request) => {
    const { tipo } = z.object({ tipo: z.enum(['PROVADOR']) }).parse(request.params)
    const { preco } = precoAddonSchema.parse(request.body)
    await definirPrecoAddon(tipo, preco)
    return { ok: true, addons: await listarAddons() }
  })

  // Desconto do plano ANUAL (a priori 10%) — vale para novas assinaturas/trocas de periodicidade.
  app.get('/config-assinatura', async () => ({ percentualDescontoAnual: await percentualDescontoAnual() }))
  app.put('/config-assinatura', async (request) => {
    const { percentualDescontoAnual: pct } = z.object({ percentualDescontoAnual: z.coerce.number().min(0).max(90) }).parse(request.body)
    await definirDescontoAnual(pct)
    return { percentualDescontoAnual: pct }
  })

  // ── Reajuste por inflação (IGP-M acumulado) — só novas assinaturas/trocas ──
  const reajusteSchema = z.object({ percentual: z.coerce.number().gt(0).max(100) })
  app.post('/reajuste', async (request) => {
    const { percentual } = reajusteSchema.parse(request.body)
    const detalhe = await aplicarReajuste(percentual, 'IGP-M', request.user.nome)
    return { ok: true, detalhe, planos: await listarPlanos() }
  })
  app.get('/reajustes', async () => ({ reajustes: await listarReajustes() }))

  // ── Tabela do IGP-M (acumulado 12m por mês) — base do reajuste anual por aniversário ──
  app.get('/igpm', async () => ({
    indices: await prisma.indiceIgpm.findMany({ orderBy: [{ ano: 'desc' }, { mes: 'desc' }] }),
  }))

  const igpmSchema = z.object({
    ano: z.coerce.number().int().min(2020).max(2100),
    mes: z.coerce.number().int().min(1).max(12),
    percentual: z.coerce.number().min(-50).max(100),
  })
  // Lança/atualiza a taxa de um mês (idempotente por ano+mês).
  app.put('/igpm', async (request) => {
    const b = igpmSchema.parse(request.body)
    const indice = await prisma.indiceIgpm.upsert({
      where: { ano_mes: { ano: b.ano, mes: b.mes } },
      create: { ano: b.ano, mes: b.mes, percentual: b.percentual, registradoPor: request.user.nome },
      update: { percentual: b.percentual, registradoPor: request.user.nome },
    })
    return { ok: true, indice }
  })
  app.delete('/igpm/:ano/:mes', async (request) => {
    const { ano, mes } = request.params as { ano: string; mes: string }
    await prisma.indiceIgpm.deleteMany({ where: { ano: Number(ano), mes: Number(mes) } })
    return { ok: true }
  })

  // Histórico dos reajustes aplicados por aniversário (auditoria).
  app.get('/reajustes-aniversario', async () => ({
    reajustes: await prisma.reajusteAssinatura.findMany({ orderBy: { aplicadoEm: 'desc' }, take: 100 }),
  }))

  // ── Visão multi-tenant: todas as redes (clientes do SaaS) ──
  app.get('/redes', async () => {
    const redes = await prisma.rede.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        assinatura: { select: { plano: true, status: true, valor: true, cicloFimEm: true, cancelamentoSolicitadoEm: true, simulada: true } },
        _count: { select: { lojas: true, usuarios: true } },
      },
    })
    return {
      redes: redes.map((r) => ({
        id: r.id, nome: r.nome, slug: r.slug, plano: r.plano, ativo: r.ativo, criadoEm: r.createdAt,
        lojas: r._count.lojas, usuarios: r._count.usuarios,
        assinatura: r.assinatura
          ? {
              plano: r.assinatura.plano, status: r.assinatura.status, valor: num(r.assinatura.valor),
              cicloFimEm: r.assinatura.cicloFimEm, cancelamentoAgendado: Boolean(r.assinatura.cancelamentoSolicitadoEm),
              simulada: r.assinatura.simulada,
            }
          : null,
      })),
    }
  })

  // Ativa uma rede em modo CORTESIA (grátis): destrava assinaturas presas em PENDENTE — ex.: adesão
  // que não concluiu o pagamento, ou cupom que deixou o valor zerado. Marca simulada/valor 0 e
  // cancela (best-effort) qualquer preapproval pendente no Mercado Pago.
  app.post('/redes/:id/ativar-cortesia', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ codigoPromo: z.string().trim().optional() }).parse(request.body ?? {})
    const rede = await prisma.rede.findUnique({ where: { id }, include: { assinatura: true } })
    if (!rede) return reply.code(404).send({ erro: 'Rede não encontrada' })

    // Ativação manual não passa pelo checkout normal, então o cupom (se o gestor combinou um)
    // não é consumido sozinho — o admin informa aqui para o contador de usos refletir a realidade.
    let promo = null
    if (body.codigoPromo) {
      promo = await prisma.codigoPromocional.findUnique({ where: { codigo: normalizarCodigo(body.codigoPromo) } })
      if (!promo) return reply.code(422).send({ erro: 'Código promocional não encontrado' })
    }

    if (rede.assinatura?.mpPreapprovalId && mpConfigurado()) {
      await cancelarPreapproval(rede.assinatura.mpPreapprovalId).catch(() => { /* pendente/sem efeito */ })
    }

    await prisma.$transaction([
      prisma.rede.update({ where: { id }, data: { ativo: true } }),
      ...(rede.assinatura
        ? [prisma.assinatura.update({
            where: { redeId: id },
            data: {
              status: 'ATIVA', simulada: true, valor: 0, mpPreapprovalId: null,
              cancelamentoSolicitadoEm: null, cancelamentoOrigem: null,
              cicloFimEm: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            },
          })]
        : []),
      ...(promo ? [prisma.codigoPromocional.update({ where: { id: promo.id }, data: { usos: { increment: 1 } } })] : []),
    ])
    return { ok: true }
  })

  // Exclui uma rede DEFINITIVAMENTE (loja de teste, por ex.) — como se nunca tivesse existido.
  // Cancela qualquer cobrança futura no Mercado Pago, apaga as mídias no R2/local e então apaga
  // a rede: o schema cascateia (lojas, usuários, clientes, produtos, vendas, mensagens etc.).
  app.delete('/redes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ confirmarNome: z.string() }).parse(request.body)
    const rede = await prisma.rede.findUnique({ where: { id }, include: { assinatura: true } })
    if (!rede) return reply.code(404).send({ erro: 'Rede não encontrada' })
    if (body.confirmarNome.trim() !== rede.nome) {
      return reply.code(422).send({ erro: 'O nome digitado não confere com o nome da marca. Nada foi excluído.' })
    }

    if (rede.assinatura?.mpPreapprovalId && mpConfigurado()) {
      await cancelarPreapproval(rede.assinatura.mpPreapprovalId).catch(() => { /* pendente/sem efeito */ })
    }

    const lojas = await prisma.loja.findMany({ where: { redeId: id }, select: { id: true } })
    const lojaIds = lojas.map((l) => l.id)
    const [usuarios, produtos, campanhasModelo, mensagens, posts] = await Promise.all([
      prisma.usuario.findMany({ where: { OR: [{ redeId: id }, { lojaId: { in: lojaIds } }] }, select: { fotoUrl: true } }),
      prisma.produto.findMany({ where: { redeId: id }, select: { fotos: true, videos: true } }),
      prisma.campanhaModelo.findMany({ where: { redeId: id }, select: { imagemUrl: true } }),
      prisma.mensagemWhatsapp.findMany({ where: { lojaId: { in: lojaIds } }, select: { midiaUrl: true } }),
      prisma.postMural.findMany({ where: { lojaId: { in: lojaIds } }, select: { imagemUrl: true } }),
    ])
    const urls = [
      rede.logoUrl, rede.bannerUrl,
      ...usuarios.map((u) => u.fotoUrl),
      ...produtos.flatMap((p) => [...p.fotos, ...p.videos]),
      ...campanhasModelo.map((c) => c.imagemUrl),
      ...mensagens.map((m) => m.midiaUrl),
      ...posts.map((p) => p.imagemUrl),
    ].filter((u): u is string => !!u)
    await excluirDoR2(urls).catch(() => { /* best-effort — não bloqueia a exclusão */ })
    await Promise.all(urls.map((u) => removerUploadLocal(u)))

    await prisma.rede.delete({ where: { id } })
    return { ok: true }
  })

  // ── Códigos promocionais ──
  app.get('/promos', async () => ({
    promos: await prisma.codigoPromocional.findMany({ orderBy: { createdAt: 'desc' } }),
  }))

  const promoSchema = z.object({
    codigo: z.string().min(2).max(40),
    tipo: z.enum(['DIAS_GRATIS', 'PERCENTUAL']),
    aplicaA: z.enum(['REDE', 'ASSESSOR']).default('REDE'), // a qual assinatura o cupom vale
    plano: z.enum(['START', 'PRO', 'ELITE']).nullish(), // fixa o plano da oferta — só faz sentido com aplicaA=REDE
    dias: z.coerce.number().int().positive().optional(),
    percentual: z.coerce.number().positive().max(100).optional(),
    descricao: z.string().max(140).optional(),
    validadeAte: z.string().optional(),
    maxUsos: z.coerce.number().int().positive().optional(),
  })
  app.post('/promos', async (request, reply) => {
    const b = promoSchema.parse(request.body)
    if (b.tipo === 'DIAS_GRATIS' && !b.dias) return reply.code(422).send({ erro: 'Informe os dias grátis.' })
    if (b.tipo === 'PERCENTUAL' && !b.percentual) return reply.code(422).send({ erro: 'Informe o percentual de desconto.' })
    const codigo = normalizarCodigo(b.codigo)
    if (await prisma.codigoPromocional.findUnique({ where: { codigo } })) {
      return reply.code(409).send({ erro: 'Já existe um código com esse nome.' })
    }
    const promo = await prisma.codigoPromocional.create({
      data: {
        codigo, tipo: b.tipo, aplicaA: b.aplicaA,
        plano: b.aplicaA === 'REDE' ? b.plano ?? null : null,
        dias: b.tipo === 'DIAS_GRATIS' ? b.dias : null,
        percentual: b.tipo === 'PERCENTUAL' ? b.percentual : null,
        descricao: b.descricao ?? null,
        validadeAte: b.validadeAte ? new Date(b.validadeAte) : null,
        maxUsos: b.maxUsos ?? null,
      },
    })
    return reply.code(201).send({ promo })
  })

  app.patch('/promos/:id', async (request) => {
    const { id } = request.params as { id: string }
    const b = z.object({ ativo: z.boolean().optional(), maxUsos: z.coerce.number().int().positive().nullable().optional(), validadeAte: z.string().nullable().optional() }).parse(request.body)
    return prisma.codigoPromocional.update({
      where: { id },
      data: {
        ...(b.ativo !== undefined ? { ativo: b.ativo } : {}),
        ...(b.maxUsos !== undefined ? { maxUsos: b.maxUsos } : {}),
        ...(b.validadeAte !== undefined ? { validadeAte: b.validadeAte ? new Date(b.validadeAte) : null } : {}),
      },
    })
  })

  app.delete('/promos/:id', async (request) => {
    const { id } = request.params as { id: string }
    await prisma.codigoPromocional.delete({ where: { id } })
    return { ok: true }
  })

  // ── Programa de Afiliados ──
  app.get('/afiliados', async () => {
    const afiliados = await prisma.afiliado.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        usuario: { select: { id: true, nome: true, email: true, telefone: true, ativo: true } },
        _count: { select: { redesIndicadas: true } },
      },
    })
    const somas = await prisma.comissaoAfiliado.groupBy({
      by: ['afiliadoId', 'status'],
      _sum: { valorComissao: true },
    })
    return {
      afiliados: afiliados.map((a) => {
        const pendente = somas.find((s) => s.afiliadoId === a.id && s.status === 'PENDENTE')?._sum.valorComissao
        const paga = somas.find((s) => s.afiliadoId === a.id && s.status === 'PAGA')?._sum.valorComissao
        return {
          id: a.id, codigo: a.codigo, percentualComissao: a.percentualComissao ? num(a.percentualComissao) : null,
          cliques: a.cliques, redesIndicadas: a._count.redesIndicadas,
          pendente: num(pendente), paga: num(paga),
          taxStatus: a.taxStatus, statusFiscal: a.statusFiscal, statusFiscalVerificadoEm: a.statusFiscalVerificadoEm,
          usuario: a.usuario,
        }
      }),
    }
  })

  const criarAfiliadoSchema = z.object({
    nome: z.string().min(2),
    email: z.string().email(),
    telefone: z.string().trim().optional(),
    percentualComissao: z.coerce.number().positive().max(100).optional(),
    taxStatus: z.enum(['PF', 'PJ', 'MEI']).optional(),
  })
  app.post('/afiliados', async (request, reply) => {
    const b = criarAfiliadoSchema.parse(request.body)
    const { afiliado, senha } = await criarAfiliado(b)
    return reply.code(201).send({ afiliado, senha })
  })

  const editarAfiliadoSchema = z.object({
    nome: z.string().min(2).optional(),
    telefone: z.string().trim().nullable().optional(),
    percentualComissao: z.coerce.number().positive().max(100).nullable().optional(),
    ativo: z.boolean().optional(),
    taxStatus: z.enum(['PF', 'PJ', 'MEI']).nullable().optional(),
    // Saúde fiscal (compliance LC 214/2025): verificação do admin, não autodeclarada pelo afiliado.
    statusFiscal: z.enum(['EM_DIA', 'IRREGULAR', 'NAO_VERIFICADO']).optional(),
  })
  app.patch('/afiliados/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = editarAfiliadoSchema.parse(request.body)
    const afiliado = await prisma.afiliado.findUnique({ where: { id } })
    if (!afiliado) return reply.code(404).send({ erro: 'Afiliado não encontrado' })

    await prisma.$transaction([
      prisma.afiliado.update({
        where: { id },
        data: {
          ...(b.percentualComissao !== undefined ? { percentualComissao: b.percentualComissao } : {}),
          ...(b.taxStatus !== undefined ? { taxStatus: b.taxStatus } : {}),
          ...(b.statusFiscal !== undefined ? { statusFiscal: b.statusFiscal, statusFiscalVerificadoEm: new Date() } : {}),
        },
      }),
      prisma.usuario.update({
        where: { id: afiliado.usuarioId },
        data: {
          ...(b.nome !== undefined ? { nome: b.nome } : {}),
          ...(b.telefone !== undefined ? { telefone: b.telefone } : {}),
          ...(b.ativo !== undefined ? { ativo: b.ativo } : {}),
        },
      }),
    ])
    return { ok: true }
  })

  app.get('/afiliados/config', async () => {
    const config = await prisma.configAfiliados.upsert({
      where: { id: 1 }, create: { id: 1 }, update: {},
    })
    return { percentualPadrao: num(config.percentualPadrao) }
  })
  app.put('/afiliados/config', async (request) => {
    const { percentualPadrao } = z.object({ percentualPadrao: z.coerce.number().positive().max(100) }).parse(request.body)
    const config = await prisma.configAfiliados.upsert({
      where: { id: 1 }, create: { id: 1, percentualPadrao }, update: { percentualPadrao },
    })
    return { percentualPadrao: num(config.percentualPadrao) }
  })

  app.get('/afiliados/comissoes', async (request) => {
    const { status, afiliadoId } = request.query as { status?: string; afiliadoId?: string }
    const comissoes = await prisma.comissaoAfiliado.findMany({
      where: {
        ...(status === 'PENDENTE' || status === 'PAGA' ? { status } : {}),
        ...(afiliadoId ? { afiliadoId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { afiliado: { select: { codigo: true, statusFiscal: true, usuario: { select: { nome: true } } } } },
    })
    return {
      comissoes: comissoes.map((c) => ({
        id: c.id, redeNome: c.redeNome, cicloEm: c.cicloEm,
        valorBaseAssinatura: num(c.valorBaseAssinatura), percentualComissao: num(c.percentualComissao),
        valorComissao: num(c.valorComissao), status: c.status, pagoEm: c.pagoEm,
        valorRetencaoFiscal: c.valorRetencaoFiscal != null ? num(c.valorRetencaoFiscal) : null,
        afiliadoCodigo: c.afiliado.codigo, afiliadoNome: c.afiliado.usuario.nome, afiliadoStatusFiscal: c.afiliado.statusFiscal,
      })),
    }
  })

  const pagarComissaoSchema = z.object({
    observacaoPagamento: z.string().max(300).optional(),
    // Retenção de IBS/CBS registrada no repasse (informativo — sem cálculo automático de alíquota).
    valorRetencaoFiscal: z.coerce.number().nonnegative().optional(),
  })
  app.post('/afiliados/comissoes/:id/pagar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = pagarComissaoSchema.parse(request.body ?? {})
    const comissao = await prisma.comissaoAfiliado.findUnique({ where: { id } })
    if (!comissao) return reply.code(404).send({ erro: 'Comissão não encontrada' })
    if (comissao.status === 'PAGA') return reply.code(422).send({ erro: 'Esta comissão já está marcada como paga.' })
    return prisma.comissaoAfiliado.update({
      where: { id },
      data: {
        status: 'PAGA', pagoEm: new Date(), pagoPorId: request.user.sub,
        observacaoPagamento: b.observacaoPagamento ?? null,
        ...(b.valorRetencaoFiscal !== undefined ? { valorRetencaoFiscal: b.valorRetencaoFiscal } : {}),
      },
    })
  })

  // ── Assessores de Moda (subdomínio próprio, representam marcas dentro/fora do ZAIEZE) ──
  app.get('/assessores', async () => {
    const assessores = await prisma.assessor.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        usuario: { select: { id: true, nome: true, email: true, telefone: true, ativo: true } },
        assinatura: { select: { status: true, simulada: true, valor: true } },
        _count: { select: { marcas: true, vendas: true } },
      },
    })
    return {
      assessores: assessores.map((a) => ({
        id: a.id, slug: a.slug, marcas: a._count.marcas, vendas: a._count.vendas, usuario: a.usuario,
        assinatura: a.assinatura ? { status: a.assinatura.status, simulada: a.assinatura.simulada, valor: num(a.assinatura.valor) } : null,
      })),
    }
  })

  const criarAssessorSchema = z.object({
    nome: z.string().min(2),
    email: z.string().email(),
    telefone: z.string().trim().optional(),
    slug: z.string().trim().min(2).max(60),
  })
  app.post('/assessores', async (request, reply) => {
    const b = criarAssessorSchema.parse(request.body)
    const { assessor, senha } = await criarAssessor(b)
    return reply.code(201).send({ assessor, senha })
  })

  app.get('/assessores/slug-disponivel', async (request) => {
    const { slug } = request.query as { slug?: string }
    const normalizado = normalizarSlug(slug ?? '')
    return { slug: normalizado, disponivel: normalizado.length >= 2 && (await slugDisponivel(normalizado)) }
  })

  const editarAssessorSchema = z.object({
    nome: z.string().min(2).optional(),
    telefone: z.string().trim().nullable().optional(),
    ativo: z.boolean().optional(),
  })
  app.patch('/assessores/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = editarAssessorSchema.parse(request.body)
    const assessor = await prisma.assessor.findUnique({ where: { id } })
    if (!assessor) return reply.code(404).send({ erro: 'Assessor(a) não encontrado(a)' })
    await prisma.usuario.update({
      where: { id: assessor.usuarioId },
      data: {
        ...(b.nome !== undefined ? { nome: b.nome } : {}),
        ...(b.telefone !== undefined ? { telefone: b.telefone } : {}),
        ...(b.ativo !== undefined ? { ativo: b.ativo } : {}),
      },
    })
    return { ok: true }
  })

  // Preço da assinatura mensal do plano "Assessor(a) de Moda" (página comercial).
  app.get('/assessores/config', async () => {
    const config = await prisma.configAssessores.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
    return { precoMensal: num(config.precoMensal) }
  })
  app.put('/assessores/config', async (request) => {
    const { precoMensal } = z.object({ precoMensal: z.coerce.number().positive() }).parse(request.body)
    const config = await prisma.configAssessores.upsert({ where: { id: 1 }, create: { id: 1, precoMensal }, update: { precoMensal } })
    return { precoMensal: num(config.precoMensal) }
  })
}

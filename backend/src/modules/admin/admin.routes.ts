import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { listarFaixasDesconto, definirFaixaDesconto, removerFaixaDesconto } from '../vendedora-billing/faixa-desconto.service'
import { listarAddons, definirPrecoAddon, definirCotaCreditosAddon } from '../addons/addon.service'
import { precoChatAtendimento, definirPrecoChatAtendimento } from '../chat-atendimento/assinatura-chat-atendimento.service'
import { normalizarCodigo } from '../promo/promo.service'
import { cancelarPreapproval, mpConfigurado } from '../assinaturas/mercadopago.service'
import { excluirDoR2 } from '../midia/r2.service'
import { removerUploadLocal } from '../midia/limpeza.service'
import { gerarSenhaProvisoria } from '../auth/senha-provisoria'
import { criarAfiliado } from '../afiliados/afiliado.service'
import { criarAssessor, slugDisponivel, normalizarSlug } from '../assessores/assessor.service'
import { sincronizarZaiezeLeads } from '../zaiezeleads/zaiezeleads.service'
import { exportarCsv, exportarTxt, exportarXlsx, exportarSql, type LinhaZaiezeLead } from '../zaiezeleads/exportar-zaiezeleads'
import { googlePlacesConfigurado, geocodificar, buscarEmpresas, gerarResultadosSimulados, type EmpresaEncontrada } from '../prospeccao/places.service'

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

  // ── Faixas de desconto por volume de vendedoras (cobrança consolidada por marca — substitui o
  // preço fixo por assento; ver vendedora-billing/faixa-desconto.service.ts) ──
  app.get('/faixas-vendedora', async () => ({ faixas: await listarFaixasDesconto() }))

  const faixaVendedoraSchema = z.object({
    quantidade: z.coerce.number().int().min(1).max(1000),
    valorTotal: z.coerce.number().nonnegative(),
  })
  app.put('/faixas-vendedora', async (request) => {
    const b = faixaVendedoraSchema.parse(request.body)
    const faixa = await definirFaixaDesconto(b.quantidade, b.valorTotal)
    return { ok: true, faixa }
  })
  app.delete('/faixas-vendedora/:quantidade', async (request) => {
    const { quantidade } = request.params as { quantidade: string }
    await removerFaixaDesconto(Number(quantidade))
    return { ok: true }
  })

  // ── Add-ons (assinaturas à parte dos planos, ex.: Provador Virtual) ──
  app.get('/addons', async () => ({ addons: await listarAddons() }))

  const precoAddonSchema = z.object({ preco: z.coerce.number().nonnegative() })
  app.put('/addons/:tipo/preco', async (request) => {
    const { tipo } = z.object({ tipo: z.enum(['PROVADOR', 'VENDEDORA_ZAIEZE', 'ESTOQUE_INTELIGENTE', 'RADAR']) }).parse(request.params)
    const { preco } = precoAddonSchema.parse(request.body)
    await definirPrecoAddon(tipo, preco)
    return { ok: true, addons: await listarAddons() }
  })

  // Cota mensal de créditos de IA Captador — só o add-on RADAR usa isso hoje.
  app.put('/addons/:tipo/cota', async (request) => {
    const { tipo } = z.object({ tipo: z.enum(['RADAR']) }).parse(request.params)
    const { cotaCreditosMes } = z.object({ cotaCreditosMes: z.coerce.number().int().nonnegative() }).parse(request.body)
    await definirCotaCreditosAddon(tipo, cotaCreditosMes)
    return { ok: true, addons: await listarAddons() }
  })

  // Chat de Atendimento: add-on assinado POR VENDEDORA (não por rede), preço próprio.
  app.get('/chat-atendimento-preco', async () => ({ preco: await precoChatAtendimento() }))
  app.put('/chat-atendimento-preco', async (request) => {
    const { preco } = precoAddonSchema.parse(request.body)
    await definirPrecoChatAtendimento(preco)
    return { ok: true, preco: await precoChatAtendimento() }
  })

  // ── Tabela do IGP-M (acumulado 12m por mês) — base do reajuste anual por aniversário do assento ──
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
        assinaturasVendedora: { where: { status: 'ATIVA' }, select: { valor: true, vendedoraId: true } },
        _count: { select: { lojas: true, usuarios: true } },
        usuarios: { where: { role: 'GESTOR' }, select: { id: true, nome: true, email: true, telefone: true }, take: 1 },
      },
    })
    return {
      redes: redes.map((r) => ({
        id: r.id, nome: r.nome, slug: r.slug, ativo: r.ativo, criadoEm: r.createdAt,
        lojas: r._count.lojas, usuarios: r._count.usuarios,
        gestor: r.usuarios[0] ?? null,
        // Assentos de vendedora ATIVOS (pagos ou reservados) e o MRR que eles representam.
        assentos: {
          ativos: r.assinaturasVendedora.length,
          ocupados: r.assinaturasVendedora.filter((a) => a.vendedoraId).length,
          mrr: r.assinaturasVendedora.reduce((s, a) => s + num(a.valor), 0),
        },
      })),
    }
  })

  // Reset PROATIVO da senha do gestor de uma rede — não depende dele ter aberto um pedido de
  // "esqueci minha senha" primeiro (ver /solicitacoes-senha acima, que só atende pedidos já
  // registrados). Útil quando o gestor perdeu acesso a tudo (e-mail e WhatsApp) e não consegue
  // nem abrir o pedido sozinho.
  app.post('/redes/:id/gestor/resetar-senha', async (request, reply) => {
    const { id } = request.params as { id: string }
    const gestor = await prisma.usuario.findFirst({ where: { redeId: id, role: 'GESTOR' }, select: { id: true, nome: true } })
    if (!gestor) return reply.code(404).send({ erro: 'Gestor não encontrado' })
    const senha = gerarSenhaProvisoria()
    await prisma.usuario.update({ where: { id: gestor.id }, data: { senhaHash: await bcrypt.hash(senha, 10) } })
    return { nome: gestor.nome, senha }
  })

  // "Entrar como": o SUPER_ADMIN assume a sessão de outro usuário (qualquer papel/marca) pra
  // suporte/investigação — mesmo formato de token do /auth/login, mas sem checar senha nem os
  // gates de assinatura/rede ativa (o objetivo às vezes é justamente investigar uma conta travada).
  // Fica registrado em ImpersonacaoLog. Não permite virar outro SUPER_ADMIN (evita esconder ações
  // atrás da sessão de outro operador da plataforma).
  app.post('/usuarios/:id/entrar-como', async (request, reply) => {
    const { id } = request.params as { id: string }
    const alvo = await prisma.usuario.findUnique({
      where: { id },
      include: {
        loja: { select: { id: true, nome: true, slug: true, rede: { select: { id: true, nome: true, slug: true } } } },
        rede: { select: { id: true, nome: true, slug: true } },
      },
    })
    if (!alvo) return reply.code(404).send({ erro: 'Usuário não encontrado' })
    if (alvo.role === 'SUPER_ADMIN') return reply.code(403).send({ erro: 'Não é possível entrar como outro super admin' })

    const redeId = alvo.redeId ?? alvo.loja?.rede.id ?? null
    const rede = alvo.rede ?? alvo.loja?.rede ?? null
    const assessor = alvo.role === 'ASSESSORA'
      ? await prisma.assessor.findUnique({ where: { usuarioId: alvo.id }, select: { slug: true } })
      : null

    await prisma.impersonacaoLog.create({
      data: {
        operadorId: request.user.sub, operadorNome: request.user.nome, operadorRole: request.user.role,
        usuarioAlvoId: alvo.id, usuarioAlvoNome: alvo.nome, usuarioAlvoRole: alvo.role,
      },
    })

    // Expira mais rápido que um login normal (12h) — sessão de suporte, não de trabalho do dia.
    const token = app.jwt.sign(
      { sub: alvo.id, redeId, lojaId: alvo.lojaId, role: alvo.role, nome: alvo.nome },
      { expiresIn: '2h' },
    )
    return {
      token,
      // slug pra montar a URL de destino (subdomínio) no front — não faz parte do formato
      // padrão de `usuario` salvo no localStorage, só usado no momento do redirect.
      redeSlug: rede?.slug ?? null,
      usuario: {
        id: alvo.id, nome: alvo.nome, email: alvo.email, role: alvo.role, fotoUrl: alvo.fotoUrl, idioma: alvo.idioma,
        rede: rede ? { id: rede.id, nome: rede.nome } : null,
        loja: alvo.loja ? { id: alvo.loja.id, nome: alvo.loja.nome, slug: alvo.loja.slug } : null,
        assessor: assessor?.slug ? { slug: assessor.slug } : null,
      },
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
    const [usuarios, produtos, campanhasModelo, mensagens, posts, mensagensInstagram, vendas, looksProvador] = await Promise.all([
      prisma.usuario.findMany({ where: { OR: [{ redeId: id }, { lojaId: { in: lojaIds } }] }, select: { fotoUrl: true } }),
      prisma.produto.findMany({ where: { redeId: id }, select: { fotos: true, videos: true } }),
      prisma.campanhaModelo.findMany({ where: { redeId: id }, select: { imagemUrl: true } }),
      prisma.mensagemWhatsapp.findMany({ where: { lojaId: { in: lojaIds } }, select: { midiaUrl: true } }),
      prisma.postMural.findMany({ where: { lojaId: { in: lojaIds } }, select: { imagemUrl: true } }),
      prisma.mensagemInstagram.findMany({ where: { lojaId: { in: lojaIds } }, select: { midiaUrl: true } }),
      prisma.venda.findMany({ where: { lojaId: { in: lojaIds } }, select: { comprovantePagamentoUrl: true } }),
      prisma.lookProvador.findMany({ where: { redeId: id }, select: { fotoClienteUrl: true, fotoUrl: true, videoUrl: true } }),
    ])
    const urls = [
      rede.logoUrl, rede.bannerUrl,
      ...usuarios.map((u) => u.fotoUrl),
      ...produtos.flatMap((p) => [...p.fotos, ...p.videos]),
      ...campanhasModelo.map((c) => c.imagemUrl),
      ...mensagens.map((m) => m.midiaUrl),
      ...posts.map((p) => p.imagemUrl),
      ...mensagensInstagram.map((m) => m.midiaUrl),
      ...vendas.map((v) => v.comprovantePagamentoUrl),
      ...looksProvador.flatMap((l) => [l.fotoClienteUrl, l.fotoUrl, l.videoUrl]),
    ].filter((u): u is string => !!u)
    await excluirDoR2(urls).catch(() => { /* best-effort — não bloqueia a exclusão */ })
    await Promise.all(urls.map((u) => removerUploadLocal(u)))

    await prisma.rede.delete({ where: { id } })
    return { ok: true }
  })

  // ── Gestores Comerciais do Sistema (login próprio, mesmas atribuições do SUPER_ADMIN — só o
  // rótulo exibido muda: "Gestor Comercial do Sistema" em vez de "Gestor Administrador do
  // Sistema"). Não é um papel novo no banco — é o mesmo Role.SUPER_ADMIN com `comercial:true`,
  // pra não precisar replicar toda checagem de permissão que hoje só olha SUPER_ADMIN. ──
  app.get('/gestores-comerciais', async () => ({
    gestores: await prisma.usuario.findMany({
      where: { role: 'SUPER_ADMIN', comercial: true },
      orderBy: { createdAt: 'desc' },
      select: { id: true, nome: true, email: true, telefone: true, ativo: true, createdAt: true },
    }),
  }))

  const criarGestorComercialSchema = z.object({
    nome: z.string().min(2),
    email: z.string().email(),
    telefone: z.string().trim().optional(),
  })
  app.post('/gestores-comerciais', async (request, reply) => {
    if (request.user.comercial) return reply.code(403).send({ erro: 'Só o Gestor Administrador do Sistema pode criar gestores comerciais.' })
    const b = criarGestorComercialSchema.parse(request.body)
    const email = b.email.toLowerCase()
    if (await prisma.usuario.findUnique({ where: { email } })) {
      return reply.code(409).send({ erro: 'Já existe uma conta com este e-mail.' })
    }
    const senha = gerarSenhaProvisoria()
    const usuario = await prisma.usuario.create({
      data: { nome: b.nome, email, senhaHash: await bcrypt.hash(senha, 10), role: 'SUPER_ADMIN', comercial: true, telefone: b.telefone ?? null },
      select: { id: true, nome: true, email: true, telefone: true, ativo: true, createdAt: true },
    })
    return reply.code(201).send({ usuario, senha })
  })

  app.patch('/gestores-comerciais/:id', async (request, reply) => {
    if (request.user.comercial) return reply.code(403).send({ erro: 'Só o Gestor Administrador do Sistema pode gerenciar gestores comerciais.' })
    const { id } = request.params as { id: string }
    const { ativo } = z.object({ ativo: z.boolean() }).parse(request.body)
    const alvo = await prisma.usuario.findFirst({ where: { id, role: 'SUPER_ADMIN', comercial: true } })
    if (!alvo) return reply.code(404).send({ erro: 'Gestor comercial não encontrado' })
    await prisma.usuario.update({ where: { id }, data: { ativo } })
    return { ok: true }
  })

  app.post('/gestores-comerciais/:id/resetar-senha', async (request, reply) => {
    if (request.user.comercial) return reply.code(403).send({ erro: 'Só o Gestor Administrador do Sistema pode gerenciar gestores comerciais.' })
    const { id } = request.params as { id: string }
    const alvo = await prisma.usuario.findFirst({ where: { id, role: 'SUPER_ADMIN', comercial: true } })
    if (!alvo) return reply.code(404).send({ erro: 'Gestor comercial não encontrado' })
    const senha = gerarSenhaProvisoria()
    await prisma.usuario.update({ where: { id }, data: { senhaHash: await bcrypt.hash(senha, 10) } })
    return { nome: alvo.nome, senha }
  })

  // ── Captador Leads Zaieze (prospecção de empresas novas via Google Places, fora do SaaS) ──
  const buscaProspeccaoSchema = z.object({
    segmento: z.string().min(2),
    cidade: z.string().min(2),
    uf: z.string().length(2),
    raioKm: z.coerce.number().int().positive().optional(),
    tipoEmpresa: z.string().trim().optional(),
    perfilIdeal: z.string().trim().optional(),
    quantidade: z.coerce.number().int().positive().max(20),
  })
  app.post('/prospeccao/buscas', async (request, reply) => {
    const b = buscaProspeccaoSchema.parse(request.body)
    const uf = b.uf.toUpperCase()

    const simulada = !googlePlacesConfigurado()
    let empresas: EmpresaEncontrada[]
    if (simulada) {
      empresas = gerarResultadosSimulados({ segmento: b.segmento, cidade: b.cidade, uf, quantidade: b.quantidade })
    } else {
      const ponto = await geocodificar(b.cidade, uf)
      if (!ponto) return reply.code(422).send({ erro: 'Não foi possível localizar essa cidade/UF.' })
      empresas = await buscarEmpresas({ segmento: b.segmento, tipoEmpresa: b.tipoEmpresa, ponto, raioKm: b.raioKm, quantidade: b.quantidade })
    }

    const busca = await prisma.prospeccaoBusca.create({
      data: {
        criadoPorId: request.user.sub, segmento: b.segmento, cidade: b.cidade, uf,
        raioKm: b.raioKm ?? null, tipoEmpresa: b.tipoEmpresa ?? null, perfilIdeal: b.perfilIdeal ?? null,
        quantidade: b.quantidade, simulada,
        empresas: { create: empresas.map((e) => ({ ...e, horarioFuncionamento: e.horarioFuncionamento ?? undefined })) },
      },
      include: { empresas: true },
    })
    return reply.code(201).send(busca)
  })

  app.get('/prospeccao/buscas', async () => ({
    buscas: await prisma.prospeccaoBusca.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { empresas: true } }, criadoPor: { select: { nome: true } } },
    }),
  }))

  app.get('/prospeccao/buscas/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const busca = await prisma.prospeccaoBusca.findUnique({ where: { id }, include: { empresas: { orderBy: { createdAt: 'asc' } } } })
    if (!busca) return reply.code(404).send({ erro: 'Busca não encontrada' })
    return busca
  })

  // ── Códigos promocionais ──
  app.get('/promos', async () => ({
    promos: await prisma.codigoPromocional.findMany({ orderBy: { createdAt: 'desc' } }),
  }))

  const promoSchema = z.object({
    codigo: z.string().min(2).max(40),
    tipo: z.enum(['DIAS_GRATIS', 'PERCENTUAL', 'VALOR_FIXO']),
    aplicaA: z.enum(['VENDEDORA', 'ASSESSOR']).default('VENDEDORA'), // a qual assinatura o cupom vale
    dias: z.coerce.number().int().positive().optional(),
    percentual: z.coerce.number().positive().max(100).optional(),
    valorFixo: z.coerce.number().positive().optional(),
    // Só pra PERCENTUAL/VALOR_FIXO: nº de ciclos (meses) com desconto antes de reverter ao preço
    // cheio automaticamente. Vazio = desconto permanente enquanto o assento existir.
    duracaoCiclos: z.coerce.number().int().positive().optional(),
    descricao: z.string().max(140).optional(),
    validadeAte: z.string().optional(),
    // Também funciona como "limite por marca": o gestor da marca é quem distribui o código, então
    // maxUsos = N restringe o desconto a N assentos daquela marca na prática.
    maxUsos: z.coerce.number().int().positive().optional(),
  })
  app.post('/promos', async (request, reply) => {
    const b = promoSchema.parse(request.body)
    if (b.tipo === 'DIAS_GRATIS' && !b.dias) return reply.code(422).send({ erro: 'Informe os dias grátis.' })
    if (b.tipo === 'PERCENTUAL' && !b.percentual) return reply.code(422).send({ erro: 'Informe o percentual de desconto.' })
    if (b.tipo === 'VALOR_FIXO' && !b.valorFixo) return reply.code(422).send({ erro: 'Informe o valor fixo de desconto.' })
    const codigo = normalizarCodigo(b.codigo)
    if (await prisma.codigoPromocional.findUnique({ where: { codigo } })) {
      return reply.code(409).send({ erro: 'Já existe um código com esse nome.' })
    }
    const promo = await prisma.codigoPromocional.create({
      data: {
        codigo, tipo: b.tipo, aplicaA: b.aplicaA,
        dias: b.tipo === 'DIAS_GRATIS' ? b.dias : null,
        percentual: b.tipo === 'PERCENTUAL' ? b.percentual : null,
        valorFixo: b.tipo === 'VALOR_FIXO' ? b.valorFixo : null,
        duracaoCiclos: b.tipo === 'DIAS_GRATIS' ? null : (b.duracaoCiclos ?? null),
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
        _count: { select: { marcas: true, vendas: true, redesIndicadas: true } },
      },
    })
    const somas = await prisma.comissaoAssessor.groupBy({
      by: ['assessorId', 'status'],
      _sum: { valorComissao: true },
    })
    return {
      assessores: assessores.map((a) => {
        const pendente = somas.find((s) => s.assessorId === a.id && s.status === 'PENDENTE')?._sum.valorComissao
        const paga = somas.find((s) => s.assessorId === a.id && s.status === 'PAGA')?._sum.valorComissao
        return {
          id: a.id, slug: a.slug, plano: a.plano, marcas: a._count.marcas, vendas: a._count.vendas, usuario: a.usuario,
          assinatura: a.assinatura ? { status: a.assinatura.status, simulada: a.assinatura.simulada, valor: num(a.assinatura.valor) } : null,
          percentualComissaoIndicacao: a.percentualComissaoIndicacao != null ? num(a.percentualComissaoIndicacao) : null,
          cliquesIndicacao: a.cliquesIndicacao, redesIndicadas: a._count.redesIndicadas,
          pendente: num(pendente), paga: num(paga),
        }
      }),
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
    // % arbitrado pelo SUPER_ADMIN para a comissão de indicação de lojistas — null = desabilitada.
    percentualComissaoIndicacao: z.coerce.number().positive().max(100).nullable().optional(),
  })
  app.patch('/assessores/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = editarAssessorSchema.parse(request.body)
    const assessor = await prisma.assessor.findUnique({ where: { id } })
    if (!assessor) return reply.code(404).send({ erro: 'Corretor(a) não encontrado(a)' })
    await prisma.$transaction([
      prisma.assessor.update({
        where: { id },
        data: {
          ...(b.percentualComissaoIndicacao !== undefined ? { percentualComissaoIndicacao: b.percentualComissaoIndicacao } : {}),
        },
      }),
      prisma.usuario.update({
        where: { id: assessor.usuarioId },
        data: {
          ...(b.nome !== undefined ? { nome: b.nome } : {}),
          ...(b.telefone !== undefined ? { telefone: b.telefone } : {}),
          ...(b.ativo !== undefined ? { ativo: b.ativo } : {}),
        },
      }),
    ])
    return { ok: true }
  })

  // Comissões de indicação de lojistas geradas pelos Assessores de Moda (mesma mecânica das
  // comissões de afiliado, ver ComissaoAssessor no schema).
  app.get('/assessores/comissoes', async (request) => {
    const { status, assessorId } = request.query as { status?: string; assessorId?: string }
    const comissoes = await prisma.comissaoAssessor.findMany({
      where: {
        ...(status === 'PENDENTE' || status === 'PAGA' ? { status } : {}),
        ...(assessorId ? { assessorId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { assessor: { select: { slug: true, usuario: { select: { nome: true } } } } },
    })
    return {
      comissoes: comissoes.map((c) => ({
        id: c.id, redeNome: c.redeNome, cicloEm: c.cicloEm,
        valorBaseAssinatura: num(c.valorBaseAssinatura), percentualComissao: num(c.percentualComissao),
        valorComissao: num(c.valorComissao), status: c.status, pagoEm: c.pagoEm,
        valorRetencaoFiscal: c.valorRetencaoFiscal != null ? num(c.valorRetencaoFiscal) : null,
        assessorSlug: c.assessor.slug, assessorNome: c.assessor.usuario.nome,
      })),
    }
  })

  const pagarComissaoAssessorSchema = z.object({
    observacaoPagamento: z.string().max(300).optional(),
    valorRetencaoFiscal: z.coerce.number().nonnegative().optional(),
  })
  app.post('/assessores/comissoes/:id/pagar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const b = pagarComissaoAssessorSchema.parse(request.body ?? {})
    const comissao = await prisma.comissaoAssessor.findUnique({ where: { id } })
    if (!comissao) return reply.code(404).send({ erro: 'Comissão não encontrada' })
    if (comissao.status === 'PAGA') return reply.code(422).send({ erro: 'Esta comissão já está marcada como paga.' })
    return prisma.comissaoAssessor.update({
      where: { id },
      data: {
        status: 'PAGA', pagoEm: new Date(), pagoPorId: request.user.sub,
        observacaoPagamento: b.observacaoPagamento ?? null,
        ...(b.valorRetencaoFiscal !== undefined ? { valorRetencaoFiscal: b.valorRetencaoFiscal } : {}),
      },
    })
  })

  // Preço mensal dos 2 planos "Brand Partner" (página comercial).
  app.get('/assessores/config', async () => {
    const config = await prisma.configAssessores.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
    return { precoMensalBasico: num(config.precoMensalBasico), precoMensalAvancado: num(config.precoMensalAvancado) }
  })
  app.put('/assessores/config', async (request) => {
    const { precoMensalBasico, precoMensalAvancado } = z.object({
      precoMensalBasico: z.coerce.number().positive(),
      precoMensalAvancado: z.coerce.number().positive(),
    }).parse(request.body)
    const config = await prisma.configAssessores.upsert({
      where: { id: 1 },
      create: { id: 1, precoMensalBasico, precoMensalAvancado },
      update: { precoMensalBasico, precoMensalAvancado },
    })
    return { precoMensalBasico: num(config.precoMensalBasico), precoMensalAvancado: num(config.precoMensalAvancado) }
  })

  // % padrão da comissão de indicação de lojistas (usado quando a assessora não tem % individual).
  app.get('/assessores/indicacao-config', async () => {
    const config = await prisma.configAssessorIndicacao.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
    return { percentualPadrao: num(config.percentualPadrao) }
  })
  app.put('/assessores/indicacao-config', async (request) => {
    const { percentualPadrao } = z.object({ percentualPadrao: z.coerce.number().nonnegative().max(100) }).parse(request.body)
    const config = await prisma.configAssessorIndicacao.upsert({ where: { id: 1 }, create: { id: 1, percentualPadrao }, update: { percentualPadrao } })
    return { percentualPadrao: num(config.percentualPadrao) }
  })

  // ── Base de leads própria da ZAIEZE (cross-tenant) ──
  app.get('/zaiezeleads', async () => {
    const [total, ultima, amostra] = await Promise.all([
      prisma.zaiezeLead.count(),
      prisma.zaiezeLead.aggregate({ _max: { sincronizadoEm: true } }),
      prisma.zaiezeLead.findMany({ orderBy: { entradaEm: 'desc' }, take: 20 }),
    ])
    return { total, ultimaSincronizacaoEm: ultima._max.sincronizadoEm, amostra }
  })

  app.post('/zaiezeleads/sincronizar', async () => {
    const sincronizados = await sincronizarZaiezeLeads()
    return { ok: true, sincronizados }
  })

  app.get('/zaiezeleads/exportar', async (request, reply) => {
    const { formato } = request.query as { formato?: string }
    const registros = await prisma.zaiezeLead.findMany({ orderBy: { entradaEm: 'desc' } })
    const linhas: LinhaZaiezeLead[] = registros.map((r) => ({
      nome: r.nome, telefone: r.telefone, cidade: r.cidade, uf: r.uf,
      redeNome: r.redeNome, lojaNome: r.lojaNome, vendedoraNome: r.vendedoraNome,
      origemCanal: r.origemCanal, segmento: r.segmento, entradaEm: r.entradaEm,
    }))
    const nomeArquivo = 'zaiezeleads'

    if (formato === 'xlsx') {
      const buffer = await exportarXlsx(linhas)
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      reply.header('Content-Disposition', `attachment; filename="${nomeArquivo}.xlsx"`)
      return reply.send(buffer)
    }
    if (formato === 'sql') {
      reply.header('Content-Type', 'application/sql; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${nomeArquivo}.sql"`)
      return reply.send(exportarSql(linhas))
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
}

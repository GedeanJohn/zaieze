import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { redeIdDe } from '../../plugins/auth'
import { consultarPreapproval, criarPreapproval, cancelarPreapproval, mpConfigurado } from './mercadopago.service'
import { proximoCicloFim, reativarAssinatura, solicitarCancelamento } from './assinatura.service'
import { listarPlanos, precoDoPlano, percentualDescontoAnual, valorAnual } from '../planos/planos.service'
import { consumirCodigo, descricaoBeneficio, validarCodigo } from '../promo/promo.service'
import { CONTRATO_VERSAO } from '../contrato/contrato.template'
import { temAceiteVigente } from '../contrato/contrato.service'
import { normalizarTelefone } from '../../lib/telefone'
import { confirmarCicloEComissionar, gerarComissaoDoCiclo, normalizarCodigo as normalizarCodigoAfiliado } from '../afiliados/afiliado.service'

const arred2 = (n: number) => Math.round(n * 100) / 100

const checkoutSchema = z.object({
  plano: z.enum(['START', 'PRO', 'ELITE']),
  redeNome: z.string().min(2),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'O endereço aceita apenas letras minúsculas, números e hífens'),
  gestorNome: z.string().min(2),
  // Obrigatório: é pra onde vai a senha provisória do "esqueci minha senha".
  telefone: z.string().min(8, 'Informe o WhatsApp com DDD').transform(normalizarTelefone),
  email: z.string().email(),
  senha: z.string().min(6),
  codigoPromo: z.string().optional(),
  // Programa de Afiliados: código do link de indicação (?ref=), capturado pela landing/checkout.
  refAfiliado: z.string().trim().optional(),
  periodicidade: z.enum(['MENSAL', 'ANUAL']).default('MENSAL'),
  // Idioma preferencial escolhido no cadastro (só afeta a UI do gestor; editável depois em "Minha conta").
  idioma: z.enum(['pt', 'en', 'en-gb', 'es']).default('pt'),
})

// Subdomínios que não podem virar slug de tenant (colidem com o SaaS)
const SLUGS_RESERVADOS = new Set(['www', 'app', 'api', 'admin', 'mail', 'static', 'assets', 'cdn', 'zaieze', 'painel'])

function urlTenant(slug: string): string {
  return `${env.TENANT_SCHEME}://${slug}.${env.DOMINIO_BASE}`
}

/** Billing SaaS — checkout público (landing) + webhook do Mercado Pago + provisionamento do tenant. */
export async function assinaturasRoutes(app: FastifyInstance) {
  // Catálogo público de planos (consumido pela landing) — sem autenticação
  app.get('/planos', async () => ({
    planos: await listarPlanos(), dominioBase: env.DOMINIO_BASE, percentualDescontoAnual: await percentualDescontoAnual(),
  }))

  // Validação pública de código promocional (landing mostra o benefício antes do checkout)
  app.get('/codigo-promo', async (request) => {
    const { codigo } = request.query as { codigo?: string }
    const c = await validarCodigo(codigo)
    if (!c) return { valido: false }
    return { valido: true, beneficio: descricaoBeneficio(c), tipo: c.tipo, dias: c.dias, percentual: c.percentual, plano: c.plano }
  })

  // Verifica disponibilidade do endereço (slug) — usado pela landing em tempo real
  app.get('/slug-disponivel', async (request) => {
    const { slug } = request.query as { slug?: string }
    const s = (slug ?? '').toLowerCase()
    const valido = /^[a-z0-9-]{3,}$/.test(s) && !SLUGS_RESERVADOS.has(s)
    if (!valido) return { disponivel: false, motivo: 'inválido' }
    const existe = await prisma.rede.findUnique({ where: { slug: s } })
    return { disponivel: !existe, motivo: existe ? 'em uso' : null }
  })

  app.post('/checkout', async (request, reply) => {
    const body = checkoutSchema.parse(request.body)
    const slug = body.slug.toLowerCase()
    const email = body.email.toLowerCase()

    if (SLUGS_RESERVADOS.has(slug)) {
      return reply.code(422).send({ erro: 'Este endereço é reservado. Escolha outro.' })
    }
    if (await prisma.rede.findUnique({ where: { slug } })) {
      return reply.code(409).send({ erro: `O endereço ${slug}.${env.DOMINIO_BASE} já está em uso.` })
    }
    if (await prisma.usuario.findUnique({ where: { email } })) {
      return reply.code(409).send({ erro: 'Já existe uma conta com este e-mail.' })
    }

    // Código promocional (opcional): % de desconto na mensalidade ou dias grátis.
    const promo = await validarCodigo(body.codigoPromo)
    if (body.codigoPromo && body.codigoPromo.trim() && !promo) {
      return reply.code(422).send({ erro: 'Código promocional inválido ou expirado.' })
    }
    // Cupom pode FIXAR o plano da oferta (link só ?cupom=): quando definido, ele manda no plano.
    const plano = promo?.plano ?? body.plano
    let valor = await precoDoPlano(plano)
    // Plano ANUAL: cobra 1x/ano o total com desconto, em vez do valor mensal.
    if (body.periodicidade === 'ANUAL') {
      valor = valorAnual(valor, await percentualDescontoAnual())
    }
    if (promo?.tipo === 'PERCENTUAL' && promo.percentual) {
      valor = arred2(valor * (1 - Number(promo.percentual) / 100))
    }
    const diasGratis = promo?.tipo === 'DIAS_GRATIS' ? promo.dias ?? 0 : 0

    // Programa de Afiliados: vincula a rede ao afiliado do link (?ref=), se o código existir e o
    // afiliado estiver ativo. Gravado no ato — base do cálculo de comissão vitalícia.
    const afiliado = body.refAfiliado
      ? await prisma.afiliado.findFirst({
          where: { codigo: normalizarCodigoAfiliado(body.refAfiliado), usuario: { ativo: true } },
          select: { id: true },
        })
      : null

    const senhaHash = await bcrypt.hash(body.senha, 10)
    const simulada = !mpConfigurado()
    // 100% de desconto (valor zerado) → não há o que cobrar: ativa na hora, SEM passar pelo
    // Mercado Pago (uma recorrência de R$0 nunca é confirmada e travaria o tenant em PENDENTE).
    const gratuito = valor <= 0
    const semCobranca = simulada || gratuito

    // Início do 1º ciclo: com dias grátis, o acesso vai até now+dias (depois cobra).
    const inicioCiclo = () => {
      if (!diasGratis) return proximoCicloFim(new Date(), body.periodicidade)
      const d = new Date(); d.setDate(d.getDate() + diasGratis); return d
    }
    // Data da 1ª cobrança quando há período grátis (free trial). Sem dias grátis, a
    // cobrança é no ato (null = não há aviso de "1ª cobrança a caminho").
    const primeiraCobrancaEm = diasGratis ? (() => { const d = new Date(); d.setDate(d.getDate() + diasGratis); return d })() : null
    // Calculado uma única vez (fora da transação) e reaproveitado como cicloEm da comissão do
    // afiliado abaixo — evita qualquer drift entre o valor gravado e o usado no cálculo.
    const cicloFimEmInicial = semCobranca ? inicioCiclo() : null

    // Provisiona o tenant. Em modo simulado já nasce ATIVO; em modo real fica inativo
    // até o webhook de pagamento aprovado liberar o acesso.
    const rede = await prisma.$transaction(async (tx) => {
      const r = await tx.rede.create({ data: { nome: body.redeNome, slug, plano, ativo: semCobranca, afiliadoId: afiliado?.id ?? null } })
      await tx.usuario.create({
        data: { redeId: r.id, nome: body.gestorNome, email, senhaHash, role: 'GESTOR', telefone: body.telefone, idioma: body.idioma },
      })
      // Aceite eletrônico da versão vigente do contrato, firmado no ato da adesão.
      await tx.aceiteContrato.create({
        data: {
          redeId: r.id,
          versao: CONTRATO_VERSAO,
          assinanteNome: body.gestorNome,
          assinanteEmail: email,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      })
      await tx.assinatura.create({
        data: {
          redeId: r.id, plano, valor, simulada: semCobranca, periodicidade: body.periodicidade,
          status: semCobranca ? 'ATIVA' : 'PENDENTE',
          // sem cobrança (simulado ou 100% off) já entra com ciclo; no modo pago o ciclo começa no webhook
          cicloFimEm: cicloFimEmInicial,
          primeiraCobrancaEm,
        },
      })
      return r
    })

    if (semCobranca) {
      if (promo) await consumirCodigo(promo.id)
      // Ativação instantânea (simulado/100% off) não passa pelo webhook — gera a comissão do
      // 1º ciclo aqui, direto (se houver afiliado de origem e valor a comissionar).
      if (afiliado && valor > 0) {
        await gerarComissaoDoCiclo({ redeId: rede.id, cicloEm: cicloFimEmInicial ?? new Date(), valorBaseAssinatura: valor })
      }
      return reply.code(201).send({
        simulado: true,
        plano,
        slug,
        redirect: `${urlTenant(slug)}/login`,
        mensagem: gratuito && !simulada
          ? 'Assinatura ativada com 100% de desconto — seu painel já está no ar.'
          : 'Assinatura simulada ativada — seu painel já está no ar.',
      })
    }

    // Mercado Pago real: cria a assinatura recorrente e devolve o checkout
    try {
      const pre = await criarPreapproval({
        plano,
        valor,
        email,
        redeSlug: slug,
        backUrl: `${urlTenant(slug)}/login`,
        diasGratis,
        periodicidade: body.periodicidade,
      })
      await prisma.assinatura.update({ where: { redeId: rede.id }, data: { mpPreapprovalId: pre.id } })
      if (promo) await consumirCodigo(promo.id)
      return reply.code(201).send({ simulado: false, plano, slug, initPoint: pre.initPoint })
    } catch (e) {
      // Desfaz o provisionamento se o Mercado Pago falhar
      await prisma.rede.delete({ where: { id: rede.id } })
      throw e
    }
  })

  // Webhook do Mercado Pago — sincroniza a assinatura/tenant consultando o STATUS REAL no MP.
  // MP pode enviar o id no corpo (data.id) ou na querystring (?id=&topic=).
  app.post('/webhook', async (request, reply) => {
    const body = (request.body ?? {}) as { type?: string; topic?: string; action?: string; data?: { id?: string } }
    const q = request.query as { id?: string; topic?: string; 'data.id'?: string }
    const topico = body.type ?? body.topic ?? q.topic ?? ''
    const id = body.data?.id ?? q['data.id'] ?? q.id

    // só tratamos eventos de assinatura (preapproval)
    if (!id || !/preapproval|subscription/i.test(topico)) return reply.code(200).send({ ok: true })

    const assinatura = await prisma.assinatura.findFirst({ where: { mpPreapprovalId: id } })
    if (!assinatura) return reply.code(200).send({ ok: true })

    // NÃO confia na notificação: consulta o status real no Mercado Pago
    const status = await consultarPreapproval(id)
    if (status === 'authorized') {
      await confirmarCicloEComissionar(assinatura.redeId) // ativa/renova + estende o ciclo +1 mês + comissão do afiliado
    } else if (status === 'cancelled' || status === 'paused') {
      // mesmo vindo do MP: cancela por FIM DE CICLO (mantém acesso até o ciclo pago vencer)
      await solicitarCancelamento(assinatura.redeId, 'MERCADO_PAGO')
    }
    return reply.code(200).send({ ok: true })
  })

  // ── Gestão da assinatura pelo painel do tenant (GESTOR/SUPER_ADMIN) ──

  // Aviso de encerramento — QUALQUER usuário logado da rede vê a data/hora do corte de acesso
  app.get('/aviso', { preHandler: [app.authenticate] }, async (request) => {
    const redeId = request.user.redeId
    if (!redeId) return { encerraEm: null, cobrancaComecaEm: null }
    const a = await prisma.assinatura.findUnique({
      where: { redeId },
      select: { status: true, cancelamentoSolicitadoEm: true, cicloFimEm: true, primeiraCobrancaEm: true },
    })
    if (!a || a.status === 'CANCELADA') return { encerraEm: null, cobrancaComecaEm: null }

    // Encerramento agendado (cancelamento): acesso garantido até o fim do ciclo.
    const encerraEm = a.cancelamentoSolicitadoEm && a.cicloFimEm ? a.cicloFimEm : null

    // 1ª cobrança a caminho (free trial): avisa quando faltam <= 30 dias corridos.
    // Não exibe se já há um cancelamento agendado (a cobrança não vai ocorrer).
    let cobrancaComecaEm: Date | null = null
    if (a.primeiraCobrancaEm && !a.cancelamentoSolicitadoEm) {
      const faltamMs = a.primeiraCobrancaEm.getTime() - Date.now()
      if (faltamMs > 0 && faltamMs <= 30 * 86_400_000) cobrancaComecaEm = a.primeiraCobrancaEm
    }
    return { encerraEm, cobrancaComecaEm }
  })

  // Assinatura da rede logada
  app.get('/minha', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request) => {
    const redeId = redeIdDe(request)
    const assinatura = await prisma.assinatura.findUnique({ where: { redeId } })
    return { assinatura, mpConfigurado: mpConfigurado() }
  })

  const trocarSchema = z.object({ plano: z.enum(['START', 'PRO', 'ELITE']) })

  // Trocar de plano (aplica imediatamente; em produção real exige atualizar o preapproval no MP)
  app.post('/trocar-plano', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { plano } = trocarSchema.parse(request.body)
    const assinatura = await prisma.assinatura.findUnique({ where: { redeId } })
    if (!assinatura) return reply.code(404).send({ erro: 'Rede sem assinatura' })
    if (assinatura.plano === plano) return reply.code(422).send({ erro: 'A rede já está neste plano.' })

    let valor = await precoDoPlano(plano)
    // Preserva a periodicidade vigente da assinatura (mensal/anual) ao trocar de plano.
    if (assinatura.periodicidade === 'ANUAL') valor = valorAnual(valor, await percentualDescontoAnual())
    await prisma.$transaction([
      prisma.assinatura.update({
        where: { redeId },
        data: {
          plano, valor, status: 'ATIVA',
          // trocar de plano reengaja: cancela um cancelamento agendado e garante ciclo vigente
          cancelamentoSolicitadoEm: null, cancelamentoOrigem: null,
          cicloFimEm: assinatura.cicloFimEm ?? proximoCicloFim(new Date(), assinatura.periodicidade),
        },
      }),
      prisma.rede.update({ where: { id: redeId }, data: { plano, ativo: true } }),
    ])
    return { ok: true, plano, observacao: assinatura.simulada ? 'Plano alterado (modo simulado).' : 'Plano alterado. A próxima cobrança no Mercado Pago refletirá o novo valor.' }
  })

  const trocarPeriodicidadeSchema = z.object({ periodicidade: z.enum(['MENSAL', 'ANUAL']) })

  // Trocar entre cobrança mensal e anual. O Mercado Pago não permite mudar a frequência de um
  // preapproval já criado — em modo real, cancela a recorrência atual e cria uma nova (mesmo
  // padrão do /reassinar), e o gestor reautoriza no MP. Em modo simulado, aplica na hora.
  app.post('/trocar-periodicidade', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const { periodicidade } = trocarPeriodicidadeSchema.parse(request.body)
    const rede = await prisma.rede.findUnique({ where: { id: redeId }, include: { assinatura: true } })
    if (!rede?.assinatura) return reply.code(404).send({ erro: 'Rede sem assinatura' })
    const assinatura = rede.assinatura
    if (assinatura.periodicidade === periodicidade) {
      return reply.code(422).send({ erro: `A assinatura já está no modo ${periodicidade === 'ANUAL' ? 'anual' : 'mensal'}.` })
    }

    let valor = await precoDoPlano(assinatura.plano)
    if (periodicidade === 'ANUAL') valor = valorAnual(valor, await percentualDescontoAnual())

    if (assinatura.simulada || !mpConfigurado()) {
      await prisma.assinatura.update({
        where: { redeId },
        data: { periodicidade, valor, cicloFimEm: proximoCicloFim(new Date(), periodicidade) },
      })
      return { simulado: true }
    }

    // Modo real: a frequência de um preapproval não é editável — cancela o atual e cria um novo.
    if (assinatura.mpPreapprovalId) await cancelarPreapproval(assinatura.mpPreapprovalId).catch(() => { /* pendente/sem efeito */ })
    const gestor = await prisma.usuario.findFirst({ where: { redeId, role: 'GESTOR' }, orderBy: { createdAt: 'asc' } })
    const pre = await criarPreapproval({
      plano: assinatura.plano,
      valor,
      email: gestor?.email ?? '',
      redeSlug: rede.slug,
      backUrl: `${urlTenant(rede.slug)}/login`,
      periodicidade,
    })
    await prisma.assinatura.update({ where: { redeId }, data: { mpPreapprovalId: pre.id, periodicidade, valor } })
    return { simulado: false, initPoint: pre.initPoint }
  })

  // Cancelar a assinatura — política de FIM DE CICLO: mantém o acesso até cicloFimEm.
  // Origem registrada: ADMIN (super admin) ou LOJISTA (gestor).
  app.post('/cancelar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const assinatura = await prisma.assinatura.findUnique({ where: { redeId } })
    if (!assinatura) return reply.code(404).send({ erro: 'Rede sem assinatura' })
    const origem = request.user.role === 'SUPER_ADMIN' ? 'ADMIN' : 'LOJISTA'
    const { acessoAte } = await solicitarCancelamento(redeId, origem)
    return { ok: true, acessoAte }
  })

  // Reativar (desfaz um cancelamento agendado enquanto o ciclo ainda não venceu)
  app.post('/reativar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const ok = await reativarAssinatura(redeId)
    if (!ok) return reply.code(422).send({ erro: 'Assinatura já encerrada — faça uma nova assinatura.' })
    return { ok: true }
  })

  // Reassinar = NOVO CONTRATO (nova recorrência), preservando a rede, lojas e todas as
  // configurações. Exige o aceite da versão vigente. Usado após um distrato (recorrência
  // cancelada) ou quando a assinatura foi encerrada.
  app.post('/reassinar', { preHandler: [app.authorize('GESTOR', 'SUPER_ADMIN')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const rede = await prisma.rede.findUnique({ where: { id: redeId }, include: { assinatura: true } })
    if (!rede?.assinatura) return reply.code(404).send({ erro: 'Rede sem assinatura' })
    if (!(await temAceiteVigente(redeId))) {
      return reply.code(409).send({ erro: 'Aceite os termos atualizados antes de reativar.' })
    }

    const plano = rede.assinatura.plano
    const periodicidade = rede.assinatura.periodicidade
    let valor = await precoDoPlano(plano)
    if (periodicidade === 'ANUAL') valor = valorAnual(valor, await percentualDescontoAnual())

    // Modo simulado: reativa direto (equivale ao webhook de pagamento aprovado).
    if (!mpConfigurado()) {
      await confirmarCicloEComissionar(redeId)
      return { simulado: true, redirect: `${urlTenant(rede.slug)}/login` }
    }

    // Mercado Pago real: a recorrência anterior foi cancelada no distrato, então cria um
    // NOVO preapproval. O acesso só é (re)ativado quando o pagamento confirma, via webhook.
    const gestor = await prisma.usuario.findFirst({ where: { redeId, role: 'GESTOR' }, orderBy: { createdAt: 'asc' } })
    const pre = await criarPreapproval({
      plano,
      valor,
      email: gestor?.email ?? '',
      redeSlug: rede.slug,
      backUrl: `${urlTenant(rede.slug)}/login`,
      periodicidade,
    })
    await prisma.assinatura.update({ where: { redeId }, data: { mpPreapprovalId: pre.id, plano, valor } })
    return { simulado: false, initPoint: pre.initPoint }
  })

  // Aprovação simulada (dev) — equivale ao webhook quando não há Mercado Pago configurado.
  // SEGURANÇA: só existe em modo simulado; com o Mercado Pago configurado fica desabilitado,
  // senão seria um bypass para ativar tenants sem pagar.
  app.post('/simular-aprovacao/:slug', async (request, reply) => {
    if (mpConfigurado()) return reply.code(404).send({ erro: 'Recurso indisponível' })
    const { slug } = request.params as { slug: string }
    const rede = await prisma.rede.findUnique({ where: { slug }, include: { assinatura: true } })
    if (!rede?.assinatura) return reply.code(404).send({ erro: 'Assinatura não encontrada' })
    await confirmarCicloEComissionar(rede.id)
    return { ok: true, redirect: `${urlTenant(slug)}/login` }
  })
}

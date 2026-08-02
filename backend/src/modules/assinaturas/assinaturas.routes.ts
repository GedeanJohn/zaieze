import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { consultarPreapproval } from './mercadopago.service'
import { solicitarCancelamento } from './assinatura.service'
import { descricaoBeneficio, validarCodigo } from '../promo/promo.service'
import { CONTRATO_VERSAO } from '../contrato/contrato.template'
import { PRIVACIDADE_VERSAO } from '../privacidade/privacidade.template'
import { TERMOS_USO_VERSAO } from '../termos-uso/termos-uso.template'
import { normalizarTelefone } from '../../lib/telefone'
import { confirmarCicloEComissionar, normalizarCodigo as normalizarCodigoAfiliado } from '../afiliados/afiliado.service'
import { obterCotacaoAtual } from '../cambio/cambio.service'
import { confirmarCicloAddon, solicitarCancelamentoAddon } from '../addons/addon.service'
import { confirmarCicloAssessor, solicitarCancelamentoAssessor } from '../assessores/assinatura-assessor.service'
import { confirmarCicloChatAtendimento, solicitarCancelamentoChatAtendimento } from '../chat-atendimento/assinatura-chat-atendimento.service'
import { normalizarSlug as normalizarSlugAssessor } from '../assessores/assessor.service'
import { confirmarCicloAssentoVendedora, solicitarCancelamentoAssentoVendedora } from '../vendedora-billing/assinatura-vendedora.service'

const checkoutSchema = z.object({
  redeNome: z.string().min(2),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'O endereço aceita apenas letras minúsculas, números e hífens'),
  gestorNome: z.string().min(2),
  // Obrigatório: é pra onde vai a senha provisória do "esqueci minha senha".
  telefone: z.string().min(8, 'Informe o WhatsApp com DDD').transform(normalizarTelefone),
  email: z.string().email(),
  senha: z.string().min(6),
  // Programa de Afiliados: código do link de indicação (?ref=), capturado pela landing/checkout.
  refAfiliado: z.string().trim().optional(),
  // Indicação por Assessor(a) de Moda: slug do link de indicação (?refAssessor=<slug>).
  refAssessor: z.string().trim().optional(),
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
  // Config pública do domínio + câmbio (consumido pela landing/checkout) — sem autenticação.
  // O preço em si (assento de vendedora) vem de GET /vendedora-billing/preco.
  app.get('/planos', async () => ({
    dominioBase: env.DOMINIO_BASE, cambio: await obterCotacaoAtual(),
  }))

  // Validação pública de código promocional (landing mostra o benefício antes do checkout)
  app.get('/codigo-promo', async (request) => {
    const { codigo } = request.query as { codigo?: string }
    const c = await validarCodigo(codigo)
    if (!c) return { valido: false }
    return { valido: true, beneficio: descricaoBeneficio(c), tipo: c.tipo, dias: c.dias, percentual: c.percentual }
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

  // Cadastro da marca — GRÁTIS (não há mais plano/mensalidade da Rede; a cobrança do SaaS nasce
  // só quando o gestor ativa uma conta de vendedora, ver vendedora-billing/). Sem cupom aqui: o
  // cupom (CodigoPromocional) agora se aplica ao assento de vendedora, informado de novo na
  // primeira compra (GET /vendedora-billing/preco), não no cadastro da marca.
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

    // Programa de Afiliados: vincula a rede ao afiliado do link (?ref=), se o código existir e o
    // afiliado estiver ativo. Gravado no ato — base do cálculo de comissão vitalícia. A comissão em
    // si nasce quando a rede ativa a 1ª conta de vendedora (não há mais valor a comissionar aqui,
    // já que o cadastro da marca é grátis).
    const afiliado = body.refAfiliado
      ? await prisma.afiliado.findFirst({
          where: { codigo: normalizarCodigoAfiliado(body.refAfiliado), usuario: { ativo: true } },
          select: { id: true },
        })
      : null

    // Indicação por Assessor(a) de Moda: vincula a rede ao assessor do link (?refAssessor=<slug>),
    // se o slug existir e a assessora estiver ativa. Gravado no ato — base do cálculo de comissão.
    const assessorIndicador = body.refAssessor
      ? await prisma.assessor.findFirst({
          where: { slug: normalizarSlugAssessor(body.refAssessor), usuario: { ativo: true } },
          select: { id: true },
        })
      : null

    const senhaHash = await bcrypt.hash(body.senha, 10)

    // Provisiona o tenant — sempre ativo na hora, não há cobrança/webhook a esperar.
    const rede = await prisma.$transaction(async (tx) => {
      const r = await tx.rede.create({
        data: {
          nome: body.redeNome, slug, ativo: true,
          afiliadoId: afiliado?.id ?? null,
          assessorOrigemId: assessorIndicador?.id ?? null,
        },
      })
      await tx.usuario.create({
        data: { redeId: r.id, nome: body.gestorNome, email, senhaHash, role: 'GESTOR', telefone: body.telefone, idioma: body.idioma },
      })
      // Indicação por Assessor(a): cria o cartão de representação já vinculado à rede, mas
      // pendente — só entra na vitrine dela depois que o gestor desta rede aceitar (ver
      // GET/POST /api/marca/solicitacao-assessor).
      if (assessorIndicador) {
        const maiorOrdem = await tx.assessorMarca.aggregate({ where: { assessorId: assessorIndicador.id }, _max: { ordem: true } })
        await tx.assessorMarca.create({
          data: { assessorId: assessorIndicador.id, redeId: r.id, nome: body.redeNome, ordem: (maiorOrdem._max.ordem ?? -1) + 1 },
        })
      }
      // Aceite eletrônico da versão vigente do Contrato, da Política de Privacidade e dos
      // Termos de Uso, firmado no ato da adesão — cada documento com seu próprio registro
      // (aceite individual e independente, ver contrato/privacidade/termos-uso).
      await tx.aceiteContrato.create({
        data: {
          redeId: r.id,
          versao: CONTRATO_VERSAO,
          idioma: body.idioma,
          assinanteNome: body.gestorNome,
          assinanteEmail: email,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      })
      await tx.aceitePrivacidade.create({
        data: {
          redeId: r.id,
          versao: PRIVACIDADE_VERSAO,
          idioma: body.idioma,
          assinanteNome: body.gestorNome,
          assinanteEmail: email,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      })
      await tx.aceiteTermosUso.create({
        data: {
          redeId: r.id,
          versao: TERMOS_USO_VERSAO,
          idioma: body.idioma,
          assinanteNome: body.gestorNome,
          assinanteEmail: email,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      })
      return r
    })

    return reply.code(201).send({
      slug,
      redirect: `${urlTenant(slug)}/login`,
      mensagem: 'Conta criada — agora é só cadastrar sua equipe de vendedoras.',
    })
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
    if (assinatura) {
      // NÃO confia na notificação: consulta o status real no Mercado Pago
      const status = await consultarPreapproval(id)
      if (status === 'authorized') {
        await confirmarCicloEComissionar(assinatura.redeId) // ativa/renova + estende o ciclo +1 mês + comissão do afiliado
      } else if (status === 'cancelled' || status === 'paused') {
        // mesmo vindo do MP: cancela por FIM DE CICLO (mantém acesso até o ciclo pago vencer)
        await solicitarCancelamento(assinatura.redeId, 'MERCADO_PAGO')
      }
      return reply.code(200).send({ ok: true })
    }

    // Não é a assinatura do plano — pode ser a de um add-on (recorrência própria, mesmo webhook).
    const addon = await prisma.assinaturaAddon.findFirst({ where: { mpPreapprovalId: id } })
    if (addon) {
      const status = await consultarPreapproval(id)
      if (status === 'authorized') {
        await confirmarCicloAddon(addon.redeId, addon.tipo)
      } else if (status === 'cancelled' || status === 'paused') {
        await solicitarCancelamentoAddon(addon.redeId, addon.tipo, 'MERCADO_PAGO')
      }
      return reply.code(200).send({ ok: true })
    }

    // Nem plano nem add-on de rede — pode ser a assinatura de um(a) Assessor(a) de Moda.
    const assinaturaAssessor = await prisma.assinaturaAssessor.findFirst({ where: { mpPreapprovalId: id } })
    if (assinaturaAssessor) {
      const status = await consultarPreapproval(id)
      if (status === 'authorized') {
        await confirmarCicloAssessor(assinaturaAssessor.assessorId)
      } else if (status === 'cancelled' || status === 'paused') {
        await solicitarCancelamentoAssessor(assinaturaAssessor.assessorId, 'MERCADO_PAGO')
      }
      return reply.code(200).send({ ok: true })
    }

    // Nem os anteriores — pode ser a assinatura do Chat de Atendimento (comprada pelo gestor).
    const assinaturaChatAtendimento = await prisma.assinaturaChatAtendimento.findFirst({ where: { mpPreapprovalId: id } })
    if (assinaturaChatAtendimento) {
      const status = await consultarPreapproval(id)
      if (status === 'authorized') {
        await confirmarCicloChatAtendimento(assinaturaChatAtendimento.id)
      } else if (status === 'cancelled' || status === 'paused') {
        await solicitarCancelamentoChatAtendimento(assinaturaChatAtendimento.id, 'MERCADO_PAGO')
      }
      return reply.code(200).send({ ok: true })
    }

    // Nenhum dos anteriores — pode ser o assento de uma vendedora (billing por conta, ver
    // vendedora-billing/assinatura-vendedora.service.ts).
    const assinaturaVendedora = await prisma.assinaturaVendedora.findFirst({ where: { mpPreapprovalId: id } })
    if (assinaturaVendedora) {
      const status = await consultarPreapproval(id)
      if (status === 'authorized') {
        await confirmarCicloAssentoVendedora(assinaturaVendedora.id)
      } else if (status === 'cancelled' || status === 'paused') {
        await solicitarCancelamentoAssentoVendedora(assinaturaVendedora.id, 'MERCADO_PAGO')
      }
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

  // As rotas de gestão do plano da REDE (trocar/cancelar/reativar/reassinar) saíram daqui — não
  // existe mais "plano da marca" (ver vendedora-billing/ pra gestão de assentos por vendedora).
  // Os models Assinatura/ConfigPlano/enum Plano continuam no schema, dormentes, só como histórico
  // das poucas redes que ainda os têm (nenhuma com cobrança real pendente) — não removidos ainda
  // porque `aplicarFimDeCiclo`/`solicitarCancelamento` (assinatura.service.ts) seguem sendo
  // chamados no login e no distrato de contrato/privacidade/termos de uso, e lidam bem com
  // "rede sem Assinatura" (no-op). Retirar o model por completo fica pra uma limpeza futura,
  // depois que essas redes dormentes forem encerradas/migradas.
}

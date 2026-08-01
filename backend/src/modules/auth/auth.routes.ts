import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { aplicarFimDeCiclo } from '../assinaturas/assinatura.service'
import { aplicarFimDeCicloAssessor } from '../assessores/assinatura-assessor.service'
import { enviarTemplatePlataforma } from '../whatsapp/meta.service'
import { gerarSenhaProvisoria } from './senha-provisoria'
import { normalizarTelefone } from '../../lib/telefone'

// "Esqueci minha senha": identifica por TELEFONE (caminho principal) ou por E-MAIL (link
// "não tenho WhatsApp cadastrado" — pra quem não sabe/não lembra o número). Em ambos os casos,
// se a conta encontrada tiver telefone cadastrado, a senha provisória vai pro WhatsApp na hora;
// senão, vira uma solicitação pendente pro humano atender.
const esqueciSenhaSchema = z.union([
  z.object({ telefone: z.string().min(8).transform(normalizarTelefone) }),
  z.object({ email: z.string().email() }),
])

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
  // slug do tenant (subdomínio wildcard); quando presente, a conta precisa pertencer a esta rede
  redeSlug: z.string().optional(),
})

export async function authRoutes(app: FastifyInstance) {
  // Anti força-bruta: no máximo 10 tentativas de login por minuto por IP
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body)

    const usuario = await prisma.usuario.findUnique({
      where: { email: body.email.toLowerCase() },
      include: {
        loja: { select: { id: true, nome: true, slug: true, ativo: true, rede: { select: { id: true, nome: true, slug: true, plano: true, ativo: true } } } },
        rede: { select: { id: true, nome: true, slug: true, plano: true, ativo: true } },
      },
    })

    if (!usuario || !usuario.ativo || !(await bcrypt.compare(body.senha, usuario.senhaHash))) {
      return reply.code(401).send({ erro: 'E-mail ou senha inválidos' })
    }

    // redeId do gestor vem direto; do gerente/vendedora, via loja
    const redeId = usuario.redeId ?? usuario.loja?.rede.id ?? null
    const rede = usuario.rede ?? usuario.loja?.rede ?? null

    // Política de fim de ciclo: se a assinatura foi cancelada e o ciclo venceu, isto
    // desativa a rede agora (corta o acesso de todas as lojas no próximo passo).
    if (redeId) await aplicarFimDeCiclo(redeId)
    const redeAtiva = redeId
      ? ((await prisma.rede.findUnique({ where: { id: redeId }, select: { ativo: true } }))?.ativo ?? false)
      : true

    if (usuario.loja && (!usuario.loja.ativo || !redeAtiva)) {
      return reply.code(403).send({ erro: 'Loja ou rede desativada' })
    }
    if (usuario.rede && !redeAtiva) {
      return reply.code(403).send({ erro: 'Rede desativada' })
    }

    // ASSESSORA tem subdomínio PRÓPRIO (<slug>.zaieze.com, ver módulo assessores) — isolamento
    // contra o slug dela, não contra uma Rede (ela não pertence a nenhuma).
    const assessor = usuario.role === 'ASSESSORA'
      ? await prisma.assessor.findUnique({ where: { usuarioId: usuario.id }, select: { id: true, slug: true } })
      : null
    const assessorSlug = assessor?.slug ?? null

    // Assinatura da assessora: conta criada pelo admin (sem checkout) não tem registro — login
    // livre. Havendo registro, só bloqueia se NÃO estiver ATIVA (pendente de 1º pagamento ou cancelada).
    if (assessor) {
      await aplicarFimDeCicloAssessor(assessor.id)
      const assinatura = await prisma.assinaturaAssessor.findUnique({ where: { assessorId: assessor.id }, select: { status: true } })
      if (assinatura && assinatura.status !== 'ATIVA') {
        return reply.code(403).send({
          erro: assinatura.status === 'PENDENTE'
            ? 'Sua assinatura ainda não foi confirmada pelo Mercado Pago.'
            : 'Sua assinatura foi encerrada. Assine novamente para voltar a acessar.',
        })
      }
    }

    // Isolamento por subdomínio (wildcard): a conta só entra no seu próprio tenant.
    // SUPER_ADMIN (operador do SaaS) e AFILIADO (sem rede — acessa por /painel) acessam de qualquer endereço.
    if (body.redeSlug && usuario.role === 'ASSESSORA' && assessorSlug !== body.redeSlug) {
      return reply.code(403).send({ erro: 'Esta conta não pertence a este endereço.' })
    }
    if (body.redeSlug && usuario.role !== 'SUPER_ADMIN' && usuario.role !== 'AFILIADO' && usuario.role !== 'ASSESSORA' && rede?.slug !== body.redeSlug) {
      return reply.code(403).send({ erro: 'Esta conta não pertence a este endereço.' })
    }

    const token = app.jwt.sign(
      { sub: usuario.id, redeId, lojaId: usuario.lojaId, role: usuario.role, nome: usuario.nome, plano: rede?.plano ?? null, comercial: usuario.comercial },
      { expiresIn: '12h' },
    )

    // Add-ons de IA contratados (Provador, Vendedora ZAIEZE, Estoque Inteligente) — o menu do
    // frontend usa isso pra só mostrar cada item de "Força IA" quando a rede realmente pagou por ele.
    const addonsAtivos = redeId
      ? (await prisma.assinaturaAddon.findMany({ where: { redeId, status: 'ATIVA' }, select: { tipo: true } })).map((a) => a.tipo)
      : []

    return {
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
        comercial: usuario.comercial,
        fotoUrl: usuario.fotoUrl,
        idioma: usuario.idioma,
        rede: rede ? { id: rede.id, nome: rede.nome, plano: rede.plano, addonsAtivos } : null,
        loja: usuario.loja ? { id: usuario.loja.id, nome: usuario.loja.nome, slug: usuario.loja.slug } : null,
        assessor: assessorSlug ? { slug: assessorSlug } : null,
      },
    }
  })

  // "Esqueci minha senha": com WhatsApp cadastrado, gera e manda uma senha provisória na hora
  // (número oficial da própria ZAIEZE, não o da marca — não depende de a marca ter WABA própria).
  // Sem WhatsApp, fica pendente para um humano atender (GESTOR da rede, ou o SUPER_ADMIN quando
  // quem pediu é o próprio GESTOR) — ver GET /usuarios/solicitacoes-senha e /admin/solicitacoes-senha.
  app.post('/esqueci-senha', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request) => {
    const body = esqueciSenhaSchema.parse(request.body)
    const usuario = 'telefone' in body
      ? await prisma.usuario.findFirst({ where: { telefone: body.telefone, ativo: true } })
      : await prisma.usuario.findFirst({ where: { email: body.email.toLowerCase(), ativo: true } })
    if (!usuario) return { ok: true, via: 'nao-encontrado' as const }

    if (usuario.telefone) {
      const senha = gerarSenhaProvisoria()
      const resultado = await enviarTemplatePlataforma({
        telefone: usuario.telefone,
        templateNome: env.ZAIEZE_WA_TEMPLATE_SENHA,
        params: [{ texto: senha }],
      })
      // Sem checar o resultado, dizíamos "via WhatsApp" mesmo quando nada foi enviado de verdade
      // (credenciais ZAIEZE_WA_* ausentes → SIMULADA, ou falha real na API da Meta) — a pessoa
      // ficava esperando uma senha que nunca chegava. Cai no mesmo caminho de "sem WhatsApp": vira
      // solicitação pendente pro humano atender.
      if (resultado.status !== 'ENVIADA') {
        request.log.warn({ telefone: usuario.telefone, resultado }, 'Senha provisória (esqueci-senha) não foi enviada de verdade')
        await prisma.solicitacaoSenha.create({ data: { usuarioId: usuario.id } })
        return { ok: true, via: 'pendente' as const }
      }
      await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: await bcrypt.hash(senha, 10) } })
      return { ok: true, via: 'whatsapp' as const }
    }

    await prisma.solicitacaoSenha.create({ data: { usuarioId: usuario.id } })
    return { ok: true, via: 'pendente' as const }
  })

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: {
        id: true, nome: true, email: true, role: true, telefone: true, fotoUrl: true, idioma: true,
        metaMensal: true, comissaoPadrao: true,
        equipe: { select: { id: true, nome: true } },
        rede: { select: { id: true, nome: true, plano: true } },
        loja: { select: { id: true, nome: true, slug: true, rede: { select: { id: true, nome: true, plano: true } } } },
      },
    })

    const redeId = usuario.rede?.id ?? usuario.loja?.rede.id ?? null
    const addonsAtivos = redeId
      ? (await prisma.assinaturaAddon.findMany({ where: { redeId, status: 'ATIVA' }, select: { tipo: true } })).map((a) => a.tipo)
      : []

    return {
      ...usuario,
      rede: usuario.rede ? { ...usuario.rede, addonsAtivos } : null,
      loja: usuario.loja ? { ...usuario.loja, rede: { ...usuario.loja.rede, addonsAtivos } } : null,
    }
  })
}

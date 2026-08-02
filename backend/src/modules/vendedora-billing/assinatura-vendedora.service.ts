import { randomBytes } from 'node:crypto'
import type { Role } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { criarPreapproval, mpConfigurado, atualizarValorPreapproval } from '../assinaturas/mercadopago.service'
import { validarCodigo, consumirCodigo, aplicarDesconto } from '../promo/promo.service'

/**
 * Assento de vendedora — a cobrança do SaaS nasce POR VENDEDORA (não mais por Rede/Plano, ver
 * migração de planos → cobrança por conta de vendedora). Mesmo padrão de ciclo/cancelamento de
 * assinatura-chat-atendimento.service.ts, com duas diferenças:
 * 1) o pagamento acontece ANTES de existir o Usuario (fluxo de convite — conviteId fica
 *    preenchido enquanto vendedoraId é null; resolverConviteAceito() liga os dois no aceite);
 * 2) quando quem solicita é o GERENTE, a cobrança fica presa até o GESTOR aprovar
 *    (aprovadoEm null) — o gestor é o responsável jurídico/financeiro da rede.
 */

const DIAS_VALIDADE_CONVITE = 7

function urlTenant(slug: string): string {
  return `${env.TENANT_SCHEME}://${slug}.${env.DOMINIO_BASE}`
}

/** Preço vigente do assento (banco; cai no padrão de R$159,90 se ainda não houver registro). */
export async function precoAssentoVendedora(): Promise<number> {
  const c = await prisma.configAssentoVendedora.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
  return Number(c.preco)
}

/** Define manualmente o preço (admin). Só vale para novos assentos. */
export async function definirPrecoAssentoVendedora(preco: number): Promise<void> {
  await prisma.configAssentoVendedora.upsert({ where: { id: 1 }, update: { preco }, create: { id: 1, preco } })
}

/** Fim do próximo ciclo mensal (sem opção anual, mesmo padrão do Chat de Atendimento). */
export function proximoCicloFimAssentoVendedora(base = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, base.getDate(), base.getHours(), base.getMinutes(), base.getSeconds())
}

/**
 * Dispara o início da cobrança de um assento já aprovado (recém-solicitado pelo GESTOR, ou
 * acabado de aprovar por ele): simulado (sem MERCADOPAGO_ACCESS_TOKEN) ativa na hora; real cria
 * o preapproval no Mercado Pago e fica PENDENTE até o webhook confirmar.
 */
async function iniciarCobrancaAssento(assinaturaId: string): Promise<{ simulado: boolean; initPoint?: string }> {
  const a = await prisma.assinaturaVendedora.findUniqueOrThrow({ where: { id: assinaturaId } })
  const rede = await prisma.rede.findUniqueOrThrow({ where: { id: a.redeId }, select: { slug: true } })

  // Cupom DIAS_GRATIS (atrasa a 1ª cobrança): o desconto em valor (PERCENTUAL/VALOR_FIXO) já foi
  // aplicado em `valor`/`precoCheio` no momento da solicitação — aqui só falta o trial de dias.
  // O uso do cupom só é consumido agora, quando a cobrança realmente nasce (não na solicitação —
  // uma solicitação de GERENTE ainda pendente de aprovação não deve gastar o cupom).
  let diasGratis: number | undefined
  if (a.codigoPromoId) {
    const c = await prisma.codigoPromocional.findUnique({ where: { id: a.codigoPromoId } })
    if (c && c.ativo && (c.maxUsos == null || c.usos < c.maxUsos)) {
      await consumirCodigo(c.id)
      if (c.tipo === 'DIAS_GRATIS') diasGratis = c.dias ?? undefined
    }
  }

  if (!mpConfigurado()) {
    const cicloFimEm = diasGratis ? new Date(Date.now() + diasGratis * 86_400_000) : proximoCicloFimAssentoVendedora()
    await prisma.assinaturaVendedora.update({
      where: { id: assinaturaId },
      data: { status: 'ATIVA', simulada: true, cicloFimEm },
    })
    return { simulado: true }
  }

  const gestor = await prisma.usuario.findFirst({ where: { redeId: a.redeId, role: 'GESTOR' }, orderBy: { createdAt: 'asc' }, select: { email: true } })
  const pre = await criarPreapproval({
    reason: 'ZAIEZE — Conta de vendedora',
    valor: Number(a.valor),
    email: gestor?.email ?? '',
    redeSlug: rede.slug,
    backUrl: `${urlTenant(rede.slug)}/equipe`,
    diasGratis,
  })
  await prisma.assinaturaVendedora.update({ where: { id: assinaturaId }, data: { mpPreapprovalId: pre.id } })
  return { simulado: false, initPoint: pre.initPoint }
}

/**
 * Solicita um novo assento de vendedora: cria o Convite (VENDEDORA, ver convites.routes.ts) e a
 * AssinaturaVendedora na mesma transação. Se quem solicita é GESTOR/SUPER_ADMIN, segue direto
 * pro início da cobrança. Se é GERENTE, fica aguardando aprovação do gestor — nenhuma cobrança é
 * disparada até lá.
 */
export async function solicitarAssentoVendedora(input: {
  redeId: string
  lojaId: string
  equipeId?: string | null
  nome: string
  email: string
  telefone: string
  solicitadoPorId: string
  solicitadoPorRole: Role
  /** Cupom de desconto (distribuído pelo gestor da marca) — opcional. */
  codigoPromo?: string | null
}): Promise<
  | { ok: true; assinaturaId: string; aguardandoAprovacao: true }
  | { ok: true; assinaturaId: string; aguardandoAprovacao: false; simulado: boolean; initPoint?: string }
  | { ok: false; erro: string }
> {
  const email = input.email.toLowerCase()
  if (await prisma.usuario.findUnique({ where: { email }, select: { id: true } })) {
    return { ok: false, erro: 'Já existe um usuário com este e-mail.' }
  }

  const loja = await prisma.loja.findUnique({ where: { id: input.lojaId }, select: { redeId: true } })
  if (!loja || loja.redeId !== input.redeId) return { ok: false, erro: 'Loja inválida para esta rede.' }

  let valor = await precoAssentoVendedora()
  let codigoPromoId: string | null = null
  let precoCheio: number | null = null
  let descontoCiclosRestantes: number | null = null

  if (input.codigoPromo) {
    const c = await validarCodigo(input.codigoPromo, 'VENDEDORA')
    if (!c) return { ok: false, erro: 'Cupom inválido, expirado ou esgotado.' }
    codigoPromoId = c.id
    if (c.tipo === 'PERCENTUAL' || c.tipo === 'VALOR_FIXO') {
      precoCheio = valor
      valor = aplicarDesconto(valor, c)
      descontoCiclosRestantes = c.duracaoCiclos ?? null
    }
    // DIAS_GRATIS não muda o valor da mensalidade — só atrasa a 1ª cobrança (ver iniciarCobrancaAssento).
  }

  const token = randomBytes(24).toString('hex')
  const expiraEm = new Date(Date.now() + DIAS_VALIDADE_CONVITE * 86_400_000)
  const aprovadoDeCara = input.solicitadoPorRole !== 'GERENTE'

  const assinatura = await prisma.$transaction(async (tx) => {
    const convite = await tx.convite.create({
      data: {
        token, nome: input.nome.trim(), email, telefone: input.telefone, role: 'VENDEDORA',
        redeId: input.redeId, lojaId: input.lojaId, equipeId: input.equipeId ?? null,
        criadoPorId: input.solicitadoPorId, expiraEm,
      },
    })
    return tx.assinaturaVendedora.create({
      data: {
        redeId: input.redeId, conviteId: convite.id, valor,
        solicitadoPorId: input.solicitadoPorId,
        aprovadoEm: aprovadoDeCara ? new Date() : null,
        codigoPromoId, precoCheio, descontoCiclosRestantes,
      },
    })
  })

  if (!aprovadoDeCara) return { ok: true, assinaturaId: assinatura.id, aguardandoAprovacao: true }

  const r = await iniciarCobrancaAssento(assinatura.id)
  return { ok: true, assinaturaId: assinatura.id, aguardandoAprovacao: false, ...r }
}

/**
 * O GESTOR (dono da rede) aprova uma solicitação feita pelo GERENTE — só a partir daqui nasce a
 * cobrança de verdade (simulada ou preapproval real no Mercado Pago).
 */
export async function aprovarAssentoVendedora(
  id: string, gestorId: string,
): Promise<{ ok: true; simulado: boolean; initPoint?: string } | { ok: false; erro: string }> {
  const gestor = await prisma.usuario.findUnique({ where: { id: gestorId }, select: { redeId: true, role: true } })
  if (!gestor || (gestor.role !== 'GESTOR' && gestor.role !== 'SUPER_ADMIN')) return { ok: false, erro: 'Só o gestor da rede pode aprovar.' }

  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a) return { ok: false, erro: 'Solicitação não encontrada.' }
  if (gestor.role === 'GESTOR' && a.redeId !== gestor.redeId) return { ok: false, erro: 'Fora da sua rede.' }
  if (a.aprovadoEm) return { ok: false, erro: 'Essa solicitação já foi aprovada.' }
  if (a.status === 'CANCELADA') return { ok: false, erro: 'Essa solicitação foi recusada/cancelada.' }

  await prisma.assinaturaVendedora.update({ where: { id }, data: { aprovadoEm: new Date() } })
  const r = await iniciarCobrancaAssento(id)
  return { ok: true, ...r }
}

/** O GESTOR recusa uma solicitação pendente do GERENTE — cancela sem nunca ter cobrado nada. */
export async function recusarAssentoVendedora(id: string, gestorId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const gestor = await prisma.usuario.findUnique({ where: { id: gestorId }, select: { redeId: true, role: true } })
  if (!gestor || (gestor.role !== 'GESTOR' && gestor.role !== 'SUPER_ADMIN')) return { ok: false, erro: 'Só o gestor da rede pode recusar.' }

  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a) return { ok: false, erro: 'Solicitação não encontrada.' }
  if (gestor.role === 'GESTOR' && a.redeId !== gestor.redeId) return { ok: false, erro: 'Fora da sua rede.' }
  if (a.aprovadoEm) return { ok: false, erro: 'Já foi aprovada — cancele em vez de recusar.' }

  await prisma.$transaction(async (tx) => {
    await tx.assinaturaVendedora.update({ where: { id }, data: { status: 'CANCELADA' } })
    if (a.conviteId) await tx.convite.delete({ where: { id: a.conviteId } })
  })
  return { ok: true }
}

/**
 * Ativa/renova o ciclo — chamado quando o pagamento é confirmado (webhook MP) ou no modo simulado.
 * Se o assento tem desconto por prazo (cupom PERCENTUAL/VALOR_FIXO com duracaoCiclos), decrementa
 * a cada renovação; ao zerar, reverte o valor ao preço cheio (e atualiza a recorrência no MP,
 * quando real — sem isso o preapproval continuaria cobrando o valor com desconto pra sempre).
 */
export async function confirmarCicloAssentoVendedora(id: string): Promise<void> {
  const a = await prisma.assinaturaVendedora.findUniqueOrThrow({ where: { id } })
  let valor: number | undefined
  let descontoCiclosRestantes: number | null | undefined
  let precoCheio: number | null | undefined

  if (a.descontoCiclosRestantes != null) {
    const restantes = a.descontoCiclosRestantes - 1
    if (restantes <= 0 && a.precoCheio != null) {
      valor = Number(a.precoCheio)
      descontoCiclosRestantes = null
      precoCheio = null
      if (a.mpPreapprovalId) await atualizarValorPreapproval(a.mpPreapprovalId, valor)
    } else {
      descontoCiclosRestantes = restantes
    }
  }

  await prisma.assinaturaVendedora.update({
    where: { id },
    data: {
      status: 'ATIVA', cicloFimEm: proximoCicloFimAssentoVendedora(), cancelamentoSolicitadoEm: null, cancelamentoOrigem: null,
      ...(valor !== undefined ? { valor } : {}),
      ...(descontoCiclosRestantes !== undefined ? { descontoCiclosRestantes } : {}),
      ...(precoCheio !== undefined ? { precoCheio } : {}),
    },
  })
}

/**
 * Convite aceito (Usuario criado) — liga o assento pendente/ativo ao Usuario recém-criado.
 * Chamado por convites.routes.ts POST /:token/aceitar (Fase 2).
 */
export async function resolverConviteAceito(conviteId: string, vendedoraId: string): Promise<void> {
  const a = await prisma.assinaturaVendedora.findUnique({ where: { conviteId } })
  if (!a) return
  await prisma.assinaturaVendedora.update({ where: { id: a.id }, data: { vendedoraId } })
}

/**
 * Vendedora desligada: o assento fica RESERVADO (vendedoraId volta a null, status continua ATIVA)
 * pra reatribuir a uma pessoa nova sem cobrar de novo no mesmo ciclo — não cancela sozinho.
 */
export async function liberarAssentoDaVendedora(vendedoraId: string): Promise<void> {
  await prisma.assinaturaVendedora.updateMany({
    where: { vendedoraId, status: { not: 'CANCELADA' } },
    data: { vendedoraId: null },
  })
}

/**
 * Cancelamento por FIM DE CICLO (vale para MP e o gestor): marca o cancelamento, mas MANTÉM o
 * acesso até `cicloFimEm`. Se o ciclo já venceu (ou nunca chegou a ser cobrado), o corte é
 * aplicado na hora.
 */
export async function solicitarCancelamentoAssentoVendedora(id: string, origem: string): Promise<{ acessoAte: Date | null }> {
  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a || a.status === 'CANCELADA') return { acessoAte: a?.cicloFimEm ?? null }

  if (!a.cancelamentoSolicitadoEm) {
    await prisma.assinaturaVendedora.update({ where: { id }, data: { cancelamentoSolicitadoEm: new Date(), cancelamentoOrigem: origem } })
  }
  await aplicarFimDeCicloAssentoVendedora(id)
  return { acessoAte: a.cicloFimEm }
}

/** Reativa um assento cujo cancelamento foi agendado mas o ciclo ainda não venceu. */
export async function reativarAssentoVendedora(id: string): Promise<boolean> {
  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a || a.status === 'CANCELADA') return false
  await prisma.assinaturaVendedora.update({ where: { id }, data: { cancelamentoSolicitadoEm: null, cancelamentoOrigem: null } })
  return true
}

/** Aplica a regra de fim de ciclo: se cancelamento agendado e ciclo vencido, encerra. */
export async function aplicarFimDeCicloAssentoVendedora(id: string): Promise<void> {
  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a || a.status === 'CANCELADA') return
  const vencido = a.cancelamentoSolicitadoEm && a.cicloFimEm && a.cicloFimEm.getTime() <= Date.now()
  if (vencido) await prisma.assinaturaVendedora.update({ where: { id }, data: { status: 'CANCELADA' } })
}

/** Varredura (cron): encerra todos os assentos com ciclo vencido. Retorna quantos cortou. */
export async function encerrarAssentoVendedoraVencidos(): Promise<number> {
  const vencidos = await prisma.assinaturaVendedora.findMany({
    where: { status: { not: 'CANCELADA' }, cancelamentoSolicitadoEm: { not: null }, cicloFimEm: { lte: new Date() } },
    select: { id: true },
  })
  for (const a of vencidos) await aplicarFimDeCicloAssentoVendedora(a.id)
  return vencidos.length
}

/** O assento desta vendedora está ativo? Usado como gate de acesso (banner, não bloqueio duro). */
export async function assentoVendedoraAtivo(vendedoraId: string): Promise<boolean> {
  const a = await prisma.assinaturaVendedora.findFirst({ where: { vendedoraId, status: 'ATIVA' }, select: { id: true } })
  return !!a
}

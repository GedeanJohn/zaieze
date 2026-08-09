import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { criarPreapproval, atualizarValorPreapproval, cancelarPreapproval, mpConfigurado } from '../assinaturas/mercadopago.service'
import { precoParaQuantidade } from './faixa-desconto.service'

/**
 * Cobrança CONSOLIDADA por marca: substitui a cobrança individual por assento (ver
 * assinatura-vendedora.service.ts, que agora só cuida da MEMBRESIA — quem ocupa a vaga). O valor
 * reflete a faixa de desconto (faixa-desconto.service.ts) pra quantidade de assentos ATIVA e
 * PAGOS (assento gratuito por cupom não conta). Mesmo padrão de ciclo/cancelamento de
 * assinatura.service.ts (plano por rede).
 */

function urlTenant(slug: string): string {
  return `${env.TENANT_SCHEME}://${slug}.${env.DOMINIO_BASE}`
}

export function proximoCicloFimVendedoraRede(base = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, base.getDate(), base.getHours(), base.getMinutes(), base.getSeconds())
}

/** Assentos que definem a faixa de desconto: ATIVA e com valor pago (cupom que zera não conta). */
async function contarAssentosPagos(redeId: string): Promise<number> {
  return prisma.assinaturaVendedora.count({ where: { redeId, status: 'ATIVA', valor: { gt: 0 } } })
}

/** Rede tem pelo menos 1 cadeira de vendedora paga e ATIVA agora? Usado pra liberar as IAs sem
 *  add-on próprio (custo baixo mas real, ver ia.service.ts) só pra quem já é assinante pagante —
 *  não pra qualquer conta com acesso básico/gratuito. */
export async function temAssentoVendedoraPagante(redeId: string): Promise<boolean> {
  return (await contarAssentosPagos(redeId)) > 0
}

/**
 * (Re)abre a cobrança consolidada da marca (nasceu agora ou estava CANCELADA e ganhou uma
 * vendedora paga de novo). Sem token do MP, ativa direto (simulado); com token, cria o
 * preapproval real e devolve o link de pagamento.
 */
async function abrirAssinaturaRede(redeId: string, valor: number, qtd: number): Promise<{ initPoint?: string }> {
  const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { slug: true } })
  const baseData = { valor, qtdPaga: qtd, cancelamentoSolicitadoEm: null, cancelamentoOrigem: null, valorProximoCiclo: null, mpPreapprovalId: null }

  if (!mpConfigurado()) {
    await prisma.assinaturaVendedoraRede.upsert({
      where: { redeId },
      create: { redeId, ...baseData, status: 'ATIVA', simulada: true, cicloFimEm: proximoCicloFimVendedoraRede() },
      update: { ...baseData, status: 'ATIVA', simulada: true, cicloFimEm: proximoCicloFimVendedoraRede() },
    })
    return {}
  }

  const registro = await prisma.assinaturaVendedoraRede.upsert({
    where: { redeId },
    create: { redeId, ...baseData, status: 'PENDENTE' },
    update: { ...baseData, status: 'PENDENTE' },
  })
  const gestor = await prisma.usuario.findFirst({ where: { redeId, role: 'GESTOR' }, orderBy: { createdAt: 'asc' }, select: { email: true } })
  const pre = await criarPreapproval({
    reason: 'ZAIEZE — Contas de vendedora',
    valor,
    email: gestor?.email ?? '',
    redeSlug: rede.slug,
    backUrl: `${urlTenant(rede.slug)}/equipe`,
  })
  await prisma.assinaturaVendedoraRede.update({ where: { id: registro.id }, data: { mpPreapprovalId: pre.id } })
  return { initPoint: pre.initPoint }
}

/**
 * Recalcula a cobrança consolidada a partir da quantidade ATUAL de assentos pagos — chamar
 * sempre que essa quantidade puder ter mudado (assento criado/aprovado/cancelado, cupom
 * aplicado/removido). Upgrade (valor sobe) aplica na hora; downgrade (valor cai) só na próxima
 * renovação (ver confirmarCicloAssentoVendedoraRede) — mesmo princípio de "acesso garantido até o
 * fim do que já foi pago" usado no resto da base.
 */
export async function recomputarAssinaturaRede(redeId: string): Promise<{ initPoint?: string }> {
  const qtd = await contarAssentosPagos(redeId)
  const novoValor = await precoParaQuantidade(qtd)
  const atual = await prisma.assinaturaVendedoraRede.findUnique({ where: { redeId } })

  if (!atual || atual.status === 'CANCELADA') {
    if (qtd === 0 || novoValor <= 0) return {}
    return abrirAssinaturaRede(redeId, novoValor, qtd)
  }

  // Ganhou um assento pago de novo antes do corte agendado (ver ramo de qtd=0 abaixo) — desfaz o
  // cancelamento automático, a marca voltou a ter o que cobrar.
  const desfazCancelamentoAuto = qtd > 0 && atual.cancelamentoSolicitadoEm != null

  const valorAtual = Number(atual.valor)
  if (novoValor === valorAtual) {
    if (atual.qtdPaga !== qtd || atual.valorProximoCiclo !== null || desfazCancelamentoAuto) {
      await prisma.assinaturaVendedoraRede.update({
        where: { id: atual.id },
        data: {
          qtdPaga: qtd, valorProximoCiclo: null,
          ...(desfazCancelamentoAuto ? { cancelamentoSolicitadoEm: null, cancelamentoOrigem: null } : {}),
        },
      })
    }
    return {}
  }

  if (novoValor > valorAtual) {
    if (atual.status === 'ATIVA' && atual.mpPreapprovalId) await atualizarValorPreapproval(atual.mpPreapprovalId, novoValor)
    await prisma.assinaturaVendedoraRede.update({
      where: { id: atual.id },
      data: {
        valor: novoValor, qtdPaga: qtd, valorProximoCiclo: null,
        ...(desfazCancelamentoAuto ? { cancelamentoSolicitadoEm: null, cancelamentoOrigem: null } : {}),
      },
    })
    return {}
  }

  // Última vendedora paga foi embora: não tem o que cobrar de novo no próximo ciclo (o MP
  // rejeita preapproval de R$0) — agenda o cancelamento da assinatura em vez de "baixar pra
  // zero". Mantém o mesmo princípio: acesso/cobrança já paga segue garantida até `cicloFimEm`.
  if (novoValor <= 0) {
    await prisma.assinaturaVendedoraRede.update({
      where: { id: atual.id },
      data: { qtdPaga: qtd, valorProximoCiclo: null, cancelamentoSolicitadoEm: atual.cancelamentoSolicitadoEm ?? new Date(), cancelamentoOrigem: atual.cancelamentoOrigem ?? 'GESTOR' },
    })
    await aplicarFimDeCicloAssentoVendedoraRede(redeId)
    return {}
  }

  // Downgrade (ainda sobra pelo menos 1 assento pago): guarda o alvo, só aplica na renovação.
  await prisma.assinaturaVendedoraRede.update({
    where: { id: atual.id },
    data: { valorProximoCiclo: novoValor, qtdPaga: qtd },
  })
  return {}
}

/**
 * Chamada pelo webhook do MP quando o preapproval é confirmado (authorized) — é o momento exato
 * em que o ciclo anterior vira. Antes de fixar o valor do novo ciclo, finaliza qualquer assento
 * com cancelamento agendado (a carência dele ia exatamente até aqui — ver
 * assinatura-vendedora.service.ts): a partir de agora eles saem de vez da contagem paga.
 */
export async function confirmarCicloAssentoVendedoraRede(id: string): Promise<void> {
  const a = await prisma.assinaturaVendedoraRede.findUniqueOrThrow({ where: { id } })

  await prisma.assinaturaVendedora.updateMany({
    where: { redeId: a.redeId, status: 'ATIVA', cancelamentoSolicitadoEm: { not: null } },
    data: { status: 'CANCELADA' },
  })

  const qtd = await contarAssentosPagos(a.redeId)
  const valor = await precoParaQuantidade(qtd)

  if (valor <= 0) {
    // Ninguém mais pagando: não tem o que renovar (MP rejeita preapproval de R$0) — encerra de
    // vez e avisa o MP pra não tentar cobrar nada no próximo mês.
    if (!a.simulada && a.mpPreapprovalId) await cancelarPreapproval(a.mpPreapprovalId).catch(() => {})
    await prisma.assinaturaVendedoraRede.update({ where: { id }, data: { status: 'CANCELADA', valorProximoCiclo: null } })
    return
  }

  if (!a.simulada && a.mpPreapprovalId && valor !== Number(a.valor)) {
    await atualizarValorPreapproval(a.mpPreapprovalId, valor).catch(() => { /* tenta de novo no próximo ciclo */ })
  }

  await prisma.assinaturaVendedoraRede.update({
    where: { id },
    data: {
      status: 'ATIVA', valor, qtdPaga: qtd, valorProximoCiclo: null,
      cicloFimEm: proximoCicloFimVendedoraRede(),
      cancelamentoSolicitadoEm: null, cancelamentoOrigem: null,
    },
  })
}

/** Cancelamento por FIM DE CICLO: mantém acesso até `cicloFimEm`; corta na hora se já venceu. */
export async function solicitarCancelamentoAssentoVendedoraRede(redeId: string, origem: string): Promise<{ acessoAte: Date | null }> {
  const a = await prisma.assinaturaVendedoraRede.findUnique({ where: { redeId } })
  if (!a || a.status === 'CANCELADA') return { acessoAte: a?.cicloFimEm ?? null }

  if (!a.cancelamentoSolicitadoEm) {
    await prisma.assinaturaVendedoraRede.update({ where: { redeId }, data: { cancelamentoSolicitadoEm: new Date(), cancelamentoOrigem: origem } })
  }
  await aplicarFimDeCicloAssentoVendedoraRede(redeId)
  return { acessoAte: a.cicloFimEm }
}

/** Reativa uma cobrança consolidada cujo cancelamento foi agendado mas o ciclo ainda não venceu. */
export async function reativarAssentoVendedoraRede(redeId: string): Promise<boolean> {
  const a = await prisma.assinaturaVendedoraRede.findUnique({ where: { redeId } })
  if (!a || a.status === 'CANCELADA') return false
  await prisma.assinaturaVendedoraRede.update({ where: { redeId }, data: { cancelamentoSolicitadoEm: null, cancelamentoOrigem: null } })
  return true
}

/** Aplica a regra de fim de ciclo: se há cancelamento agendado e o ciclo já venceu, encerra. */
export async function aplicarFimDeCicloAssentoVendedoraRede(redeId: string): Promise<void> {
  const a = await prisma.assinaturaVendedoraRede.findUnique({ where: { redeId } })
  if (!a || a.status === 'CANCELADA') return
  const vencido = a.cancelamentoSolicitadoEm && a.cicloFimEm && a.cicloFimEm.getTime() <= Date.now()
  if (vencido) await prisma.assinaturaVendedoraRede.update({ where: { redeId }, data: { status: 'CANCELADA' } })
}

/** Varredura (cron): encerra todas as cobranças consolidadas com ciclo vencido. Retorna quantas cortou. */
export async function encerrarAssentoVendedoraRedeVencidos(): Promise<number> {
  const vencidas = await prisma.assinaturaVendedoraRede.findMany({
    where: { status: { not: 'CANCELADA' }, cancelamentoSolicitadoEm: { not: null }, cicloFimEm: { lte: new Date() } },
    select: { redeId: true },
  })
  for (const a of vencidas) await aplicarFimDeCicloAssentoVendedoraRede(a.redeId)
  return vencidas.length
}

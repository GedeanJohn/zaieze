import { prisma } from '../../lib/prisma'

/** Fim do próximo ciclo mensal (assinatura do Corretor de Moda não tem opção anual). */
export function proximoCicloFimAssessor(base = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, base.getDate(), base.getHours(), base.getMinutes(), base.getSeconds())
}

/** Ativa/renova o ciclo — chamado quando o pagamento é confirmado (webhook MP) ou no modo simulado. */
export async function confirmarCicloAssessor(assessorId: string): Promise<void> {
  await prisma.assinaturaAssessor.update({
    where: { assessorId },
    data: { status: 'ATIVA', cicloFimEm: proximoCicloFimAssessor(), cancelamentoSolicitadoEm: null, cancelamentoOrigem: null },
  })
}

/**
 * Cancelamento por FIM DE CICLO (vale para MP e a própria assessora): marca o cancelamento,
 * mas MANTÉM o acesso até `cicloFimEm`. Se o ciclo já venceu, o corte é aplicado na hora.
 */
export async function solicitarCancelamentoAssessor(assessorId: string, origem: string): Promise<{ acessoAte: Date | null }> {
  const a = await prisma.assinaturaAssessor.findUnique({ where: { assessorId } })
  if (!a || a.status === 'CANCELADA') return { acessoAte: a?.cicloFimEm ?? null }

  if (!a.cancelamentoSolicitadoEm) {
    await prisma.assinaturaAssessor.update({ where: { id: a.id }, data: { cancelamentoSolicitadoEm: new Date(), cancelamentoOrigem: origem } })
  }
  await aplicarFimDeCicloAssessor(assessorId)
  return { acessoAte: a.cicloFimEm }
}

/** Reativa uma assinatura cujo cancelamento foi agendado mas o ciclo ainda não venceu. */
export async function reativarAssinaturaAssessor(assessorId: string): Promise<boolean> {
  const a = await prisma.assinaturaAssessor.findUnique({ where: { assessorId } })
  if (!a || a.status === 'CANCELADA') return false
  await prisma.assinaturaAssessor.update({ where: { id: a.id }, data: { cancelamentoSolicitadoEm: null, cancelamentoOrigem: null } })
  return true
}

/** Aplica a regra de fim de ciclo: se cancelamento agendado e ciclo vencido, encerra. */
export async function aplicarFimDeCicloAssessor(assessorId: string): Promise<void> {
  const a = await prisma.assinaturaAssessor.findUnique({ where: { assessorId } })
  if (!a || a.status === 'CANCELADA') return
  const vencido = a.cancelamentoSolicitadoEm && a.cicloFimEm && a.cicloFimEm.getTime() <= Date.now()
  if (vencido) await prisma.assinaturaAssessor.update({ where: { id: a.id }, data: { status: 'CANCELADA' } })
}

/** Varredura (cron): encerra todas as assinaturas de assessora com ciclo vencido. Retorna quantas cortou. */
export async function encerrarAssessorasVencidas(): Promise<number> {
  const vencidas = await prisma.assinaturaAssessor.findMany({
    where: { status: { not: 'CANCELADA' }, cancelamentoSolicitadoEm: { not: null }, cicloFimEm: { lte: new Date() } },
    select: { assessorId: true },
  })
  for (const a of vencidas) await aplicarFimDeCicloAssessor(a.assessorId)
  return vencidas.length
}

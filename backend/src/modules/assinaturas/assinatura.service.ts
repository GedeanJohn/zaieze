import { prisma } from '../../lib/prisma'
import { limparMidiaDaRede } from '../midia/limpeza.service'

export type OrigemCancelamento = 'LOJISTA' | 'ADMIN' | 'MERCADO_PAGO' | 'DISTRATO_TERMOS'

/** Fim do próximo ciclo mensal a partir de uma data (default: agora). */
export function proximoCicloFim(base = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, base.getDate(), base.getHours(), base.getMinutes(), base.getSeconds())
}

/**
 * Ativa/renova o ciclo: assinatura ATIVA, rede no ar e acesso garantido por +1 mês.
 * Usado quando o pagamento é confirmado (webhook MP) ou no provisionamento simulado.
 */
export async function confirmarCiclo(redeId: string): Promise<void> {
  await prisma.$transaction([
    prisma.assinatura.update({
      where: { redeId },
      data: { status: 'ATIVA', cicloFimEm: proximoCicloFim(), cancelamentoSolicitadoEm: null, cancelamentoOrigem: null },
    }),
    prisma.rede.update({ where: { id: redeId }, data: { ativo: true } }),
  ])
}

/**
 * Cancelamento por FIM DE CICLO (vale para MP, lojista e admin):
 * marca o cancelamento, mas MANTÉM o acesso até `cicloFimEm`. Se o ciclo já venceu,
 * o corte é aplicado na hora.
 */
export async function solicitarCancelamento(redeId: string, origem: OrigemCancelamento): Promise<{ acessoAte: Date | null }> {
  const a = await prisma.assinatura.findUnique({ where: { redeId } })
  if (!a || a.status === 'CANCELADA') return { acessoAte: a?.cicloFimEm ?? null }

  if (!a.cancelamentoSolicitadoEm) {
    await prisma.assinatura.update({
      where: { redeId },
      data: { cancelamentoSolicitadoEm: new Date(), cancelamentoOrigem: origem },
    })
  }
  await aplicarFimDeCiclo(redeId) // corta já se o ciclo expirou
  return { acessoAte: a.cicloFimEm }
}

/** Reativa uma assinatura cujo cancelamento foi agendado mas o ciclo ainda não venceu. */
export async function reativarAssinatura(redeId: string): Promise<boolean> {
  const a = await prisma.assinatura.findUnique({ where: { redeId } })
  if (!a || a.status === 'CANCELADA') return false // já encerrada → precisa assinar de novo
  await prisma.assinatura.update({
    where: { redeId },
    data: { cancelamentoSolicitadoEm: null, cancelamentoOrigem: null },
  })
  return true
}

/**
 * Aplica a regra de fim de ciclo a UMA rede: se há cancelamento agendado e o ciclo
 * já venceu, encerra a assinatura e desativa a rede (corta o acesso de todas as lojas).
 */
export async function aplicarFimDeCiclo(redeId: string): Promise<void> {
  const a = await prisma.assinatura.findUnique({ where: { redeId } })
  if (!a || a.status === 'CANCELADA') return
  const vencido = a.cancelamentoSolicitadoEm && a.cicloFimEm && a.cicloFimEm.getTime() <= Date.now()
  if (vencido) {
    await prisma.$transaction([
      prisma.assinatura.update({ where: { redeId }, data: { status: 'CANCELADA' } }),
      prisma.rede.update({ where: { id: redeId }, data: { ativo: false } }),
    ])
    // Marca encerrou a assinatura (cancelou + ciclo vencido) → libera o R2 apagando a mídia dela.
    // Fire-and-forget: roda uma única vez (próximas chamadas saem cedo por status CANCELADA).
    void limparMidiaDaRede(redeId).catch(() => { /* tenta de novo num próximo gatilho */ })
  }
}

/** Varredura (cron/admin): encerra todas as assinaturas com ciclo vencido. Retorna quantas cortou. */
export async function encerrarAssinaturasVencidas(): Promise<number> {
  const vencidas = await prisma.assinatura.findMany({
    where: { status: { not: 'CANCELADA' }, cancelamentoSolicitadoEm: { not: null }, cicloFimEm: { lte: new Date() } },
    select: { redeId: true },
  })
  for (const a of vencidas) await aplicarFimDeCiclo(a.redeId)
  return vencidas.length
}

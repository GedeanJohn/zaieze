import { prisma } from '../../lib/prisma'

/** Preço vigente do add-on (banco; cai no padrão de R$39 se ainda não houver registro). */
export async function precoChatAtendimento(): Promise<number> {
  const c = await prisma.configChatAtendimento.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
  return Number(c.preco)
}

/** Define manualmente o preço (admin). Só vale para novas assinaturas. */
export async function definirPrecoChatAtendimento(preco: number): Promise<void> {
  await prisma.configChatAtendimento.upsert({ where: { id: 1 }, update: { preco }, create: { id: 1, preco } })
}

/** Fim do próximo ciclo mensal (sem opção anual, mesmo padrão do Assessor de Moda). */
export function proximoCicloFimChatAtendimento(base = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, base.getDate(), base.getHours(), base.getMinutes(), base.getSeconds())
}

/** Ativa/renova o ciclo — chamado quando o pagamento é confirmado (webhook MP) ou no modo simulado. */
export async function confirmarCicloChatAtendimento(id: string): Promise<void> {
  await prisma.assinaturaChatAtendimento.update({
    where: { id },
    data: { status: 'ATIVA', cicloFimEm: proximoCicloFimChatAtendimento(), cancelamentoSolicitadoEm: null, cancelamentoOrigem: null },
  })
}

/**
 * Atribui (ou reatribui) a vendedora que esta assinatura vai atender. Só o GESTOR/SUPER_ADMIN da
 * rede dona da assinatura pode chamar (validado na rota). Uma vendedora não pode estar atribuída
 * a mais de uma assinatura ATIVA/PENDENTE ao mesmo tempo — evita dois "Chat de Atendimento"
 * competindo pela mesma carteira.
 */
export async function atribuirVendedoraChatAtendimento(
  assinaturaId: string, redeId: string, vendedoraId: string | null,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const assinatura = await prisma.assinaturaChatAtendimento.findUnique({ where: { id: assinaturaId } })
  if (!assinatura || assinatura.redeId !== redeId) return { ok: false, erro: 'Assinatura não encontrada.' }

  if (vendedoraId) {
    const vendedora = await prisma.usuario.findFirst({
      where: { id: vendedoraId, role: 'VENDEDORA', loja: { redeId } },
      select: { id: true },
    })
    if (!vendedora) return { ok: false, erro: 'Vendedora não encontrada nesta rede.' }

    const jaAtribuida = await prisma.assinaturaChatAtendimento.findFirst({
      where: { vendedoraId, status: { in: ['ATIVA', 'PENDENTE'] }, id: { not: assinaturaId } },
      select: { id: true },
    })
    if (jaAtribuida) return { ok: false, erro: 'Essa vendedora já está atribuída a outra assinatura do Chat de Atendimento.' }
  }

  await prisma.assinaturaChatAtendimento.update({ where: { id: assinaturaId }, data: { vendedoraId } })
  return { ok: true }
}

/**
 * Cancelamento por FIM DE CICLO (vale para MP e o gestor): marca o cancelamento, mas MANTÉM o
 * acesso até `cicloFimEm`. Se o ciclo já venceu, o corte é aplicado na hora.
 */
export async function solicitarCancelamentoChatAtendimento(id: string, origem: string): Promise<{ acessoAte: Date | null }> {
  const a = await prisma.assinaturaChatAtendimento.findUnique({ where: { id } })
  if (!a || a.status === 'CANCELADA') return { acessoAte: a?.cicloFimEm ?? null }

  if (!a.cancelamentoSolicitadoEm) {
    await prisma.assinaturaChatAtendimento.update({ where: { id }, data: { cancelamentoSolicitadoEm: new Date(), cancelamentoOrigem: origem } })
  }
  await aplicarFimDeCicloChatAtendimento(id)
  return { acessoAte: a.cicloFimEm }
}

/** Reativa uma assinatura cujo cancelamento foi agendado mas o ciclo ainda não venceu. */
export async function reativarChatAtendimento(id: string): Promise<boolean> {
  const a = await prisma.assinaturaChatAtendimento.findUnique({ where: { id } })
  if (!a || a.status === 'CANCELADA') return false
  await prisma.assinaturaChatAtendimento.update({ where: { id }, data: { cancelamentoSolicitadoEm: null, cancelamentoOrigem: null } })
  return true
}

/** Aplica a regra de fim de ciclo: se cancelamento agendado e ciclo vencido, encerra. */
export async function aplicarFimDeCicloChatAtendimento(id: string): Promise<void> {
  const a = await prisma.assinaturaChatAtendimento.findUnique({ where: { id } })
  if (!a || a.status === 'CANCELADA') return
  const vencido = a.cancelamentoSolicitadoEm && a.cicloFimEm && a.cicloFimEm.getTime() <= Date.now()
  if (vencido) await prisma.assinaturaChatAtendimento.update({ where: { id }, data: { status: 'CANCELADA' } })
}

/** Varredura (cron): encerra todas as assinaturas com ciclo vencido. Retorna quantas cortou. */
export async function encerrarChatAtendimentoVencidos(): Promise<number> {
  const vencidas = await prisma.assinaturaChatAtendimento.findMany({
    where: { status: { not: 'CANCELADA' }, cancelamentoSolicitadoEm: { not: null }, cicloFimEm: { lte: new Date() } },
    select: { id: true },
  })
  for (const a of vencidas) await aplicarFimDeCicloChatAtendimento(a.id)
  return vencidas.length
}

/** O add-on está ativo para ESTA vendedora (alguma assinatura da rede atribuída a ela)? Usado no ponto de interceptação. */
export async function chatAtendimentoAtivo(vendedoraId: string): Promise<boolean> {
  const a = await prisma.assinaturaChatAtendimento.findFirst({ where: { vendedoraId, status: 'ATIVA' }, select: { id: true } })
  return !!a
}

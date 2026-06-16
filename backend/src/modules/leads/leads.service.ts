import type { StatusLead } from '@prisma/client'
import { prisma } from '../../lib/prisma'

// Etapas "abertas" do funil (em andamento) × "fechadas" (encerradas).
export const ETAPAS_ABERTAS: StatusLead[] = ['ENTROU', 'ATENDIDO', 'NEGOCIANDO']
export const ETAPAS_FECHADAS: StatusLead[] = ['CONVERTIDO', 'PERDIDO']

const SLA_PADRAO = { ENTROU: 30, ATENDIDO: 1440, NEGOCIANDO: 4320 }

/** Limites de SLA (min) por etapa, conforme a regra da rede. */
export async function limitesSla(redeId: string | null): Promise<Record<'ENTROU' | 'ATENDIDO' | 'NEGOCIANDO', number>> {
  if (!redeId) return { ...SLA_PADRAO }
  const r = await prisma.rede.findUnique({ where: { id: redeId }, select: { slaEntrouMin: true, slaAtendidoMin: true, slaNegociandoMin: true } })
  return r
    ? { ENTROU: r.slaEntrouMin, ATENDIDO: r.slaAtendidoMin, NEGOCIANDO: r.slaNegociandoMin }
    : { ...SLA_PADRAO }
}

/** Prazo da etapa (agora + limite da etapa). Etapas fechadas não têm prazo corrente. */
function prazoDaEtapa(etapa: StatusLead, limites: Record<string, number>, base = Date.now()): Date {
  const min = limites[etapa] ?? SLA_PADRAO.NEGOCIANDO
  return new Date(base + min * 60_000)
}

/** Prazo de ENTROU para criar um ciclo (compat. com o catálogo/webhook). */
export async function prazoDoLead(redeId: string | null): Promise<Date> {
  return prazoDaEtapa('ENTROU', await limitesSla(redeId))
}

/**
 * Garante UM ciclo aberto para o cliente (reuso × novo ciclo):
 * - se já existe ciclo aberto (ENTROU/ATENDIDO/NEGOCIANDO), reaproveita;
 * - se todos estão fechados (ou não há), abre um NOVO ciclo (ENTROU).
 */
export async function garantirCicloAberto(params: {
  lojaId: string
  vendedoraId: string
  redeId: string | null
  clienteId?: string | null
  telefone?: string | null
  nome?: string | null
  slugCatalogo?: string | null
  produtoId?: string | null
}): Promise<{ leadId: string; novo: boolean }> {
  const filtroCliente = params.clienteId
    ? { clienteId: params.clienteId }
    : params.telefone
      ? { telefone: params.telefone }
      : null

  if (filtroCliente) {
    const aberto = await prisma.lead.findFirst({
      where: { lojaId: params.lojaId, status: { in: ETAPAS_ABERTAS }, ...filtroCliente },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (aberto) return { leadId: aberto.id, novo: false }
  }

  const prazoEm = await prazoDoLead(params.redeId)
  const lead = await prisma.lead.create({
    data: {
      lojaId: params.lojaId, vendedoraId: params.vendedoraId, clienteId: params.clienteId ?? undefined,
      telefone: params.telefone ?? undefined, nome: params.nome ?? undefined,
      slugCatalogo: params.slugCatalogo ?? undefined, produtoId: params.produtoId ?? undefined,
      status: 'ENTROU', etapaDesde: new Date(), prazoEm,
    },
    select: { id: true },
  })
  return { leadId: lead.id, novo: true }
}

/**
 * Marca como ATENDIDO o ciclo em ENTROU do cliente (a vendedora respondeu).
 * Avança a etapa e reinicia o prazo para o SLA de "atendido".
 */
export async function marcarLeadAtendido(params: { lojaId: string; clienteId?: string | null; telefone?: string | null }) {
  const filtro = params.clienteId ? { clienteId: params.clienteId } : params.telefone ? { telefone: params.telefone } : null
  if (!filtro) return
  const lead = await prisma.lead.findFirst({
    where: { lojaId: params.lojaId, status: 'ENTROU', ...filtro },
    orderBy: { createdAt: 'desc' },
    include: { loja: { select: { redeId: true } } },
  })
  if (!lead) return
  const limites = await limitesSla(lead.loja.redeId)
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: 'ATENDIDO', atendidoEm: new Date(), etapaDesde: new Date(), prazoEm: prazoDaEtapa('ATENDIDO', limites) },
  })
}

/** Move um ciclo para outra etapa (manual). Fecha (CONVERTIDO/PERDIDO) ou reabre o prazo. */
export async function moverEtapa(params: { leadId: string; etapa: StatusLead; motivoPerda?: string | null; redeId: string | null }) {
  const fechando = ETAPAS_FECHADAS.includes(params.etapa)
  const limites = await limitesSla(params.redeId)
  return prisma.lead.update({
    where: { id: params.leadId },
    data: {
      status: params.etapa,
      etapaDesde: new Date(),
      prazoEm: fechando ? new Date() : prazoDaEtapa(params.etapa, limites),
      fechadoEm: fechando ? new Date() : null,
      motivoPerda: params.etapa === 'PERDIDO' ? params.motivoPerda ?? null : null,
      atendidoEm: params.etapa === 'ENTROU' ? null : undefined,
    },
    include: { vendedora: { select: { id: true, nome: true } }, cliente: { select: { id: true, nome: true } } },
  })
}

/**
 * Converte automaticamente o ciclo aberto do cliente quando uma venda é registrada.
 * Prefere o ciclo da própria vendedora da venda; senão, qualquer ciclo aberto.
 */
export async function converterCicloPorVenda(params: { lojaId: string; clienteId: string; vendedoraId: string; vendaId: string }) {
  const lead =
    (await prisma.lead.findFirst({
      where: { lojaId: params.lojaId, clienteId: params.clienteId, vendedoraId: params.vendedoraId, status: { in: ETAPAS_ABERTAS } },
      orderBy: { createdAt: 'desc' }, select: { id: true },
    })) ??
    (await prisma.lead.findFirst({
      where: { lojaId: params.lojaId, clienteId: params.clienteId, status: { in: ETAPAS_ABERTAS } },
      orderBy: { createdAt: 'desc' }, select: { id: true },
    }))
  if (!lead) return
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status: 'CONVERTIDO', vendaId: params.vendaId, fechadoEm: new Date(), etapaDesde: new Date() },
  })
}

/**
 * Escolhe a vendedora ativa mais ociosa da loja (menos ciclos abertos), excluindo a atual.
 */
export async function escolherVendedoraDisponivel(lojaId: string, excluirId: string): Promise<string | null> {
  const vendedoras = await prisma.usuario.findMany({
    where: { lojaId, role: 'VENDEDORA', ativo: true, id: { not: excluirId } },
    select: { id: true, _count: { select: { leads: { where: { status: { in: ETAPAS_ABERTAS } } } } } },
  })
  if (vendedoras.length === 0) return null
  vendedoras.sort((a, b) => a._count.leads - b._count.leads)
  return vendedoras[0].id
}

/** Redistribui um ciclo: move o ciclo e a carteira, volta para ENTROU e reabre o SLA de entrada. */
export async function redistribuirLead(leadId: string, novaVendedoraId: string, redeId: string | null) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } })
  if (!lead) return null
  const prazoEm = await prazoDoLead(redeId)
  return prisma.$transaction(async (tx) => {
    if (lead.clienteId) await tx.cliente.update({ where: { id: lead.clienteId }, data: { vendedoraId: novaVendedoraId } })
    return tx.lead.update({
      where: { id: leadId },
      data: {
        vendedoraId: novaVendedoraId, status: 'ENTROU', etapaDesde: new Date(), prazoEm,
        atendidoEm: null, redistribuidoEm: new Date(), redistribuicoes: { increment: 1 },
      },
      include: { vendedora: { select: { id: true, nome: true } }, cliente: { select: { id: true, nome: true } } },
    })
  })
}

/**
 * Redistribui automaticamente os ciclos que estouraram o SLA de ENTROU (sem 1ª resposta),
 * apenas nas redes com auto-redistribuição ligada. Retorna quantos foram redistribuídos.
 */
export async function redistribuirAtrasados(): Promise<number> {
  const agora = new Date()
  const atrasados = await prisma.lead.findMany({
    where: { status: 'ENTROU', prazoEm: { lt: agora }, loja: { rede: { slaAutoRedistribuir: true } } },
    select: { id: true, lojaId: true, vendedoraId: true, loja: { select: { redeId: true } } },
    take: 200,
  })
  let n = 0
  for (const lead of atrasados) {
    const nova = await escolherVendedoraDisponivel(lead.lojaId, lead.vendedoraId)
    if (!nova) continue
    await redistribuirLead(lead.id, nova, lead.loja.redeId)
    n += 1
  }
  return n
}

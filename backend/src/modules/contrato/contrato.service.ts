import { prisma } from '../../lib/prisma'
import { solicitarCancelamento } from '../assinaturas/assinatura.service'
import { cancelarPreapproval } from '../assinaturas/mercadopago.service'
import {
  CONTRATO_VERSAO,
  CONTRATO_PUBLICADO_EM,
  prazoReaceite,
  montarContrato,
  type ContratoMontado,
} from './contrato.template'

/** A rede já registrou o aceite da versão vigente do contrato? */
export async function temAceiteVigente(redeId: string): Promise<boolean> {
  const a = await prisma.aceiteContrato.findFirst({
    where: { redeId, versao: CONTRATO_VERSAO },
    select: { id: true },
  })
  return Boolean(a)
}

export interface StatusReaceite {
  aceito: boolean
  pendente: boolean // existe e ainda não aceitou a versão vigente → precisa aceitar
  prazo: string | null // ISO do prazo final (distrato a partir daí)
  diasRestantes: number | null
  versao: string
}

/**
 * Status do aceite para uma rede. "pendente" vale tanto para a 1ª adesão aos
 * termos (redes criadas antes da versão vigente) quanto para reaceites futuros.
 */
export async function statusReaceite(redeId: string): Promise<StatusReaceite> {
  const [vigente, rede] = await Promise.all([
    prisma.aceiteContrato.findFirst({ where: { redeId, versao: CONTRATO_VERSAO }, select: { id: true } }),
    prisma.rede.findUnique({ where: { id: redeId }, select: { createdAt: true } }),
  ])
  const aceito = Boolean(vigente)
  // Só cobramos aceite de quem já existia antes da versão entrar no ar. Redes novas
  // aceitam no checkout, então nunca ficam "pendentes".
  const pendente = !aceito && Boolean(rede && rede.createdAt < CONTRATO_PUBLICADO_EM)
  const prazo = prazoReaceite()
  const dias = Math.max(0, Math.ceil((prazo.getTime() - Date.now()) / 86_400_000))
  return {
    aceito,
    pendente,
    prazo: pendente ? prazo.toISOString() : null,
    diasRestantes: pendente ? dias : null,
    versao: CONTRATO_VERSAO,
  }
}

/** Monta o contrato personalizado da rede (contratante + plano + último aceite). */
export async function montarContratoDaRede(redeId: string): Promise<ContratoMontado> {
  const [rede, gestor, assinatura, aceite] = await Promise.all([
    prisma.rede.findUnique({ where: { id: redeId } }),
    prisma.usuario.findFirst({ where: { redeId, role: 'GESTOR' }, orderBy: { createdAt: 'asc' } }),
    prisma.assinatura.findUnique({ where: { redeId } }),
    prisma.aceiteContrato.findFirst({ where: { redeId, versao: CONTRATO_VERSAO }, orderBy: { aceitoEm: 'desc' } }),
  ])

  return montarContrato({
    contratante: rede
      ? {
          redeNome: rede.nome,
          slug: rede.slug,
          gestorNome: gestor?.nome ?? '',
          gestorEmail: gestor?.email ?? '',
        }
      : undefined,
    plano: assinatura ? { nome: assinatura.plano, valor: Number(assinatura.valor) } : undefined,
    aceite: aceite ? { aceitoEm: aceite.aceitoEm, ip: aceite.ip, versao: aceite.versao } : undefined,
  })
}

/** Registra o aceite eletrônico da versão vigente (idempotente por versão). */
export async function registrarAceite(
  redeId: string,
  dados: { nome: string; email: string; ip?: string | null; userAgent?: string | null },
): Promise<{ jaAceito: boolean }> {
  if (await temAceiteVigente(redeId)) return { jaAceito: true }
  await prisma.aceiteContrato.create({
    data: {
      redeId,
      versao: CONTRATO_VERSAO,
      assinanteNome: dados.nome,
      assinanteEmail: dados.email,
      ip: dados.ip ?? null,
      userAgent: dados.userAgent ?? null,
    },
  })
  return { jaAceito: false }
}

/**
 * Distrato por não-aceite dos termos no prazo. Para cada rede que existia antes da
 * versão vigente, com assinatura ativa, sem aceite e sem cancelamento em curso:
 * cancela a recorrência no Mercado Pago e agenda o fim de ciclo (acesso até o
 * vencimento do período já pago). O encerramento em si fica a cargo de
 * `encerrarAssinaturasVencidas` (já existente). Retorna quantas redes distratadas.
 */
export async function aplicarDistratoTermos(agora: Date = new Date()): Promise<number> {
  if (agora < prazoReaceite()) return 0

  const redes = await prisma.rede.findMany({
    where: {
      createdAt: { lt: CONTRATO_PUBLICADO_EM },
      assinatura: { is: { status: { not: 'CANCELADA' }, cancelamentoSolicitadoEm: null } },
    },
    include: { assinatura: true },
  })

  let distratadas = 0
  for (const r of redes) {
    if (await temAceiteVigente(r.id)) continue
    if (r.assinatura?.mpPreapprovalId) {
      await cancelarPreapproval(r.assinatura.mpPreapprovalId).catch(() => { /* segue mesmo se o MP falhar */ })
    }
    await solicitarCancelamento(r.id, 'DISTRATO_TERMOS')
    distratadas++
  }
  return distratadas
}

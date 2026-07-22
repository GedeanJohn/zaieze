import { prisma } from '../../lib/prisma'
import { solicitarCancelamento } from '../assinaturas/assinatura.service'
import { cancelarPreapproval } from '../assinaturas/mercadopago.service'
import {
  PRIVACIDADE_VERSAO,
  PRIVACIDADE_PUBLICADO_EM,
  prazoReaceite,
  montarPrivacidade,
  type PrivacidadeMontada,
} from './privacidade.template'

/** A rede já registrou o aceite da versão vigente da Política de Privacidade? */
export async function temAceiteVigentePrivacidade(redeId: string): Promise<boolean> {
  const a = await prisma.aceitePrivacidade.findFirst({
    where: { redeId, versao: PRIVACIDADE_VERSAO },
    select: { id: true },
  })
  return Boolean(a)
}

export interface StatusReaceitePrivacidade {
  aceito: boolean
  pendente: boolean
  prazo: string | null
  diasRestantes: number | null
  versao: string
}

export async function statusReaceitePrivacidade(redeId: string): Promise<StatusReaceitePrivacidade> {
  const [vigente, rede] = await Promise.all([
    prisma.aceitePrivacidade.findFirst({ where: { redeId, versao: PRIVACIDADE_VERSAO }, select: { id: true } }),
    prisma.rede.findUnique({ where: { id: redeId }, select: { createdAt: true } }),
  ])
  const aceito = Boolean(vigente)
  const pendente = !aceito && Boolean(rede && rede.createdAt < PRIVACIDADE_PUBLICADO_EM)
  const prazo = prazoReaceite()
  const dias = Math.max(0, Math.ceil((prazo.getTime() - Date.now()) / 86_400_000))
  return {
    aceito,
    pendente,
    prazo: pendente ? prazo.toISOString() : null,
    diasRestantes: pendente ? dias : null,
    versao: PRIVACIDADE_VERSAO,
  }
}

export async function montarPrivacidadeDaRede(redeId: string, idioma?: string): Promise<PrivacidadeMontada> {
  const aceite = await prisma.aceitePrivacidade.findFirst({
    where: { redeId, versao: PRIVACIDADE_VERSAO },
    orderBy: { aceitoEm: 'desc' },
  })
  return montarPrivacidade({
    aceite: aceite ? { aceitoEm: aceite.aceitoEm, ip: aceite.ip, versao: aceite.versao } : undefined,
    idioma,
  })
}

/** Registra o aceite eletrônico da versão vigente (idempotente por versão). */
export async function registrarAceitePrivacidade(
  redeId: string,
  dados: { nome: string; email: string; ip?: string | null; userAgent?: string | null; idioma?: string },
): Promise<{ jaAceito: boolean }> {
  if (await temAceiteVigentePrivacidade(redeId)) return { jaAceito: true }
  await prisma.aceitePrivacidade.create({
    data: {
      redeId,
      versao: PRIVACIDADE_VERSAO,
      idioma: dados.idioma ?? 'pt',
      assinanteNome: dados.nome,
      assinanteEmail: dados.email,
      ip: dados.ip ?? null,
      userAgent: dados.userAgent ?? null,
    },
  })
  return { jaAceito: false }
}

// ─────────────────────── Escopo Assessor (Brand Partner) ───────────────────────
// Mesma mecânica acima, mas por assessorId. Sem job de distrato/cancelamento — o
// Contrato de Credenciamento da assessora também não tem essa aplicação; aqui o
// aceite de uma nova versão é só automático-por-uso (ver PainelAssessora.tsx).

export async function temAceiteVigentePrivacidadeAssessor(assessorId: string): Promise<boolean> {
  const a = await prisma.aceitePrivacidadeAssessor.findFirst({
    where: { assessorId, versao: PRIVACIDADE_VERSAO },
    select: { id: true },
  })
  return Boolean(a)
}

export async function statusReaceitePrivacidadeAssessor(assessorId: string): Promise<StatusReaceitePrivacidade> {
  const [vigente, assessor] = await Promise.all([
    prisma.aceitePrivacidadeAssessor.findFirst({ where: { assessorId, versao: PRIVACIDADE_VERSAO }, select: { id: true } }),
    prisma.assessor.findUnique({ where: { id: assessorId }, select: { createdAt: true } }),
  ])
  const aceito = Boolean(vigente)
  const pendente = !aceito && Boolean(assessor && assessor.createdAt < PRIVACIDADE_PUBLICADO_EM)
  const prazo = prazoReaceite()
  const dias = Math.max(0, Math.ceil((prazo.getTime() - Date.now()) / 86_400_000))
  return {
    aceito,
    pendente,
    prazo: pendente ? prazo.toISOString() : null,
    diasRestantes: pendente ? dias : null,
    versao: PRIVACIDADE_VERSAO,
  }
}

export async function registrarAceitePrivacidadeAssessor(
  assessorId: string,
  dados: { nome: string; email: string; ip?: string | null; userAgent?: string | null; idioma?: string },
): Promise<{ jaAceito: boolean }> {
  if (await temAceiteVigentePrivacidadeAssessor(assessorId)) return { jaAceito: true }
  await prisma.aceitePrivacidadeAssessor.create({
    data: {
      assessorId,
      versao: PRIVACIDADE_VERSAO,
      idioma: dados.idioma ?? 'pt',
      assinanteNome: dados.nome,
      assinanteEmail: dados.email,
      ip: dados.ip ?? null,
      userAgent: dados.userAgent ?? null,
    },
  })
  return { jaAceito: false }
}

/**
 * Distrato por não-aceite da Política de Privacidade no prazo. Mesma mecânica do
 * distrato do Contrato SaaS (ver contrato.service.ts): cancela a recorrência no
 * Mercado Pago e agenda o fim de ciclo. Retorna quantas redes distratadas.
 */
export async function aplicarDistratoPrivacidade(agora: Date = new Date()): Promise<number> {
  if (agora < prazoReaceite()) return 0

  const redes = await prisma.rede.findMany({
    where: {
      createdAt: { lt: PRIVACIDADE_PUBLICADO_EM },
      assinatura: { is: { status: { not: 'CANCELADA' }, cancelamentoSolicitadoEm: null } },
    },
    include: { assinatura: true },
  })

  let distratadas = 0
  for (const r of redes) {
    if (await temAceiteVigentePrivacidade(r.id)) continue
    if (r.assinatura?.mpPreapprovalId) {
      await cancelarPreapproval(r.assinatura.mpPreapprovalId).catch(() => { /* segue mesmo se o MP falhar */ })
    }
    await solicitarCancelamento(r.id, 'DISTRATO_PRIVACIDADE')
    distratadas++
  }
  return distratadas
}

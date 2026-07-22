import { prisma } from '../../lib/prisma'
import { solicitarCancelamento } from '../assinaturas/assinatura.service'
import { cancelarPreapproval } from '../assinaturas/mercadopago.service'
import {
  TERMOS_USO_VERSAO,
  TERMOS_USO_PUBLICADO_EM,
  prazoReaceite,
  montarTermosUso,
  type TermosUsoMontado,
} from './termos-uso.template'

/** A rede já registrou o aceite da versão vigente dos Termos de Uso? */
export async function temAceiteVigenteTermosUso(redeId: string): Promise<boolean> {
  const a = await prisma.aceiteTermosUso.findFirst({
    where: { redeId, versao: TERMOS_USO_VERSAO },
    select: { id: true },
  })
  return Boolean(a)
}

export interface StatusReaceiteTermosUso {
  aceito: boolean
  pendente: boolean
  prazo: string | null
  diasRestantes: number | null
  versao: string
}

export async function statusReaceiteTermosUso(redeId: string): Promise<StatusReaceiteTermosUso> {
  const [vigente, rede] = await Promise.all([
    prisma.aceiteTermosUso.findFirst({ where: { redeId, versao: TERMOS_USO_VERSAO }, select: { id: true } }),
    prisma.rede.findUnique({ where: { id: redeId }, select: { createdAt: true } }),
  ])
  const aceito = Boolean(vigente)
  const pendente = !aceito && Boolean(rede && rede.createdAt < TERMOS_USO_PUBLICADO_EM)
  const prazo = prazoReaceite()
  const dias = Math.max(0, Math.ceil((prazo.getTime() - Date.now()) / 86_400_000))
  return {
    aceito,
    pendente,
    prazo: pendente ? prazo.toISOString() : null,
    diasRestantes: pendente ? dias : null,
    versao: TERMOS_USO_VERSAO,
  }
}

export async function montarTermosUsoDaRede(redeId: string, idioma?: string): Promise<TermosUsoMontado> {
  const aceite = await prisma.aceiteTermosUso.findFirst({
    where: { redeId, versao: TERMOS_USO_VERSAO },
    orderBy: { aceitoEm: 'desc' },
  })
  return montarTermosUso({
    aceite: aceite ? { aceitoEm: aceite.aceitoEm, ip: aceite.ip, versao: aceite.versao } : undefined,
    idioma,
  })
}

/** Registra o aceite eletrônico da versão vigente (idempotente por versão). */
export async function registrarAceiteTermosUso(
  redeId: string,
  dados: { nome: string; email: string; ip?: string | null; userAgent?: string | null; idioma?: string },
): Promise<{ jaAceito: boolean }> {
  if (await temAceiteVigenteTermosUso(redeId)) return { jaAceito: true }
  await prisma.aceiteTermosUso.create({
    data: {
      redeId,
      versao: TERMOS_USO_VERSAO,
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

export async function temAceiteVigenteTermosUsoAssessor(assessorId: string): Promise<boolean> {
  const a = await prisma.aceiteTermosUsoAssessor.findFirst({
    where: { assessorId, versao: TERMOS_USO_VERSAO },
    select: { id: true },
  })
  return Boolean(a)
}

export async function statusReaceiteTermosUsoAssessor(assessorId: string): Promise<StatusReaceiteTermosUso> {
  const [vigente, assessor] = await Promise.all([
    prisma.aceiteTermosUsoAssessor.findFirst({ where: { assessorId, versao: TERMOS_USO_VERSAO }, select: { id: true } }),
    prisma.assessor.findUnique({ where: { id: assessorId }, select: { createdAt: true } }),
  ])
  const aceito = Boolean(vigente)
  const pendente = !aceito && Boolean(assessor && assessor.createdAt < TERMOS_USO_PUBLICADO_EM)
  const prazo = prazoReaceite()
  const dias = Math.max(0, Math.ceil((prazo.getTime() - Date.now()) / 86_400_000))
  return {
    aceito,
    pendente,
    prazo: pendente ? prazo.toISOString() : null,
    diasRestantes: pendente ? dias : null,
    versao: TERMOS_USO_VERSAO,
  }
}

export async function registrarAceiteTermosUsoAssessor(
  assessorId: string,
  dados: { nome: string; email: string; ip?: string | null; userAgent?: string | null; idioma?: string },
): Promise<{ jaAceito: boolean }> {
  if (await temAceiteVigenteTermosUsoAssessor(assessorId)) return { jaAceito: true }
  await prisma.aceiteTermosUsoAssessor.create({
    data: {
      assessorId,
      versao: TERMOS_USO_VERSAO,
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
 * Distrato por não-aceite dos Termos de Uso no prazo. Mesma mecânica do distrato do
 * Contrato SaaS (ver contrato.service.ts). Retorna quantas redes distratadas.
 */
export async function aplicarDistratoTermosUso(agora: Date = new Date()): Promise<number> {
  if (agora < prazoReaceite()) return 0

  const redes = await prisma.rede.findMany({
    where: {
      createdAt: { lt: TERMOS_USO_PUBLICADO_EM },
      assinatura: { is: { status: { not: 'CANCELADA' }, cancelamentoSolicitadoEm: null } },
    },
    include: { assinatura: true },
  })

  let distratadas = 0
  for (const r of redes) {
    if (await temAceiteVigenteTermosUso(r.id)) continue
    if (r.assinatura?.mpPreapprovalId) {
      await cancelarPreapproval(r.assinatura.mpPreapprovalId).catch(() => { /* segue mesmo se o MP falhar */ })
    }
    await solicitarCancelamento(r.id, 'DISTRATO_TERMOS_USO')
    distratadas++
  }
  return distratadas
}

import type { Plano } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { excluirDoR2 } from './r2.service'

/**
 * Limpeza de mídia do catálogo por plano (Cloudflare R2).
 * Retenção a partir de `Colecao.liberadaEm`: START 6 meses, PRO 12 meses, ELITE perpétuo
 * (enquanto a empresa estiver ativa). O gestor é avisado na tela de Coleções (data + dias
 * restantes) antes da remoção — para marcar Outlet/promover. Aqui só executa a remoção.
 */

/** Meses de retenção da mídia por plano (null = perpétuo, não expira). */
export function mesesRetencao(plano: Plano): number | null {
  switch (plano) {
    case 'START': return 6
    case 'PRO': return 12
    default: return null // ELITE: perpétuo
  }
}

/** Data em que a mídia da coleção expira (null = nunca, ou sem liberação). */
export function midiaExpiraEm(liberadaEm: Date | null, plano: Plano): Date | null {
  if (!liberadaEm) return null
  const meses = mesesRetencao(plano)
  if (meses == null) return null
  const d = new Date(liberadaEm)
  d.setMonth(d.getMonth() + meses)
  return d
}

/**
 * Apaga TODA a mídia de uma rede no R2 — usado quando a marca ENCERRA a assinatura/sai do
 * sistema (libera o storage). Zera as URLs dos produtos e marca as coleções como expiradas.
 * @returns nº de objetos apagados.
 */
export async function limparMidiaDaRede(redeId: string): Promise<number> {
  const lojas = await prisma.loja.findMany({ where: { redeId }, select: { id: true } })
  const lojaIds = lojas.map((l) => l.id)
  if (lojaIds.length === 0) return 0

  const produtos = await prisma.produto.findMany({ where: { lojaId: { in: lojaIds } }, select: { fotos: true, videos: true } })
  const urls = produtos.flatMap((p) => [...p.fotos, ...p.videos])
  if (urls.length === 0) return 0

  try {
    await excluirDoR2(urls)
  } catch {
    return 0 // falhou no R2 → não zera o banco (tenta de novo depois)
  }
  await prisma.$transaction([
    prisma.produto.updateMany({ where: { lojaId: { in: lojaIds } }, data: { fotos: [], videos: [] } }),
    prisma.colecao.updateMany({ where: { lojaId: { in: lojaIds }, midiaExpiradaEm: null }, data: { midiaExpiradaEm: new Date() } }),
  ])
  return urls.length
}

/**
 * Apaga do R2 a mídia das coleções cuja retenção do plano já venceu, limpa as URLs dos
 * produtos e marca `midiaExpiradaEm`. Roda diariamente (cron no server). Idempotente.
 * @returns nº de coleções processadas.
 */
export async function limparMidiaExpirada(): Promise<number> {
  const agora = new Date()
  // Só coleções liberadas, com mídia ainda não expirada, de redes START/PRO (ELITE nunca expira).
  const colecoes = await prisma.colecao.findMany({
    where: {
      status: 'LIBERADA',
      liberadaEm: { not: null },
      midiaExpiradaEm: null,
      loja: { rede: { plano: { in: ['START', 'PRO'] } } },
    },
    select: { id: true, liberadaEm: true, loja: { select: { rede: { select: { plano: true } } } } },
  })

  let processadas = 0
  for (const c of colecoes) {
    const plano = c.loja.rede?.plano
    if (!plano) continue
    const expira = midiaExpiraEm(c.liberadaEm, plano)
    if (!expira || agora < expira) continue

    const produtos = await prisma.produto.findMany({ where: { colecaoId: c.id }, select: { id: true, fotos: true, videos: true } })
    const urls = produtos.flatMap((p) => [...p.fotos, ...p.videos])
    try {
      await excluirDoR2(urls)
    } catch {
      continue // falha no R2 → tenta de novo no próximo ciclo (não marca como expirada)
    }
    await prisma.$transaction([
      ...produtos.map((p) => prisma.produto.update({ where: { id: p.id }, data: { fotos: [], videos: [] } })),
      prisma.colecao.update({ where: { id: c.id }, data: { midiaExpiradaEm: agora } }),
    ])
    processadas += 1
  }
  return processadas
}

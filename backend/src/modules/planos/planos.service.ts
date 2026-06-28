import type { Plano } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { PLANOS_META } from '../../plugins/planos'

const PADRAO: Record<Plano, number> = { START: 97, PRO: 297, ELITE: 697 }
const arred2 = (n: number) => Math.round(n * 100) / 100

/** Preço vigente de um plano (banco; cai no padrão se ainda não houver registro). */
export async function precoDoPlano(plano: Plano): Promise<number> {
  const c = await prisma.configPlano.findUnique({ where: { plano }, select: { preco: true } })
  return c ? Number(c.preco) : PADRAO[plano]
}

/** Mapa de preços vigentes de todos os planos. */
export async function precosDosPlanos(): Promise<Record<Plano, number>> {
  const linhas = await prisma.configPlano.findMany({ select: { plano: true, preco: true } })
  const map: Record<Plano, number> = { ...PADRAO }
  for (const l of linhas) map[l.plano] = Number(l.preco)
  return map
}

/** Catálogo dos planos (metadados do código + preço do banco) — usado na landing e no upgrade. */
export async function listarPlanos() {
  const precos = await precosDosPlanos()
  return PLANOS_META.map((m) => ({ ...m, preco: precos[m.plano] }))
}

/** Define manualmente os preços (admin). Só vale para novas assinaturas/trocas. */
export async function definirPrecos(precos: Partial<Record<Plano, number>>): Promise<void> {
  for (const [plano, preco] of Object.entries(precos) as [Plano, number][]) {
    if (preco == null || !Number.isFinite(preco) || preco < 0) continue
    await prisma.configPlano.upsert({
      where: { plano },
      update: { preco: arred2(preco) },
      create: { plano, preco: arred2(preco) },
    })
  }
}

/**
 * Aplica um reajuste percentual (ex.: IGP-M acumulado) a todos os planos.
 * Só afeta novas assinaturas/trocas. Registra o histórico.
 */
export async function aplicarReajuste(percentual: number, indice: string, aplicadoPor?: string) {
  const antes = await precosDosPlanos()
  const fator = 1 + percentual / 100
  const detalhe: Record<string, { de: number; para: number }> = {}
  for (const plano of Object.keys(antes) as Plano[]) {
    const de = antes[plano]
    const para = arred2(de * fator)
    detalhe[plano] = { de, para }
    await prisma.configPlano.upsert({
      where: { plano },
      update: { preco: para },
      create: { plano, preco: para },
    })
  }
  await prisma.reajusteHistorico.create({
    data: { indice, percentual, detalhe, aplicadoPor: aplicadoPor ?? null },
  })
  return detalhe
}

export function listarReajustes() {
  return prisma.reajusteHistorico.findMany({ orderBy: { aplicadoEm: 'desc' }, take: 50 })
}

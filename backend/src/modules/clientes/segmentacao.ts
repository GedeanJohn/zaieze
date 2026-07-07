import type { SegmentoCliente } from '@prisma/client'
import { prisma } from '../../lib/prisma'

/**
 * Segmentação automática da carteira (módulo 3 da spec).
 * Recalcula segmento + agregados (totalGasto, ultimaCompraEm) a partir das
 * vendas CONCLUÍDAS — fonte de verdade. Idempotente: pode rodar quantas vezes quiser.
 *
 * Regras (skill modacrm-ai):
 *  - NOVO     = sem compras ainda (lead) ou primeira compra recente sem recorrência
 *  - INATIVO  = 90+ dias sem compra (alvo da régua de recuperação)
 *  - ATACADO  = comprou no atacado ou acumulado ≥ limiteAtacado da loja
 *  - VIP      = acumulado > R$ 3.000
 *  - FREQUENTE= comprou em 2+ meses distintos nos últimos 90 dias
 */
export const VIP_LIMITE = 3000
export const INATIVO_DIAS = 90
export const FREQUENTE_MIN_MESES = 2

export const SEGMENTOS: SegmentoCliente[] = ['NOVO', 'FREQUENTE', 'VIP', 'INATIVO', 'ATACADO']

interface VendaResumo {
  total: number
  atacado: boolean
  createdAt: Date
}

export function calcularSegmento(vendas: VendaResumo[], limiteAtacado: number, agora = new Date()): SegmentoCliente {
  if (vendas.length === 0) return 'NOVO'

  const totalGasto = vendas.reduce((s, v) => s + v.total, 0)
  const ultima = vendas.reduce((max, v) => (v.createdAt > max ? v.createdAt : max), vendas[0].createdAt)
  const diasSemCompra = Math.floor((agora.getTime() - ultima.getTime()) / 86_400_000)

  if (diasSemCompra > INATIVO_DIAS) return 'INATIVO'

  const temAtacado = vendas.some((v) => v.atacado) || totalGasto >= limiteAtacado
  if (temAtacado) return 'ATACADO'

  if (totalGasto > VIP_LIMITE) return 'VIP'

  // Meses-calendário distintos com compra nos últimos 90 dias
  const limite = new Date(agora.getTime() - INATIVO_DIAS * 86_400_000)
  const meses = new Set(
    vendas.filter((v) => v.createdAt >= limite).map((v) => `${v.createdAt.getFullYear()}-${v.createdAt.getMonth()}`),
  )
  if (meses.size >= FREQUENTE_MIN_MESES) return 'FREQUENTE'

  return 'NOVO'
}

export type Distribuicao = Record<SegmentoCliente, number>

/** Recalcula segmento + agregados de todos os clientes ativos de uma loja. */
export async function segmentarLoja(lojaId: string): Promise<{ atualizados: number; distribuicao: Distribuicao }> {
  const loja = await prisma.loja.findUniqueOrThrow({ where: { id: lojaId }, select: { limiteAtacado: true } })
  const limiteAtacado = Number(loja.limiteAtacado)
  const agora = new Date()

  const clientes = await prisma.cliente.findMany({
    where: { lojaId, ativo: true, consumidorOutro: false },
    select: {
      id: true,
      segmento: true,
      vendas: { where: { status: 'CONCLUIDA' }, select: { total: true, atacado: true, createdAt: true } },
    },
  })

  const distribuicao: Distribuicao = { NOVO: 0, FREQUENTE: 0, VIP: 0, INATIVO: 0, ATACADO: 0 }
  let atualizados = 0

  for (const c of clientes) {
    const vendas: VendaResumo[] = c.vendas.map((v) => ({ total: Number(v.total), atacado: v.atacado, createdAt: v.createdAt }))
    const segmento = calcularSegmento(vendas, limiteAtacado, agora)
    const totalGasto = vendas.reduce((s, v) => s + v.total, 0)
    const ultimaCompraEm = vendas.length
      ? vendas.reduce((max, v) => (v.createdAt > max ? v.createdAt : max), vendas[0].createdAt)
      : null

    distribuicao[segmento] += 1
    if (segmento !== c.segmento) atualizados += 1

    await prisma.cliente.update({
      where: { id: c.id },
      data: { segmento, totalGasto, ultimaCompraEm },
    })
  }

  return { atualizados, distribuicao }
}

/** Roda a segmentação para todas as lojas (job de boot / agendado). */
export async function segmentarTodasAsLojas(): Promise<void> {
  const lojas = await prisma.loja.findMany({ where: { ativo: true }, select: { id: true } })
  for (const l of lojas) await segmentarLoja(l.id)
}

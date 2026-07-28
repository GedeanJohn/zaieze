import { prisma } from '../../lib/prisma'
import { cotaCreditosAddon } from '../addons/addon.service'

/**
 * Créditos de IA Captador do add-on RADAR — controla o custo real e variável da prospecção
 * (Google Places), não a explicação de IA nos matches da carteira (essa fica incluída na
 * mensalidade, é barata e previsível). Mesmo padrão do provador/cota.service.ts: sem saldo
 * persistido, conta 1 crédito por `ProspeccaoBusca` da rede criada no mês corrente.
 */
export async function statusCreditos(redeId: string): Promise<{ usados: number; limite: number; ok: boolean }> {
  const limite = await cotaCreditosAddon('RADAR')
  if (limite === 0) return { usados: 0, limite: 0, ok: true } // 0 = ilimitado

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const usados = await prisma.prospeccaoBusca.count({ where: { redeId, createdAt: { gte: inicioMes } } })
  return { usados, limite, ok: usados < limite }
}

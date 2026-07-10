import { prisma } from '../../lib/prisma'
import { env } from '../../env'

/**
 * Cota mensal de looks por rede (controle de custo do provador — Elite).
 * Conta os looks criados no mês corrente que NÃO falharam/expiraram.
 * env.PROVADOR_COTA_MES = 0 → ilimitado.
 */
export async function statusCota(redeId: string): Promise<{ usados: number; limite: number; ok: boolean }> {
  const limite = env.PROVADOR_COTA_MES
  if (limite === 0) return { usados: 0, limite: 0, ok: true } // ilimitado

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const usados = await prisma.lookProvador.count({
    where: { redeId, createdAt: { gte: inicioMes }, status: { notIn: ['FALHOU', 'EXPIRADO'] } },
  })
  return { usados, limite, ok: usados < limite }
}

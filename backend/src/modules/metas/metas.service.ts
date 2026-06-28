import { prisma } from '../../lib/prisma'

const num = (v: unknown) => Number(v ?? 0)

/** Nº de vendedoras ativas de uma loja (divisor da meta da vendedora). */
export function numVendedorasAtivas(lojaId: string): Promise<number> {
  return prisma.usuario.count({ where: { lojaId, role: 'VENDEDORA', ativo: true } })
}

/**
 * Meta mensal de uma loja, conforme o modo de distribuição da rede:
 * - IGUAL: meta da marca ÷ nº de lojas da rede.
 * - MANUAL: valor definido na própria loja.
 */
export async function metaDaLoja(lojaId: string): Promise<number> {
  const loja = await prisma.loja.findUnique({ where: { id: lojaId }, select: { metaMensal: true, redeId: true } })
  if (!loja) return 0
  const rede = await prisma.rede.findUnique({ where: { id: loja.redeId }, select: { metaMensal: true, metaModo: true } })
  if (!rede) return 0
  if (rede.metaModo === 'MANUAL') return num(loja.metaMensal)
  const totalLojas = await prisma.loja.count({ where: { redeId: loja.redeId } })
  return totalLojas > 0 ? num(rede.metaMensal) / totalLojas : 0
}

/** Meta mensal de uma vendedora = meta da loja ÷ nº de vendedoras ativas da loja. */
export async function metaDaVendedora(vendedoraId: string): Promise<number> {
  const v = await prisma.usuario.findUnique({ where: { id: vendedoraId }, select: { lojaId: true } })
  if (!v?.lojaId) return 0
  const [metaLoja, n] = await Promise.all([metaDaLoja(v.lojaId), numVendedorasAtivas(v.lojaId)])
  return n > 0 ? metaLoja / n : 0
}

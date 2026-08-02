import type { CodigoPromocional } from '@prisma/client'
import { prisma } from '../../lib/prisma'

/** Normaliza o código (maiúsculo, sem espaços). */
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase()
}

/**
 * Valida um código no checkout: existe, ativo, dentro da validade e do limite de usos, e
 * corresponde ao tipo de assinatura esperado (`aplicaA`) — um cupom de assento de vendedora não
 * vale pra assinatura de Assessor, e vice-versa.
 */
export async function validarCodigo(
  codigoRaw?: string | null,
  aplicaA: 'VENDEDORA' | 'ASSESSOR' = 'VENDEDORA',
): Promise<CodigoPromocional | null> {
  if (!codigoRaw || !codigoRaw.trim()) return null
  const c = await prisma.codigoPromocional.findUnique({ where: { codigo: normalizarCodigo(codigoRaw) } })
  if (!c || !c.ativo) return null
  if (c.aplicaA !== aplicaA) return null
  if (c.validadeAte && c.validadeAte.getTime() < Date.now()) return null
  if (c.maxUsos != null && c.usos >= c.maxUsos) return null
  return c
}

/** Marca um uso do código (após o provisionamento). */
export function consumirCodigo(id: string): Promise<unknown> {
  return prisma.codigoPromocional.update({ where: { id }, data: { usos: { increment: 1 } } })
}

/** Texto curto do benefício, para exibir no checkout. */
export function descricaoBeneficio(c: Pick<CodigoPromocional, 'tipo' | 'dias' | 'percentual' | 'valorFixo' | 'duracaoCiclos'>): string {
  if (c.tipo === 'DIAS_GRATIS') return `${c.dias} dias grátis — só começa a pagar depois`
  const valor = c.tipo === 'PERCENTUAL' ? `${Number(c.percentual)}%` : `R$ ${Number(c.valorFixo).toFixed(2)}`
  const prazo = c.duracaoCiclos ? ` nos primeiros ${c.duracaoCiclos} mês(es)` : ' enquanto o assento existir'
  return `${valor} de desconto na mensalidade${prazo}`
}

/** Aplica PERCENTUAL/VALOR_FIXO sobre um preço base. Nunca deixa o valor final abaixo de zero. */
export function aplicarDesconto(precoBase: number, c: Pick<CodigoPromocional, 'tipo' | 'percentual' | 'valorFixo'>): number {
  if (c.tipo === 'PERCENTUAL') return Math.max(0, precoBase * (1 - Number(c.percentual) / 100))
  if (c.tipo === 'VALOR_FIXO') return Math.max(0, precoBase - Number(c.valorFixo))
  return precoBase
}

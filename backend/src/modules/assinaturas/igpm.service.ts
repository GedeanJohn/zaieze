import { prisma } from '../../lib/prisma'
import { atualizarValorPreapproval, mpConfigurado } from './mercadopago.service'

const arred2 = (n: number) => Math.round(n * 100) / 100

/**
 * Mês de referência do índice a aplicar num aniversário: o MÊS ANTERIOR ao aniversário
 * (= o 12º mês do contrato). Ex.: aniversário em jun/2027 → índice de mai/2027.
 * Vira o ano quando o aniversário é em janeiro (→ dezembro do ano anterior).
 */
function mesIndice(aniversario: Date): { ano: number; mes: number } {
  let mes = aniversario.getMonth() // 0..11; (mês 1-based do aniversário) - 1 = mês anterior em 1-based
  let ano = aniversario.getFullYear()
  if (mes === 0) { mes = 12; ano -= 1 } // aniversário em janeiro → dezembro do ano anterior
  return { ano, mes } // mes em 1..12
}

/** Aniversário n do contrato (createdAt + n anos), preservando mês/dia. */
function aniversario(inicio: Date, n: number): Date {
  const d = new Date(inicio)
  d.setFullYear(d.getFullYear() + n)
  return d
}

/**
 * Reajuste anual por IGP-M nos contratos existentes (job diário).
 * Para cada assinatura ATIVA, aplica os aniversários vencidos enquanto houver índice lançado
 * para o mês anterior ao aniversário. Se o índice ainda não foi lançado, AGUARDA (para no 1º
 * aniversário sem taxa) — aplica depois, quando o admin lançar, sem cobrar retroativo dos meses passados.
 * Reajustes compõem (cada ano sobre o valor já reajustado). Em modo real, atualiza o valor no MP.
 */
export async function aplicarReajustesIgpm(): Promise<number> {
  const agora = new Date()
  const assinaturas = await prisma.assinatura.findMany({
    where: { status: 'ATIVA' },
    select: {
      id: true, redeId: true, valor: true, createdAt: true, reajustesAplicados: true,
      mpPreapprovalId: true, simulada: true, rede: { select: { nome: true } },
    },
  })

  let aplicados = 0
  for (const a of assinaturas) {
    let valor = Number(a.valor)
    let aplicadosN = a.reajustesAplicados

    // Processa aniversários em ordem; para no 1º sem índice disponível.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const n = aplicadosN + 1
      const aniv = aniversario(a.createdAt, n)
      if (aniv > agora) break // ainda não chegou esse aniversário

      const { ano, mes } = mesIndice(aniv)
      const idx = await prisma.indiceIgpm.findUnique({ where: { ano_mes: { ano, mes } }, select: { percentual: true } })
      if (!idx) break // aguarda o admin lançar a taxa daquele mês

      const pct = Number(idx.percentual)
      const valorAntes = valor
      valor = arred2(valor * (1 + pct / 100))

      await prisma.$transaction([
        prisma.assinatura.update({ where: { id: a.id }, data: { valor, reajustesAplicados: n } }),
        prisma.reajusteAssinatura.create({
          data: { redeId: a.redeId, redeNome: a.rede.nome, ano, mes, percentual: pct, valorAntes, valorDepois: valor },
        }),
      ])

      // Em modo real, reflete o novo valor na recorrência do Mercado Pago (best-effort).
      if (!a.simulada && a.mpPreapprovalId && mpConfigurado()) {
        await atualizarValorPreapproval(a.mpPreapprovalId, valor).catch(() => { /* tenta no próximo job */ })
      }

      aplicadosN = n
      aplicados += 1
    }
  }
  return aplicados
}

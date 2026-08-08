import { prisma } from '../../lib/prisma'

/**
 * Tabela de desconto por volume (SUPER_ADMIN edita no Admin): quantidade de vendedoras PAGAS na
 * rede -> valor mensal TOTAL da marca. Substitui o preço fixo por assento (ConfigAssentoVendedora
 * segue existindo só como registro histórico dos assentos já criados antes desta mudança).
 */

/**
 * Preço total da marca pra uma quantidade de assentos pagos. Casa exato se a faixa existir;
 * abaixo da menor faixa usa o valor da menor (piso); acima da maior, extrapola com o incremento
 * entre as duas últimas faixas cadastradas. Sem nenhuma faixa cadastrada, retorna 0 (nada a cobrar
 * até o SUPER_ADMIN cadastrar pelo menos uma).
 */
export async function precoParaQuantidade(qtdPaga: number): Promise<number> {
  if (qtdPaga <= 0) return 0

  const faixas = await prisma.faixaDescontoVendedora.findMany({ orderBy: { quantidade: 'asc' } })
  if (faixas.length === 0) return 0

  const exata = faixas.find((f) => f.quantidade === qtdPaga)
  if (exata) return Number(exata.valorTotal)

  const menor = faixas[0]
  if (qtdPaga < menor.quantidade) return Number(menor.valorTotal)

  const maior = faixas[faixas.length - 1]
  const penultima = faixas.length >= 2 ? faixas[faixas.length - 2] : null
  // Sem uma penúltima faixa pra calcular o incremento, repete o único valor conhecido (fallback
  // degenerado — na prática o SUPER_ADMIN sempre cadastra pelo menos 2 faixas).
  const incremento = penultima ? Number(maior.valorTotal) - Number(penultima.valorTotal) : 0
  return Number(maior.valorTotal) + incremento * (qtdPaga - maior.quantidade)
}

export async function listarFaixasDesconto() {
  return prisma.faixaDescontoVendedora.findMany({ orderBy: { quantidade: 'asc' } })
}

/** Cadastra/edita uma faixa (idempotente por quantidade). Não repreça marcas já ativas — só vale
 * pra próxima vez que a cobrança daquela marca for recomputada (troca de assento). */
export async function definirFaixaDesconto(quantidade: number, valorTotal: number) {
  return prisma.faixaDescontoVendedora.upsert({
    where: { quantidade },
    create: { quantidade, valorTotal },
    update: { valorTotal },
  })
}

export async function removerFaixaDesconto(quantidade: number): Promise<void> {
  await prisma.faixaDescontoVendedora.deleteMany({ where: { quantidade } })
}

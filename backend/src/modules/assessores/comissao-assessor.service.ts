import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

/**
 * Comissão vitalícia sobre lojistas indicados por um Assessor(a) de Moda (link ?refAssessor=<slug>) —
 * mesma mecânica do Programa de Afiliados (ver afiliado.service.ts): percentual individual da
 * assessora (Assessor.percentualComissaoIndicacao), com fallback para o percentual padrão global
 * (ConfigAssessorIndicacao.percentualPadrao, pré-configurado em 2%) quando não há override.
 */

async function percentualPadrao(): Promise<Prisma.Decimal> {
  const config = await prisma.configAssessorIndicacao.findUnique({ where: { id: 1 } })
  return config?.percentualPadrao ?? new Prisma.Decimal(2)
}

/** Percentual efetivo da assessora: o override dela, ou o padrão global. */
export async function percentualEfetivoIndicacao(assessor: { percentualComissaoIndicacao: Prisma.Decimal | null }): Promise<Prisma.Decimal> {
  return assessor.percentualComissaoIndicacao ?? (await percentualPadrao())
}

interface GerarComissaoAssessorInput {
  redeId: string
  cicloEm: Date
  valorBaseAssinatura: Prisma.Decimal | number
}

/** Gera a comissão de UM ciclo pago, se a rede tiver um assessor de origem ativo.
 *  Idempotente via @@unique([redeId, cicloEm]) — engole a duplicata (retry do webhook). */
export async function gerarComissaoAssessorDoCiclo(input: GerarComissaoAssessorInput): Promise<void> {
  const rede = await prisma.rede.findUnique({
    where: { id: input.redeId },
    select: {
      nome: true,
      assessorOrigemId: true,
      assessorOrigem: { select: { id: true, percentualComissaoIndicacao: true, usuario: { select: { ativo: true } } } },
    },
  })
  if (!rede?.assessorOrigem || !rede.assessorOrigem.usuario.ativo) return

  const percentual = await percentualEfetivoIndicacao(rede.assessorOrigem)
  if (percentual.lte(0)) return // % zerado explicitamente: sem comissão (evita linha de R$0,00)

  const valorBase = new Prisma.Decimal(input.valorBaseAssinatura)
  const valorComissao = valorBase.mul(percentual).div(100).toDecimalPlaces(2)

  try {
    await prisma.comissaoAssessor.create({
      data: {
        assessorId: rede.assessorOrigem.id,
        redeId: input.redeId,
        redeNome: rede.nome,
        cicloEm: input.cicloEm,
        valorBaseAssinatura: valorBase,
        percentualComissao: percentual,
        valorComissao,
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return // já gerada (retry)
    throw e
  }
}

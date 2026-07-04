import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { gerarSenhaProvisoria } from '../auth/senha-provisoria'
import { confirmarCiclo } from '../assinaturas/assinatura.service'

/** Normaliza o código de indicação (maiúsculo, sem espaços) — mesmo padrão do cupom promocional. */
export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase()
}

/** Deriva um código único a partir do nome do afiliado (sem acento/espaço + sufixo se colidir). */
export async function gerarCodigoUnico(nomeBase: string): Promise<string> {
  const base = nomeBase
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12) || 'AFILIADO'
  let tentativa = base
  let sufixo = 0
  while (await prisma.afiliado.findUnique({ where: { codigo: tentativa } })) {
    sufixo += 1
    tentativa = `${base}${sufixo}`
  }
  return tentativa
}

async function percentualPadrao(): Promise<Prisma.Decimal> {
  const config = await prisma.configAfiliados.findUnique({ where: { id: 1 } })
  return config?.percentualPadrao ?? new Prisma.Decimal(10)
}

/** Percentual efetivo do afiliado: o override dele, ou o padrão global. */
export async function percentualEfetivo(afiliado: { percentualComissao: Prisma.Decimal | null }): Promise<Prisma.Decimal> {
  return afiliado.percentualComissao ?? (await percentualPadrao())
}

interface CriarAfiliadoInput {
  nome: string
  email: string
  telefone?: string
  percentualComissao?: number
}

/** Cria o Usuario(role=AFILIADO) + Afiliado numa transação. Gera senha provisória (retornada 1x). */
export async function criarAfiliado(input: CriarAfiliadoInput) {
  const email = input.email.toLowerCase()
  if (await prisma.usuario.findUnique({ where: { email } })) {
    throw Object.assign(new Error('Já existe uma conta com este e-mail.'), { statusCode: 409 })
  }
  const codigo = await gerarCodigoUnico(input.nome)
  const senha = gerarSenhaProvisoria()
  const senhaHash = await bcrypt.hash(senha, 10)

  const afiliado = await prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: { nome: input.nome, email, senhaHash, role: 'AFILIADO', telefone: input.telefone ?? null },
    })
    return tx.afiliado.create({
      data: {
        usuarioId: usuario.id,
        codigo,
        percentualComissao: input.percentualComissao ?? null,
      },
      include: { usuario: { select: { id: true, nome: true, email: true, telefone: true, ativo: true } } },
    })
  })
  return { afiliado, senha }
}

interface GerarComissaoInput {
  redeId: string
  cicloEm: Date
  valorBaseAssinatura: Prisma.Decimal | number
}

/** Gera a comissão de UM ciclo pago, se a rede tiver um afiliado de origem ativo. Idempotente
 *  via @@unique([redeId, cicloEm]) — engole a duplicata (retry do webhook). */
export async function gerarComissaoDoCiclo(input: GerarComissaoInput): Promise<void> {
  const rede = await prisma.rede.findUnique({
    where: { id: input.redeId },
    select: { nome: true, afiliadoId: true, afiliadoOrigem: { select: { id: true, percentualComissao: true, usuario: { select: { ativo: true } } } } },
  })
  if (!rede?.afiliadoOrigem || !rede.afiliadoOrigem.usuario.ativo) return

  const percentual = await percentualEfetivo(rede.afiliadoOrigem)
  const valorBase = new Prisma.Decimal(input.valorBaseAssinatura)
  const valorComissao = valorBase.mul(percentual).div(100).toDecimalPlaces(2)

  try {
    await prisma.comissaoAfiliado.create({
      data: {
        afiliadoId: rede.afiliadoOrigem.id,
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

const MARGEM_FRESCOR_MS = 3 * 24 * 60 * 60 * 1000 // 3 dias

/**
 * Confirma o ciclo da assinatura (ativa/renova) e, só se for um ciclo GENUINAMENTE NOVO,
 * gera a comissão do afiliado. "Genuinamente novo" = cicloFimEm nulo ou já a <= 3 dias de
 * vencer/vencido — blinda contra o webhook do Mercado Pago notificar mais de uma vez o
 * mesmo pagamento (o que, sem essa guarda, estenderia o ciclo +1 mês de graça a cada
 * repetição, com ou sem módulo de afiliados).
 */
export async function confirmarCicloEComissionar(redeId: string): Promise<void> {
  const antes = await prisma.assinatura.findUnique({ where: { redeId }, select: { cicloFimEm: true, valor: true } })
  const cicloGenuino = !antes?.cicloFimEm || antes.cicloFimEm.getTime() <= Date.now() + MARGEM_FRESCOR_MS

  await confirmarCiclo(redeId)

  if (cicloGenuino && antes) {
    await gerarComissaoDoCiclo({
      redeId,
      cicloEm: antes.cicloFimEm ?? new Date(),
      valorBaseAssinatura: antes.valor,
    })
  }
}

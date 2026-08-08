import { randomBytes } from 'node:crypto'
import type { Role } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { validarCodigo, consumirCodigo } from '../promo/promo.service'
import { precoParaQuantidade } from './faixa-desconto.service'
import { recomputarAssinaturaRede } from './assinatura-vendedora-rede.service'

/**
 * Assento de vendedora — registro de MEMBRO (quem ocupa a vaga). A cobrança em si é CONSOLIDADA
 * por marca (ver assinatura-vendedora-rede.service.ts, com desconto por volume em
 * faixa-desconto.service.ts) — este arquivo não cria preapproval nem guarda ciclo/valor cobrado
 * de verdade, só decide se o assento entra ATIVA e dispara o recálculo da cobrança da rede.
 *
 * Ciclo de vida do `status` do assento:
 * - PENDENTE + aprovadoEm nulo = aguardando aprovação do GESTOR (quem solicitou foi o GERENTE).
 * - ATIVA = membro ativo (aprovado). `valor` > 0 = conta como assento PAGO na faixa de desconto
 *   da marca; `valor` = 0 = coberto por cupom que zera a cobrança, não conta pro volume.
 * - CANCELADA = removida (terminal — pra voltar, convida de novo).
 *
 * Só cupom PERCENTUAL de 100% é suportado aqui: cobrança agora é UMA só por marca (não por
 * assento), então desconto parcial ou "dias grátis" por vendedora individual não tem como compor
 * com um preapproval único — se precisar disso no futuro, é desconto sobre a fatura consolidada.
 */

const DIAS_VALIDADE_CONVITE = 7

/** Coupon zera a cobrança desta vendedora (assento fica de graça, fora da faixa de desconto)? */
function cupomZeraValor(c: { tipo: string; percentual: unknown }): boolean {
  return c.tipo === 'PERCENTUAL' && Number(c.percentual) === 100
}

/**
 * Solicita um novo assento de vendedora: cria o Convite (VENDEDORA, ver convites.routes.ts) e a
 * AssinaturaVendedora na mesma transação. GESTOR/SUPER_ADMIN entra ATIVA na hora. GERENTE fica
 * aguardando aprovação do gestor — nenhum cupom é gasto nem a cobrança da marca é tocada até lá.
 */
export async function solicitarAssentoVendedora(input: {
  redeId: string
  lojaId: string
  equipeId?: string | null
  nome: string
  email: string
  telefone: string
  solicitadoPorId: string
  solicitadoPorRole: Role
  /** Cupom de desconto (distribuído pelo gestor da marca) — opcional. */
  codigoPromo?: string | null
}): Promise<
  | { ok: true; assinaturaId: string; aguardandoAprovacao: true }
  | { ok: true; assinaturaId: string; aguardandoAprovacao: false; initPoint?: string }
  | { ok: false; erro: string }
> {
  const email = input.email.toLowerCase()
  if (await prisma.usuario.findUnique({ where: { email }, select: { id: true } })) {
    return { ok: false, erro: 'Já existe um usuário com este e-mail.' }
  }

  const loja = await prisma.loja.findUnique({ where: { id: input.lojaId }, select: { redeId: true } })
  if (!loja || loja.redeId !== input.redeId) return { ok: false, erro: 'Loja inválida para esta rede.' }

  let codigoPromoId: string | null = null
  let gratuito = false
  if (input.codigoPromo) {
    const c = await validarCodigo(input.codigoPromo, 'VENDEDORA')
    if (!c) return { ok: false, erro: 'Cupom inválido, expirado ou esgotado.' }
    if (!cupomZeraValor(c)) {
      return { ok: false, erro: 'Este cupom só é aceito se der 100% de desconto — a cobrança agora é consolidada por marca, não dá pra aplicar desconto parcial num assento individual.' }
    }
    codigoPromoId = c.id
    gratuito = true
  }

  const token = randomBytes(24).toString('hex')
  const expiraEm = new Date(Date.now() + DIAS_VALIDADE_CONVITE * 86_400_000)
  const aprovadoDeCara = input.solicitadoPorRole !== 'GERENTE'
  const valor = gratuito ? 0 : await precoParaQuantidade(1) // referência informativa; a cobrança real é a da rede

  const assinatura = await prisma.$transaction(async (tx) => {
    const convite = await tx.convite.create({
      data: {
        token, nome: input.nome.trim(), email, telefone: input.telefone, role: 'VENDEDORA',
        redeId: input.redeId, lojaId: input.lojaId, equipeId: input.equipeId ?? null,
        criadoPorId: input.solicitadoPorId, expiraEm,
      },
    })
    // Numeração nunca reciclada: conta TODOS os assentos já existentes da rede (inclusive
    // cancelados), então o próximo número nunca colide nem se repete. Só rótulo de exibição.
    const totalAssentos = await tx.assinaturaVendedora.count({ where: { redeId: input.redeId } })
    return tx.assinaturaVendedora.create({
      data: {
        redeId: input.redeId, numeroAssento: totalAssentos + 1, conviteId: convite.id, valor,
        solicitadoPorId: input.solicitadoPorId,
        aprovadoEm: aprovadoDeCara ? new Date() : null,
        status: aprovadoDeCara ? 'ATIVA' : 'PENDENTE',
        codigoPromoId,
      },
    })
  })

  if (!aprovadoDeCara) return { ok: true, assinaturaId: assinatura.id, aguardandoAprovacao: true }

  if (gratuito && codigoPromoId) await consumirCodigo(codigoPromoId)
  const r = await recomputarAssinaturaRede(input.redeId)
  return { ok: true, assinaturaId: assinatura.id, aguardandoAprovacao: false, ...r }
}

/**
 * O GESTOR (dono da rede) aprova uma solicitação feita pelo GERENTE — só a partir daqui o
 * assento entra ATIVA e a cobrança consolidada da marca é recalculada.
 */
export async function aprovarAssentoVendedora(
  id: string, gestorId: string,
): Promise<{ ok: true; initPoint?: string } | { ok: false; erro: string }> {
  const gestor = await prisma.usuario.findUnique({ where: { id: gestorId }, select: { redeId: true, role: true } })
  if (!gestor || (gestor.role !== 'GESTOR' && gestor.role !== 'SUPER_ADMIN')) return { ok: false, erro: 'Só o gestor da rede pode aprovar.' }

  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a) return { ok: false, erro: 'Solicitação não encontrada.' }
  if (gestor.role === 'GESTOR' && a.redeId !== gestor.redeId) return { ok: false, erro: 'Fora da sua rede.' }
  if (a.aprovadoEm) return { ok: false, erro: 'Essa solicitação já foi aprovada.' }
  if (a.status === 'CANCELADA') return { ok: false, erro: 'Essa solicitação foi recusada/cancelada.' }

  await prisma.assinaturaVendedora.update({ where: { id }, data: { aprovadoEm: new Date(), status: 'ATIVA' } })
  if (a.codigoPromoId && Number(a.valor) === 0) await consumirCodigo(a.codigoPromoId)
  const r = await recomputarAssinaturaRede(a.redeId)
  return { ok: true, ...r }
}

/**
 * Aplica um cupom de 100% a um assento já ATIVA e hoje pago (ex.: o gestor esqueceu de usar o
 * cupom na hora do convite e prefere resolver assim em vez de esperar a cobrança consolidada).
 * O assento fica gratuito e sai da contagem de assentos pagos da marca — a cobrança da rede é
 * recalculada (na prática, um downgrade, que só vale a partir do próximo ciclo).
 */
export async function aplicarCupomAssentoVendedora(
  id: string, codigo: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a) return { ok: false, erro: 'Assento não encontrado.' }
  if (a.status !== 'ATIVA') return { ok: false, erro: 'Só é possível aplicar cupom num assento ativo.' }
  if (Number(a.valor) === 0) return { ok: false, erro: 'Este assento já é gratuito.' }

  const c = await validarCodigo(codigo, 'VENDEDORA')
  if (!c) return { ok: false, erro: 'Cupom inválido, expirado ou esgotado.' }
  if (!cupomZeraValor(c)) {
    return { ok: false, erro: 'Este cupom só é aceito se der 100% de desconto — a cobrança agora é consolidada por marca, não dá pra aplicar desconto parcial num assento individual.' }
  }

  await prisma.assinaturaVendedora.update({ where: { id }, data: { codigoPromoId: c.id, valor: 0 } })
  await consumirCodigo(c.id)
  await recomputarAssinaturaRede(a.redeId)
  return { ok: true }
}

/** O GESTOR recusa uma solicitação pendente do GERENTE — nada foi cobrado, nada a recalcular. */
export async function recusarAssentoVendedora(id: string, gestorId: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const gestor = await prisma.usuario.findUnique({ where: { id: gestorId }, select: { redeId: true, role: true } })
  if (!gestor || (gestor.role !== 'GESTOR' && gestor.role !== 'SUPER_ADMIN')) return { ok: false, erro: 'Só o gestor da rede pode recusar.' }

  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a) return { ok: false, erro: 'Solicitação não encontrada.' }
  if (gestor.role === 'GESTOR' && a.redeId !== gestor.redeId) return { ok: false, erro: 'Fora da sua rede.' }
  if (a.aprovadoEm) return { ok: false, erro: 'Já foi aprovada — cancele em vez de recusar.' }

  await prisma.$transaction(async (tx) => {
    await tx.assinaturaVendedora.update({ where: { id }, data: { status: 'CANCELADA' } })
    if (a.conviteId) await tx.convite.delete({ where: { id: a.conviteId } })
  })
  return { ok: true }
}

/**
 * Convite aceito (Usuario criado) — liga o assento ao Usuario recém-criado.
 * Chamado por convites.routes.ts POST /:token/aceitar.
 */
export async function resolverConviteAceito(conviteId: string, vendedoraId: string): Promise<void> {
  const a = await prisma.assinaturaVendedora.findUnique({ where: { conviteId } })
  if (!a) return
  await prisma.assinaturaVendedora.update({ where: { id: a.id }, data: { vendedoraId } })
}

/**
 * Vendedora desligada: o assento fica RESERVADO (vendedoraId volta a null, status continua ATIVA)
 * pra reatribuir a uma pessoa nova sem mexer na cobrança consolidada — não cancela sozinho.
 */
export async function liberarAssentoDaVendedora(vendedoraId: string): Promise<void> {
  await prisma.assinaturaVendedora.updateMany({
    where: { vendedoraId, status: { not: 'CANCELADA' } },
    data: { vendedoraId: null },
  })
}

/**
 * Cancela um assento (terminal — pra trazer alguém de volta, convida de novo). Corta o membro na
 * hora; a cobrança consolidada da marca é recalculada (o downgrade só entra em vigor no próximo
 * ciclo, ver recomputarAssinaturaRede).
 */
/**
 * Cancela um assento. Se ele era pago e a marca já tem uma cobrança consolidada em andamento, o
 * acesso da vendedora — e a contagem dela na faixa de desconto — ficam garantidos até o fim do
 * ciclo JÁ PAGO (não é prorrateado: mesmo usada só 15 dos 30 dias, a marca paga o ciclo inteiro
 * com ela contando). A baixa de verdade (status CANCELADA, sai da contagem) só acontece na
 * renovação seguinte, ver confirmarCicloAssentoVendedoraRede. Assento gratuito (cupom) ou sem
 * nenhuma cobrança ainda em andamento não tem ciclo pago a proteger — corta na hora.
 */
export async function cancelarAssentoVendedora(id: string): Promise<{ ok: true; acessoAte: Date | null } | { ok: false; erro: string }> {
  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a || a.status === 'CANCELADA') return { ok: true, acessoAte: null }

  const elegivelACarencia = a.status === 'ATIVA' && Number(a.valor) > 0
  const rede = elegivelACarencia ? await prisma.assinaturaVendedoraRede.findUnique({ where: { redeId: a.redeId } }) : null
  const acessoAte = rede && rede.status !== 'CANCELADA' && rede.cicloFimEm && rede.cicloFimEm.getTime() > Date.now() ? rede.cicloFimEm : null

  if (!acessoAte) {
    await prisma.assinaturaVendedora.update({ where: { id }, data: { status: 'CANCELADA', cancelamentoSolicitadoEm: null, cancelamentoOrigem: null } })
    await recomputarAssinaturaRede(a.redeId)
    return { ok: true, acessoAte: null }
  }

  // Continua ATIVA (segue contando na faixa da marca) até a renovação finalizar o corte de verdade.
  await prisma.assinaturaVendedora.update({ where: { id }, data: { cancelamentoSolicitadoEm: new Date(), cancelamentoOrigem: 'GESTOR' } })
  return { ok: true, acessoAte }
}

/** Desfaz um cancelamento agendado (ainda dentro da carência) — a vendedora continua normalmente. */
export async function reativarAssentoVendedora(id: string): Promise<boolean> {
  const a = await prisma.assinaturaVendedora.findUnique({ where: { id } })
  if (!a || a.status !== 'ATIVA' || !a.cancelamentoSolicitadoEm) return false
  await prisma.assinaturaVendedora.update({ where: { id }, data: { cancelamentoSolicitadoEm: null, cancelamentoOrigem: null } })
  return true
}

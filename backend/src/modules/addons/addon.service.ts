import type { TipoAddon } from '@prisma/client'
import { prisma } from '../../lib/prisma'

// Preço do Estoque Inteligente é placeholder (não validado com o usuário) — ajustável no painel
// do super admin (definirPrecoAddon), mesmo mecanismo dos outros add-ons.
const PADRAO: Record<TipoAddon, number> = { PROVADOR: 59.99, VENDEDORA_ZAIEZE: 297, ESTOQUE_INTELIGENTE: 49.9 }
const NOMES: Record<TipoAddon, string> = { PROVADOR: 'Provador Virtual', VENDEDORA_ZAIEZE: 'Vendedora ZAIEZE', ESTOQUE_INTELIGENTE: 'Estoque Inteligente' }
const RESUMOS: Record<TipoAddon, string> = {
  PROVADOR: 'Prova virtual com IA (foto e vídeo) — disponível para qualquer plano, cobrada à parte.',
  VENDEDORA_ZAIEZE: 'Loja 100% automatizada por IA: atende WhatsApp/Instagram, recomenda produtos e fecha vendas sozinha — disponível para qualquer plano, cobrada à parte.',
  ESTOQUE_INTELIGENTE: 'Campeões de venda e risco de ruptura por produto — disponível para qualquer plano, cobrada à parte.',
}

/** Preço vigente de um add-on (banco; cai no padrão se ainda não houver registro). */
export async function precoDoAddon(tipo: TipoAddon): Promise<number> {
  const c = await prisma.configAddon.findUnique({ where: { tipo }, select: { preco: true } })
  return c ? Number(c.preco) : PADRAO[tipo]
}

/** Define manualmente o preço de um add-on (admin). Só vale para novas assinaturas. */
export async function definirPrecoAddon(tipo: TipoAddon, preco: number): Promise<void> {
  await prisma.configAddon.upsert({ where: { tipo }, update: { preco }, create: { tipo, preco } })
}

/** Catálogo de add-ons (metadados do código + preço do banco) — usado em Planos e no admin. */
export async function listarAddons() {
  const tipos = Object.keys(NOMES) as TipoAddon[]
  return Promise.all(tipos.map(async (tipo) => ({ tipo, nome: NOMES[tipo], resumo: RESUMOS[tipo], preco: await precoDoAddon(tipo) })))
}

/** Fim do próximo ciclo mensal de um add-on (add-ons não têm opção anual). */
export function proximoCicloFimAddon(base = new Date()): Date {
  return new Date(base.getFullYear(), base.getMonth() + 1, base.getDate(), base.getHours(), base.getMinutes(), base.getSeconds())
}

/** Ativa/renova o ciclo do add-on — chamado quando o pagamento é confirmado (webhook MP) ou no modo simulado. */
export async function confirmarCicloAddon(redeId: string, tipo: TipoAddon): Promise<void> {
  await prisma.assinaturaAddon.update({
    where: { redeId_tipo: { redeId, tipo } },
    data: { status: 'ATIVA', cicloFimEm: proximoCicloFimAddon(), cancelamentoSolicitadoEm: null, cancelamentoOrigem: null },
  })
  if (tipo === 'VENDEDORA_ZAIEZE') await autoConfigurarLojaPadraoVendedoraIa(redeId)
}

/**
 * Ativação automática da "loja padrão" da Vendedora ZAIEZE quando o pagamento do add-on é
 * confirmado — só quando não há ambiguidade (rede com exatamente 1 loja). Com 0 ou 2+ lojas não
 * dá pra adivinhar; o gestor continua configurando manualmente em /vendedora-zaieze (a tela já
 * pré-seleciona a loja quando só existe uma). Não sobrescreve uma escolha manual já feita.
 */
async function autoConfigurarLojaPadraoVendedoraIa(redeId: string): Promise<void> {
  const rede = await prisma.rede.findUnique({ where: { id: redeId }, select: { lojaVendedoraIaId: true } })
  if (rede?.lojaVendedoraIaId) return
  const lojas = await prisma.loja.findMany({ where: { redeId }, select: { id: true } })
  if (lojas.length !== 1) return
  await prisma.rede.update({ where: { id: redeId }, data: { lojaVendedoraIaId: lojas[0].id } })
}

/**
 * Cancelamento por FIM DE CICLO (vale para MP, lojista e admin): marca o cancelamento, mas
 * MANTÉM o acesso até `cicloFimEm`. Se o ciclo já venceu, o corte é aplicado na hora.
 */
export async function solicitarCancelamentoAddon(redeId: string, tipo: TipoAddon, origem: string): Promise<{ acessoAte: Date | null }> {
  const a = await prisma.assinaturaAddon.findUnique({ where: { redeId_tipo: { redeId, tipo } } })
  if (!a || a.status === 'CANCELADA') return { acessoAte: a?.cicloFimEm ?? null }

  if (!a.cancelamentoSolicitadoEm) {
    await prisma.assinaturaAddon.update({ where: { id: a.id }, data: { cancelamentoSolicitadoEm: new Date(), cancelamentoOrigem: origem } })
  }
  await aplicarFimDeCicloAddon(redeId, tipo)
  return { acessoAte: a.cicloFimEm }
}

/** Reativa um add-on cujo cancelamento foi agendado mas o ciclo ainda não venceu. */
export async function reativarAddon(redeId: string, tipo: TipoAddon): Promise<boolean> {
  const a = await prisma.assinaturaAddon.findUnique({ where: { redeId_tipo: { redeId, tipo } } })
  if (!a || a.status === 'CANCELADA') return false
  await prisma.assinaturaAddon.update({ where: { id: a.id }, data: { cancelamentoSolicitadoEm: null, cancelamentoOrigem: null } })
  return true
}

/** Aplica a regra de fim de ciclo a UM add-on: se cancelamento agendado e ciclo vencido, encerra. */
export async function aplicarFimDeCicloAddon(redeId: string, tipo: TipoAddon): Promise<void> {
  const a = await prisma.assinaturaAddon.findUnique({ where: { redeId_tipo: { redeId, tipo } } })
  if (!a || a.status === 'CANCELADA') return
  const vencido = a.cancelamentoSolicitadoEm && a.cicloFimEm && a.cicloFimEm.getTime() <= Date.now()
  if (vencido) {
    await prisma.assinaturaAddon.update({ where: { id: a.id }, data: { status: 'CANCELADA' } })
    // A rota `contextoVendedoraIa` já checa addonAtivo() e para de responder sozinha assim que
    // cancelado — limpar aqui é higiene (evita reativar um dia com a loja antiga "fantasma"
    // configurada) e obriga reconfirmar a loja padrão se a assinatura for retomada depois.
    if (tipo === 'VENDEDORA_ZAIEZE') await prisma.rede.update({ where: { id: redeId }, data: { lojaVendedoraIaId: null } })
  }
}

/** Varredura (cron/admin): encerra todos os add-ons com ciclo vencido. Retorna quantos cortou. */
export async function encerrarAddonsVencidos(): Promise<number> {
  const vencidos = await prisma.assinaturaAddon.findMany({
    where: { status: { not: 'CANCELADA' }, cancelamentoSolicitadoEm: { not: null }, cicloFimEm: { lte: new Date() } },
    select: { redeId: true, tipo: true },
  })
  for (const a of vencidos) await aplicarFimDeCicloAddon(a.redeId, a.tipo)
  return vencidos.length
}

/** Está o add-on ativo (pago/em dia) para esta rede? Usado pelo gate `requireAddon`. */
export async function addonAtivo(redeId: string, tipo: TipoAddon): Promise<boolean> {
  const a = await prisma.assinaturaAddon.findUnique({ where: { redeId_tipo: { redeId, tipo } }, select: { status: true } })
  return a?.status === 'ATIVA'
}

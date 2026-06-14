import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Plano } from '@prisma/client'

export type Feature =
  | 'vendas' | 'produtos' | 'estoque' | 'clientes' | 'dashboard' | 'forma_recebimento' | 'whatsapp'
  | 'crm_segmentacao' | 'gamificacao' | 'estoque_inteligente'
  | 'multi_loja' | 'radar' | 'provador' | 'atacado' | 'ia_avancada' | 'portal_cliente'

/** Plano mínimo que libera cada funcionalidade (matriz central — ajustável). */
export const FEATURE_MIN_PLANO: Record<Feature, Plano> = {
  // START — operação completa + WhatsApp + operação em rede (lojas/vendedoras ilimitadas em todos os planos)
  vendas: 'START', produtos: 'START', estoque: 'START', clientes: 'START', dashboard: 'START', forma_recebimento: 'START', whatsapp: 'START', multi_loja: 'START',
  // PRO — relacionamento & performance
  crm_segmentacao: 'PRO', gamificacao: 'PRO', estoque_inteligente: 'PRO',
  // ELITE — IA avançada & canais premium
  radar: 'ELITE', provador: 'ELITE', atacado: 'ELITE', ia_avancada: 'ELITE', portal_cliente: 'ELITE',
}

const ORDEM: Record<Plano, number> = { START: 0, PRO: 1, ELITE: 2 }

export function planoInclui(plano: Plano, feature: Feature): boolean {
  return ORDEM[plano] >= ORDEM[FEATURE_MIN_PLANO[feature]]
}

/**
 * Catálogo dos planos para a tela de upgrade.
 * Lojas e vendedoras são ILIMITADAS em todos os planos — a diferenciação é por funcionalidade.
 */
export const PLANOS = [
  { plano: 'START' as Plano, nome: 'Start', preco: 97, limite: 'Lojas e vendedoras ilimitadas', resumo: 'Operação completa + WhatsApp + operação em rede (transferências/estoquista)' },
  { plano: 'PRO' as Plano, nome: 'Pro', preco: 297, limite: 'Lojas e vendedoras ilimitadas', resumo: 'Tudo do Start + carteira inteligente, comissão/ranking e estoque inteligente' },
  { plano: 'ELITE' as Plano, nome: 'Elite', preco: 697, limite: 'Lojas e vendedoras ilimitadas', resumo: 'Tudo do Pro + Radar, Provador, Atacado, IA avançada e Portal do Cliente' },
]

/**
 * preHandler que bloqueia a rota quando o plano da rede não inclui a feature.
 * SUPER_ADMIN (operador do SaaS) passa sempre.
 */
export function requireFeature(feature: Feature) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch {
      return reply.code(401).send({ erro: 'Token ausente ou inválido' })
    }
    if (request.user.role === 'SUPER_ADMIN') return
    const plano = request.user.plano ?? 'START'
    if (!planoInclui(plano, feature)) {
      return reply.code(403).send({
        erro: `Recurso disponível no plano ${FEATURE_MIN_PLANO[feature]}. Faça upgrade para liberar.`,
        upgrade: FEATURE_MIN_PLANO[feature],
      })
    }
  }
}

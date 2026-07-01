import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Plano } from '@prisma/client'

export type Feature =
  | 'vendas' | 'produtos' | 'estoque' | 'clientes' | 'dashboard' | 'forma_recebimento' | 'whatsapp'
  | 'funil' | 'atacado'
  | 'crm_segmentacao' | 'gamificacao'
  | 'multi_loja' | 'radar' | 'estoque_inteligente' | 'ia_avancada' | 'portal_cliente'

/** Plano mínimo que libera cada funcionalidade (matriz central — ajustável). */
export const FEATURE_MIN_PLANO: Record<Feature, Plano> = {
  // START — operação completa + WhatsApp + funil, atacado, operação em rede e Portal do Cliente
  // (loja da vendedora — parte do fluxo de venda a partir do estoque; lojas/vendedoras ilimitadas em todos os planos)
  vendas: 'START', produtos: 'START', estoque: 'START', clientes: 'START', dashboard: 'START', forma_recebimento: 'START', whatsapp: 'START', multi_loja: 'START', funil: 'START', atacado: 'START', portal_cliente: 'START',
  // PRO — relacionamento & performance
  crm_segmentacao: 'PRO', gamificacao: 'PRO',
  // ELITE — inteligência avançada & canais premium
  radar: 'ELITE', estoque_inteligente: 'ELITE', ia_avancada: 'ELITE',
}

const ORDEM: Record<Plano, number> = { START: 0, PRO: 1, ELITE: 2 }

export function planoInclui(plano: Plano, feature: Feature): boolean {
  return ORDEM[plano] >= ORDEM[FEATURE_MIN_PLANO[feature]]
}

/**
 * Catálogo dos planos para a tela de upgrade.
 * Lojas e vendedoras são ILIMITADAS em todos os planos — a diferenciação é por funcionalidade.
 */
// Metadados dos planos (preço vem do banco — ver planos.service.precosDosPlanos).
export const PLANOS_META = [
  { plano: 'START' as Plano, nome: 'Start', limite: 'Lojas e vendedoras ilimitadas', resumo: 'Operação completa + WhatsApp + funil de vendas, atacado, operação em rede e Portal do Cliente (loja da vendedora)' },
  { plano: 'PRO' as Plano, nome: 'Pro', limite: 'Lojas e vendedoras ilimitadas', resumo: 'Tudo do Start + carteira inteligente e comissão/ranking' },
  { plano: 'ELITE' as Plano, nome: 'Elite', limite: 'Lojas e vendedoras ilimitadas', resumo: 'Tudo do Pro + Radar, estoque inteligente e IA avançada' },
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

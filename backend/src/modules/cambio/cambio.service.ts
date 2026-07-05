import { prisma } from '../../lib/prisma'

const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=BRL&symbols=USD'

/**
 * Busca a cotação BRL→USD na Frankfurter (gratuita, sem chave) e atualiza o cache
 * (ConfigCambio). Lança em caso de falha — quem chama decide como logar; o cache mantém o
 * último valor bom (só grava no banco quando o fetch dá certo).
 */
export async function atualizarCotacaoUsd(): Promise<void> {
  const resp = await fetch(FRANKFURTER_URL)
  if (!resp.ok) throw new Error(`Frankfurter HTTP ${resp.status}`)
  const json = (await resp.json()) as { date?: string; rates?: { USD?: number } }
  const usd = json.rates?.USD
  if (!usd || !Number.isFinite(usd)) throw new Error('Frankfurter: USD ausente na resposta')
  await prisma.configCambio.upsert({
    where: { id: 1 },
    create: { id: 1, usdPorBrl: usd, dataCotacao: json.date ? new Date(json.date) : null },
    update: { usdPorBrl: usd, dataCotacao: json.date ? new Date(json.date) : null },
  })
}

/**
 * Cotação em cache (self-healing como percentualDescontoAnual). Nunca chama a Frankfurter ao
 * vivo — leitura local rápida, segura para o caminho crítico do checkout.
 */
export async function obterCotacaoAtual(): Promise<{ usdPorBrl: number | null; dataCotacao: Date | null }> {
  const c = await prisma.configCambio.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
  return { usdPorBrl: c.usdPorBrl != null ? Number(c.usdPorBrl) : null, dataCotacao: c.dataCotacao }
}

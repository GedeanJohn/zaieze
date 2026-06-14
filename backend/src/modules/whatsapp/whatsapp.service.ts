import type { StatusMensagem } from '@prisma/client'
import { env } from '../../env'

export interface DadosTemplate {
  nome: string
  loja: string
  vendedora: string
  totalGasto?: number
  diasSemCompra?: number | null
  segmento?: string
}

/** Substitui os placeholders do template pela informação do cliente. */
export function aplicarTemplate(template: string, d: DadosTemplate): string {
  const primeiro = d.nome.trim().split(/\s+/)[0] ?? d.nome
  const real = (v?: number) => `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  return template
    .replaceAll('{nome}', d.nome)
    .replaceAll('{primeiroNome}', primeiro)
    .replaceAll('{loja}', d.loja)
    .replaceAll('{vendedora}', d.vendedora)
    .replaceAll('{totalGasto}', real(d.totalGasto))
    .replaceAll('{diasSemCompra}', d.diasSemCompra != null ? String(d.diasSemCompra) : '—')
    .replaceAll('{segmento}', d.segmento ?? '')
}

/**
 * Envia uma mensagem via Evolution API (uma instância por vendedora).
 * Sem EVOLUTION_API_URL/instância configurada → modo SIMULADO (registra mas não envia).
 */
export async function enviarWhatsapp(opts: { instancia?: string | null; telefone: string; texto: string }): Promise<StatusMensagem> {
  if (!env.EVOLUTION_API_URL || !opts.instancia) return 'SIMULADA'
  try {
    const resp = await fetch(`${env.EVOLUTION_API_URL}/message/sendText/${opts.instancia}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.EVOLUTION_API_KEY ? { apikey: env.EVOLUTION_API_KEY } : {}),
      },
      body: JSON.stringify({ number: opts.telefone, text: opts.texto }),
    })
    return resp.ok ? 'ENVIADA' : 'FALHA'
  } catch {
    return 'FALHA'
  }
}

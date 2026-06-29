import { enviarTexto, type EnvioResultado, type RedeWA } from './meta.service'

export interface DadosTemplate {
  nome: string
  loja: string
  vendedora: string
  totalGasto?: number
  diasSemCompra?: number | null
  segmento?: string
  /** Link público do catálogo da vendedora (Portal do Cliente). Vazio quando o plano não inclui o portal. */
  link?: string
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
    .replaceAll('{link}', d.link ?? '')
}

/**
 * Envia uma mensagem de TEXTO pelo número OFICIAL da marca (WhatsApp Cloud API).
 * Sem a marca configurada (Rede.wa*) → modo SIMULADO (registra mas não envia).
 *
 * Atenção à janela de 24h: a Meta só aceita texto livre até 24h após a última mensagem
 * RECEBIDA do cliente. Fora da janela, o envio falha na Meta — use template (Fase 2).
 * O chamador (chat) valida a janela antes; campanhas migram para template na Fase 2.
 */
export async function enviarWhatsapp(opts: { rede: RedeWA; telefone: string; texto: string }): Promise<EnvioResultado> {
  return enviarTexto({ rede: opts.rede, telefone: opts.telefone, texto: opts.texto })
}

/**
 * Mensagem de voz (PTT) — na Cloud API exige upload de mídia + tipo audio (Fase 3).
 * Por ora registra como SIMULADA (não envia o áudio de verdade).
 */
export async function enviarWhatsappAudio(_opts: { rede: RedeWA; telefone: string; audioUrl: string }): Promise<EnvioResultado> {
  return { status: 'SIMULADA' }
}

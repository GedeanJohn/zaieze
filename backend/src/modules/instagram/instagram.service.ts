import { env } from '../../env'
import { cifrar, decifrar } from '../whatsapp/meta.service'

export { cifrar, decifrar, assinaturaValida, podeCifrar } from '../whatsapp/meta.service'

/**
 * Cliente da Instagram Messaging API (Meta Graph API) — UMA conta por marca (Rede.ig*).
 * Espelha o padrão do meta.service.ts (WhatsApp): sem credenciais na rede → modo SIMULADO.
 *
 * Diferente do WhatsApp, não existe "template" para responder fora da janela: só dá pra
 * mandar mensagem pra quem já mandou uma pra conta da marca, e só dentro de 24h.
 */

export interface RedeIG {
  igBusinessAccountId: string | null
  igTokenCifrado: string | null
}

export interface EnvioIGResultado {
  status: 'ENVIADA' | 'FALHA' | 'SIMULADA'
  igMessageId?: string
  erro?: string
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${env.META_API_VERSION}/${path}`
}

/** A marca tem Instagram oficial configurado (conta + token)? Senão, envio = SIMULADA. */
export function igConfigurado(rede: RedeIG): boolean {
  return Boolean(rede.igBusinessAccountId && rede.igTokenCifrado)
}

/** Envia uma mensagem de texto para um IGSID — só funciona dentro da janela de 24h. */
export async function enviarTextoIg(opts: { rede: RedeIG; igScopedId: string; texto: string }): Promise<EnvioIGResultado> {
  if (!igConfigurado(opts.rede)) return { status: 'SIMULADA' }
  const token = decifrar(opts.rede.igTokenCifrado!)
  try {
    const resp = await fetch(graphUrl(`${opts.rede.igBusinessAccountId}/messages`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: opts.igScopedId },
        message: { text: opts.texto },
      }),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return { status: 'FALHA', erro: txt.slice(0, 300) }
    }
    const data = (await resp.json()) as { message_id?: string }
    return { status: 'ENVIADA', igMessageId: data.message_id }
  } catch (e) {
    return { status: 'FALHA', erro: String(e) }
  }
}

/**
 * Confere se a conta/token estão válidos (usado ao salvar a config). Faz um GET na conta.
 * Retorna o @ (username) quando ok.
 */
export async function verificarContaIg(igBusinessAccountId: string, token: string): Promise<{ ok: boolean; username?: string; erro?: string }> {
  try {
    const resp = await fetch(graphUrl(`${igBusinessAccountId}?fields=username,name`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return { ok: false, erro: txt.slice(0, 300) }
    }
    const data = (await resp.json()) as { username?: string }
    return { ok: true, username: data.username }
  } catch (e) {
    return { ok: false, erro: String(e) }
  }
}

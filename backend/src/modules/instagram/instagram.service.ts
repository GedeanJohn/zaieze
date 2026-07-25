import { env } from '../../env'
import { cifrar, decifrar } from '../whatsapp/meta.service'

export { cifrar, decifrar, assinaturaValida, podeCifrar, appTechProviderConfigurado, trocarCodePorToken } from '../whatsapp/meta.service'

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

// ────────────────────── Conexão automática (Facebook Login comum) ──────────────────────
// Diferente do WhatsApp, o Instagram não tem um wizard "Embedded Signup" dedicado da Meta — o
// gestor faz um login comum (escopos instagram_basic/instagram_manage_messages/pages_show_list)
// e nós descobrimos, a partir das Páginas do Facebook que ele administra, quais têm uma conta
// Instagram Business vinculada.

/** Páginas do Facebook do usuário (via token trocado no login) que têm Instagram Business vinculado. */
export async function buscarPaginasComInstagram(userToken: string): Promise<
  { pageId: string; pageNome: string; pageToken: string; igBusinessAccountId: string; username?: string }[]
> {
  const resp = await fetch(graphUrl('me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100'), {
    headers: { Authorization: `Bearer ${userToken}` },
  })
  if (!resp.ok) return []
  const data = (await resp.json().catch(() => ({}))) as {
    data?: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[]
  }
  return (data.data ?? [])
    .filter((p) => p.instagram_business_account)
    .map((p) => ({
      pageId: p.id, pageNome: p.name, pageToken: p.access_token,
      igBusinessAccountId: p.instagram_business_account!.id, username: p.instagram_business_account!.username,
    }))
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

import crypto from 'node:crypto'
import type { StatusMensagem } from '@prisma/client'
import { env } from '../../env'

/**
 * Cliente da WhatsApp Cloud API (oficial da Meta) — UM número por marca (Rede.wa*).
 * Espelha o padrão do mercadopago.service: sem credenciais na rede → modo SIMULADO
 * (o envio devolve status 'SIMULADA' e nada é chamado na Meta).
 *
 * O token permanente (System User) é guardado criptografado (AES-256-GCM) em Rede.waTokenCifrado.
 */

/** Subconjunto da Rede necessário para enviar (decifra o token na hora). */
export interface RedeWA {
  waPhoneNumberId: string | null
  waTokenCifrado: string | null
}

export interface EnvioResultado {
  status: StatusMensagem // 'ENVIADA' | 'FALHA' | 'SIMULADA'
  waMessageId?: string
  erro?: string
}

export interface ParametroTemplate {
  texto: string
}

// ─────────────────────────── Cripto do token (AES-256-GCM) ───────────────────────────

export function podeCifrar(): boolean {
  return Boolean(env.WA_TOKEN_SECRET)
}

function chave(): Buffer {
  // Deriva 32 bytes da WA_TOKEN_SECRET (qualquer comprimento) via SHA-256.
  return crypto.createHash('sha256').update(env.WA_TOKEN_SECRET ?? '').digest()
}

/** Cifra um segredo → base64 (iv[12] + authTag[16] + ciphertext). Requer WA_TOKEN_SECRET. */
export function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv)
  const enc = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/** Decifra o que foi gerado por cifrar(). Lança se a chave mudou ou o blob é inválido. */
export function decifrar(blob: string): string {
  const raw = Buffer.from(blob, 'base64')
  const iv = raw.subarray(0, 12)
  const tag = raw.subarray(12, 28)
  const enc = raw.subarray(28)
  const d = crypto.createDecipheriv('aes-256-gcm', chave(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}

// ─────────────────────────── Estado / utilidades ───────────────────────────

/** A marca tem WhatsApp oficial configurado (número + token)? Senão, envio = SIMULADA. */
export function metaConfigurado(rede: RedeWA): boolean {
  return Boolean(rede.waPhoneNumberId && rede.waTokenCifrado)
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${env.META_API_VERSION}/${path}`
}

/** Normaliza para o formato da Meta: só dígitos, com DDI (não usa '+'). */
function normalizarNumero(telefone: string): string {
  return telefone.replace(/\D/g, '')
}

/** Valida a assinatura do webhook (X-Hub-Signature-256) contra o App Secret da marca. */
export function assinaturaValida(appSecret: string, rawBody: Buffer | string, header?: string): boolean {
  if (!header) return false
  const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(header))
  } catch {
    return false
  }
}

// ─────────────────────────── Envio (Graph API) ───────────────────────────

async function chamarMensagens(phoneNumberId: string, token: string, body: Record<string, unknown>): Promise<EnvioResultado> {
  try {
    const resp = await fetch(graphUrl(`${phoneNumberId}/messages`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return { status: 'FALHA', erro: txt.slice(0, 300) }
    }
    const data = (await resp.json()) as { messages?: { id?: string }[] }
    return { status: 'ENVIADA', waMessageId: data.messages?.[0]?.id }
  } catch (e) {
    return { status: 'FALHA', erro: String(e) }
  }
}

/** Envia texto livre — só permitido DENTRO da janela de 24h (o chamador garante isso). */
export async function enviarTexto(opts: { rede: RedeWA; telefone: string; texto: string }): Promise<EnvioResultado> {
  if (!metaConfigurado(opts.rede)) return { status: 'SIMULADA' }
  const token = decifrar(opts.rede.waTokenCifrado!)
  return chamarMensagens(opts.rede.waPhoneNumberId!, token, {
    messaging_product: 'whatsapp',
    to: normalizarNumero(opts.telefone),
    type: 'text',
    text: { body: opts.texto, preview_url: true },
  })
}

/** Envia um template HSM aprovado — permitido a QUALQUER momento (fora da janela inclusive). */
export async function enviarTemplate(opts: {
  rede: RedeWA
  telefone: string
  templateNome: string
  idioma?: string
  params?: ParametroTemplate[]
}): Promise<EnvioResultado> {
  if (!metaConfigurado(opts.rede)) return { status: 'SIMULADA' }
  const token = decifrar(opts.rede.waTokenCifrado!)
  const components = opts.params && opts.params.length > 0
    ? [{ type: 'body', parameters: opts.params.map((p) => ({ type: 'text', text: p.texto })) }]
    : []
  return chamarMensagens(opts.rede.waPhoneNumberId!, token, {
    messaging_product: 'whatsapp',
    to: normalizarNumero(opts.telefone),
    type: 'template',
    template: { name: opts.templateNome, language: { code: opts.idioma ?? 'pt_BR' }, components },
  })
}

/**
 * Confere se o número/token estão válidos (usado ao salvar a config). Faz um GET no número.
 * Retorna o display_phone_number quando ok.
 */
export async function verificarNumero(phoneNumberId: string, token: string): Promise<{ ok: boolean; numero?: string; erro?: string }> {
  try {
    const resp = await fetch(graphUrl(`${phoneNumberId}?fields=display_phone_number,verified_name`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return { ok: false, erro: txt.slice(0, 300) }
    }
    const data = (await resp.json()) as { display_phone_number?: string }
    return { ok: true, numero: data.display_phone_number }
  } catch (e) {
    return { ok: false, erro: String(e) }
  }
}

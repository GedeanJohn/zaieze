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

// ─────────────────────────── Templates HSM ───────────────────────────

/** Extrai os placeholders nomeados do corpo, na ordem de 1ª aparição (distintos). */
export function placeholdersDoCorpo(corpo: string): string[] {
  const ordem: string[] = []
  for (const m of corpo.matchAll(/\{(\w+)\}/g)) {
    const nome = m[1]
    if (!ordem.includes(nome)) ordem.push(nome)
  }
  return ordem
}

/** Converte o corpo com placeholders nomeados para o formato da Meta ({{1}},{{2}}...). */
export function corpoParaMeta(corpo: string, variaveis: string[]): string {
  let out = corpo
  variaveis.forEach((v, i) => { out = out.replaceAll(`{${v}}`, `{{${i + 1}}}`) })
  return out
}

/** Mapeia o status do template da Meta para o nosso enum. */
export function mapearStatusTemplate(s: string | undefined): 'APROVADO' | 'PENDENTE' | 'REJEITADO' | 'PAUSADO' {
  switch ((s ?? '').toUpperCase()) {
    case 'APPROVED': return 'APROVADO'
    case 'REJECTED': return 'REJEITADO'
    case 'PAUSED':
    case 'DISABLED': return 'PAUSADO'
    default: return 'PENDENTE'
  }
}

/** Submete um template à Meta para aprovação. Retorna o id e o status iniciais. */
export async function criarTemplateMeta(opts: {
  wabaId: string
  token: string
  metaNome: string
  idioma: string
  categoria: string
  corpoMeta: string
  exemplos: string[] // 1 exemplo por parâmetro {{n}}
}): Promise<{ ok: boolean; metaId?: string; status?: string; erro?: string }> {
  const body: Record<string, unknown> = {
    name: opts.metaNome,
    language: opts.idioma,
    category: opts.categoria,
    components: [
      {
        type: 'BODY',
        text: opts.corpoMeta,
        ...(opts.exemplos.length > 0 ? { example: { body_text: [opts.exemplos] } } : {}),
      },
    ],
  }
  try {
    const resp = await fetch(graphUrl(`${opts.wabaId}/message_templates`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await resp.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string } }
    if (!resp.ok) return { ok: false, erro: data.error?.message ?? `HTTP ${resp.status}` }
    return { ok: true, metaId: data.id, status: data.status }
  } catch (e) {
    return { ok: false, erro: String(e) }
  }
}

/** Lista os templates da WABA na Meta (nome + status) — usado para sincronizar o status. */
export async function consultarTemplatesMeta(wabaId: string, token: string): Promise<{ name: string; status: string; id: string }[]> {
  try {
    const resp = await fetch(graphUrl(`${wabaId}/message_templates?fields=name,status,id&limit=200`), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!resp.ok) return []
    const data = (await resp.json()) as { data?: { name: string; status: string; id: string }[] }
    return data.data ?? []
  } catch {
    return []
  }
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

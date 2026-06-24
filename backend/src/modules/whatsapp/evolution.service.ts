import { env } from '../../env'

/**
 * Cliente da Evolution API v2 (WhatsApp não-oficial, instância por vendedora via QR).
 * Comunicação interna (http://evolution:8080). Sem EVOLUTION_API_URL/KEY → modo desligado
 * (o envio cai em SIMULADA no whatsapp.service e a conexão não é oferecida).
 *
 * Fluxo do QR: o create NÃO devolve o QR; ele chega pelo webhook QRCODE_UPDATED e é
 * guardado em Usuario.waQrcode. CONNECTION_UPDATE state=open marca waConectado.
 */

export function evolutionConfigurado(): boolean {
  return Boolean(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY)
}

function urlBase(): string {
  return (env.EVOLUTION_API_URL ?? '').replace(/\/$/, '')
}

async function chamar<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const resp = await fetch(`${urlBase()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', apikey: env.EVOLUTION_API_KEY ?? '' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`Evolution ${method} ${path} → ${resp.status} ${txt.slice(0, 200)}`)
  }
  return resp.json() as Promise<T>
}

const EVENTOS = ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT']

/** Cria (idempotente) a instância e configura o webhook para o nosso backend. */
export async function criarInstancia(instancia: string): Promise<void> {
  try {
    await chamar('/instance/create', 'POST', { instanceName: instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true })
  } catch {
    /* já existe — segue para (re)configurar o webhook */
  }
  await chamar(`/webhook/set/${instancia}`, 'POST', {
    webhook: { enabled: true, url: env.EVOLUTION_WEBHOOK_URL, webhookByEvents: false, base64: true, events: EVENTOS },
  })
}

/** Dispara a conexão e retorna o QR (base64) já na resposta; o webhook também o atualiza. */
export async function conectarInstancia(instancia: string): Promise<string | null> {
  try {
    const r = await chamar<{ base64?: string }>(`/instance/connect/${instancia}`)
    return r.base64 ?? null
  } catch {
    return null // já conectando — o QR virá pelo webhook
  }
}

/** Estado atual: 'open' | 'connecting' | 'close'. */
export async function estadoInstancia(instancia: string): Promise<string> {
  try {
    const r = await chamar<{ instance?: { state?: string } }>(`/instance/connectionState/${instancia}`)
    return r.instance?.state ?? 'close'
  } catch {
    return 'close'
  }
}

/** Desconecta o número (logout) mantendo a instância. */
export async function desconectarInstancia(instancia: string): Promise<void> {
  try { await chamar(`/instance/logout/${instancia}`, 'DELETE') } catch { /* ignore */ }
}

/** Remove a instância por completo. */
export async function deletarInstancia(instancia: string): Promise<void> {
  try { await chamar(`/instance/delete/${instancia}`, 'DELETE') } catch { /* ignore */ }
}

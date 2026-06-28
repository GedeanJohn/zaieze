import type { Plano } from '@prisma/client'
import { env } from '../../env'

/** Sem token configurado, o checkout opera em modo simulado (igual Evolution/Claude no projeto). */
export function mpConfigurado(): boolean {
  return Boolean(env.MERCADOPAGO_ACCESS_TOKEN)
}

interface PreapprovalResult {
  id: string
  initPoint: string
}

/**
 * Cria uma assinatura recorrente mensal (preapproval) no Mercado Pago.
 * Só é chamada quando MERCADOPAGO_ACCESS_TOKEN está presente.
 */
export async function criarPreapproval(opts: {
  plano: Plano
  valor: number
  email: string
  redeSlug: string
  backUrl: string
  diasGratis?: number // free trial: 1ª cobrança só depois de N dias
}): Promise<PreapprovalResult> {
  const resp = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reason: `ModaCRM AI — Plano ${opts.plano}`,
      external_reference: opts.redeSlug,
      payer_email: opts.email,
      back_url: opts.backUrl,
      // URL de notificação embutida na assinatura: o MP avisa este endpoint nos eventos
      // do preapproval, sem depender de webhook configurado no painel da aplicação.
      notification_url: `${env.TENANT_SCHEME}://${env.DOMINIO_BASE}/api/assinaturas/webhook`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: opts.valor,
        currency_id: 'BRL',
        // Dias grátis (ex.: "comece a pagar daqui a 90 dias") via código promocional.
        ...(opts.diasGratis && opts.diasGratis > 0
          ? { free_trial: { frequency: opts.diasGratis, frequency_type: 'days' } }
          : {}),
      },
      status: 'pending',
    }),
  })

  if (!resp.ok) {
    const txt = await resp.text()
    throw Object.assign(new Error(`Mercado Pago respondeu ${resp.status}: ${txt}`), { statusCode: 502 })
  }

  const data = (await resp.json()) as { id: string; init_point: string }
  return { id: data.id, initPoint: data.init_point }
}

/**
 * Cancela uma assinatura recorrente (preapproval) no Mercado Pago. Um preapproval
 * cancelado é terminal — não volta a cobrar. No-op em modo simulado.
 */
export async function cancelarPreapproval(id: string): Promise<void> {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return
  const resp = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'cancelled' }),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw Object.assign(new Error(`Mercado Pago respondeu ${resp.status}: ${txt}`), { statusCode: 502 })
  }
}

/**
 * Consulta o status de uma assinatura (preapproval) no Mercado Pago.
 * Status possíveis: 'pending' | 'authorized' | 'paused' | 'cancelled'.
 * Usado no webhook para NÃO confiar cegamente na notificação recebida.
 */
export async function consultarPreapproval(id: string): Promise<string | null> {
  if (!env.MERCADOPAGO_ACCESS_TOKEN) return null
  const resp = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}` },
  })
  if (!resp.ok) return null
  const data = (await resp.json()) as { status?: string }
  return data.status ?? null
}

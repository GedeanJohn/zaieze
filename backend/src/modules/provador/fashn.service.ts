import { env } from '../../env'

/**
 * Integração com a FASHN AI (provador virtual — módulo 13).
 * Dois passos, mesmo fornecedor (1 chave, 1 DPA — a imagem deriva da selfie do cliente):
 *  1) try-on:          selfie do cliente + foto da peça → foto vestida
 *  2) image-to-video:  foto vestida → vídeo curto da peça em movimento
 *
 * Sem FASHN_API_KEY → modo simulado: o worker usa a própria foto do produto como "look"
 * e não gera vídeo (custo zero). As funções abaixo só são chamadas quando há chave.
 *
 * Contrato da API (ajustar conforme docs.fashn.ai se mudar):
 *  POST {url}/run            { model_name, inputs }            → { id }
 *  GET  {url}/status/{id}                                       → { status, output: string[], error? }
 *  status ∈ 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed'
 */

export function fashnConfigurado(): boolean {
  return Boolean(env.FASHN_API_KEY)
}

export type ConsultaFashn =
  | { status: 'processando' }
  | { status: 'pronto'; url: string }
  | { status: 'falhou'; erro: string }

async function fashn(path: string, body?: unknown): Promise<any> {
  const resp = await fetch(`${env.FASHN_API_URL.replace(/\/$/, '')}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${env.FASHN_API_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!resp.ok) throw new Error(`FASHN ${path} → HTTP ${resp.status}`)
  return resp.json()
}

/** Inicia o try-on (selfie + peça). Retorna o id externo para polling. */
export async function iniciarTryOn(opts: { selfieUrl: string; pecaUrl: string }): Promise<string> {
  const r = await fashn('/run', {
    model_name: 'tryon-v1.6',
    inputs: { model_image: opts.selfieUrl, garment_image: opts.pecaUrl },
  })
  return r.id as string
}

/** Inicia o vídeo (image-to-video) a partir da foto já gerada. */
export async function iniciarVideo(opts: { fotoUrl: string }): Promise<string> {
  const r = await fashn('/run', {
    // motion vazio = FASHN planeja o movimento pelo tipo de peça (recomendado nos docs)
    model_name: 'image-to-video',
    inputs: { image: opts.fotoUrl },
  })
  return r.id as string
}

/** Consulta o status de um job (try-on ou vídeo). */
export async function consultar(externalId: string): Promise<ConsultaFashn> {
  const r = await fashn(`/status/${externalId}`)
  if (r.status === 'completed') {
    const url = Array.isArray(r.output) ? r.output[0] : r.output
    if (!url) return { status: 'falhou', erro: 'FASHN concluiu sem output' }
    return { status: 'pronto', url }
  }
  if (r.status === 'failed') return { status: 'falhou', erro: r.error ?? 'FASHN falhou' }
  return { status: 'processando' }
}

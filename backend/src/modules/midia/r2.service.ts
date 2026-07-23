import crypto from 'node:crypto'
import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { env } from '../../env'

/**
 * Upload de mídia para o Cloudflare R2 (egress grátis, servido via cdn.zaieze.com).
 * Sem credenciais R2 configuradas → modo simulado (não envia, devolve null).
 */

export function r2Configurado(): boolean {
  return Boolean(env.R2_ACCOUNT_ID && env.R2_BUCKET && env.R2_PUBLIC_URL && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY)
}

let client: S3Client | null = null
function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    })
  }
  return client
}

/**
 * Envia um buffer para o R2 sob uma chave organizada por loja/pasta e devolve a URL pública.
 * @returns URL pública (cdn.zaieze.com/chave) ou null em modo simulado.
 */
export async function enviarParaR2(opts: {
  buffer: Buffer
  contentType: string
  ext: string
  lojaId: string
  pasta: 'fotos' | 'videos' | 'perfil' | 'audio' | 'comprovantes'
}): Promise<string | null> {
  if (!r2Configurado()) return null
  const chave = `${opts.lojaId}/${opts.pasta}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${opts.ext}`
  await r2().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET!,
      Key: chave,
      Body: opts.buffer,
      ContentType: opts.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  return `${env.R2_PUBLIC_URL!.replace(/\/$/, '')}/${chave}`
}

/** Converte uma URL pública (cdn.zaieze.com/chave) na chave do objeto no bucket. */
function chaveDaUrl(url: string): string | null {
  if (!env.R2_PUBLIC_URL) return null
  const base = env.R2_PUBLIC_URL.replace(/\/$/, '')
  if (!url.startsWith(base)) return null // mídia local/externa (dev) — ignora
  return url.slice(base.length + 1)
}

/**
 * Apaga objetos do R2 a partir das URLs públicas (até 1000 por chamada).
 * URLs que não são do bucket (uploads locais em dev) são ignoradas.
 * @returns quantidade de objetos efetivamente solicitados para exclusão.
 */
export async function excluirDoR2(urls: string[]): Promise<number> {
  if (!r2Configurado() || urls.length === 0) return 0
  const chaves = urls.map(chaveDaUrl).filter((k): k is string => !!k)
  if (chaves.length === 0) return 0
  // DeleteObjects aceita no máx. 1000 chaves por requisição.
  for (let i = 0; i < chaves.length; i += 1000) {
    const lote = chaves.slice(i, i + 1000)
    await r2().send(new DeleteObjectsCommand({ Bucket: env.R2_BUCKET!, Delete: { Objects: lote.map((Key) => ({ Key })) } }))
  }
  return chaves.length
}

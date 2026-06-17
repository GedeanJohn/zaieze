import crypto from 'node:crypto'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
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
  pasta: 'fotos' | 'videos'
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

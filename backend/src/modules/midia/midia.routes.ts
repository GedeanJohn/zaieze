import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { lojaIdDe } from '../../plugins/auth'
import { env } from '../../env'
import { enviarParaR2, r2Configurado } from './r2.service'

/**
 * Upload de mídia do catálogo.
 * - Fotos: comprimidas (sharp → webp).
 * - Vídeos: transcodificados para MP4 H.264 (ffmpeg) — compatibilidade + tamanho.
 * Produção: vai para o Cloudflare R2 (cdn.zaieze.com). Sem R2 → salva local em /api/uploads (dev).
 */

const TIPOS_IMG = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])
const MUTACAO = ['SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE'] as const

export async function salvarUploadLocal(buffer: Buffer, ext: string): Promise<string> {
  const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
  await fs.mkdir(dir, { recursive: true })
  const nome = `midia-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  await fs.writeFile(path.join(dir, nome), buffer)
  return `/api/uploads/${nome}`
}

/**
 * Transcodifica um áudio (qualquer formato gravado no navegador: webm/opus, mp4/aac…)
 * para OGG/Opus — o formato que o WhatsApp reconhece como "mensagem de voz" (PTT).
 * Recebe e devolve Buffer (lida com os arquivos temporários internamente).
 */
export async function transcodificarAudioOpus(entrada: Buffer): Promise<Buffer> {
  const tmp = os.tmpdir()
  const id = crypto.randomBytes(8).toString('hex')
  const fin = path.join(tmp, `aud-in-${id}`)
  const fout = path.join(tmp, `aud-out-${id}.ogg`)
  try {
    await fs.writeFile(fin, entrada)
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-i', fin, '-c:a', 'libopus', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-application', 'voip', '-y', fout])
      let stderr = ''
      ff.stderr.on('data', (d) => { stderr += d.toString() })
      ff.on('error', reject)
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg áudio falhou (${code}): ${stderr.slice(-400)}`))))
    })
    return await fs.readFile(fout)
  } finally {
    fs.unlink(fin).catch(() => {})
    fs.unlink(fout).catch(() => {})
  }
}

/** Transcodifica um arquivo de vídeo para MP4 H.264/AAC (máx 1280px, faststart). */
function transcodificarMp4(entrada: string, saida: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-i', entrada,
      '-vf', "scale='min(1280,iw)':-2",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      '-y', saida,
    ])
    let stderr = ''
    ff.stderr.on('data', (d) => { stderr += d.toString() })
    ff.on('error', reject)
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg falhou (${code}): ${stderr.slice(-400)}`))))
  })
}

export async function midiaRoutes(app: FastifyInstance) {
  // Upload de foto: comprime para webp (máx 1280px) e devolve a URL pública.
  app.post('/imagem', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo de imagem no campo "file"' })
    if (!TIPOS_IMG.has(arquivo.mimetype)) return reply.code(422).send({ erro: 'Formato inválido. Use PNG, JPG, WEBP ou AVIF.' })

    const original = await arquivo.toBuffer()
    const buffer = await sharp(original).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()

    const url = (await enviarParaR2({ buffer, contentType: 'image/webp', ext: 'webp', lojaId, pasta: 'fotos' })) ?? (await salvarUploadLocal(buffer, 'webp'))
    return { url, modo: r2Configurado() ? 'r2' : 'local' }
  })

  // Upload de vídeo: transcodifica para MP4 (ffmpeg) e devolve a URL pública.
  app.post('/video', { preHandler: [app.authorize(...MUTACAO)] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo de vídeo no campo "file"' })
    if (!arquivo.mimetype.startsWith('video/')) return reply.code(422).send({ erro: 'Formato inválido. Envie um arquivo de vídeo.' })

    const tmp = os.tmpdir()
    const id = crypto.randomBytes(8).toString('hex')
    const entrada = path.join(tmp, `in-${id}`)
    const saida = path.join(tmp, `out-${id}.mp4`)
    try {
      // Grava o upload em disco via stream (evita carregar o vídeo todo na memória)
      await pipeline(arquivo.file, createWriteStream(entrada))
      if (arquivo.file.truncated) return reply.code(413).send({ erro: 'Vídeo muito grande (máx 60 MB).' })

      await transcodificarMp4(entrada, saida)
      const buffer = await fs.readFile(saida)

      const url = (await enviarParaR2({ buffer, contentType: 'video/mp4', ext: 'mp4', lojaId, pasta: 'videos' })) ?? (await salvarUploadLocal(buffer, 'mp4'))
      return { url, modo: r2Configurado() ? 'r2' : 'local' }
    } catch (e) {
      request.log.error({ err: e }, 'falha ao processar vídeo')
      return reply.code(500).send({ erro: 'Não foi possível processar o vídeo. Tente outro arquivo.' })
    } finally {
      fs.unlink(entrada).catch(() => {})
      fs.unlink(saida).catch(() => {})
    }
  })
}

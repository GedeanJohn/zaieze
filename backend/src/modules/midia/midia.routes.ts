import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { lojaIdDe } from '../../plugins/auth'
import { env } from '../../env'
import { enviarParaR2, r2Configurado } from './r2.service'

/**
 * Upload de mídia do catálogo. Fotos são comprimidas (sharp) antes de subir.
 * Produção: vai para o Cloudflare R2 (cdn.zaieze.com). Sem R2 → salva local em /api/uploads (dev).
 */

const TIPOS_IMG = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])

async function salvarLocal(buffer: Buffer, ext: string): Promise<string> {
  const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
  await fs.mkdir(dir, { recursive: true })
  const nome = `midia-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  await fs.writeFile(path.join(dir, nome), buffer)
  return `/api/uploads/${nome}`
}

export async function midiaRoutes(app: FastifyInstance) {
  // Upload de foto: comprime para webp (máx 1280px) e devolve a URL pública.
  app.post('/imagem', { preHandler: [app.authorize('SUPER_ADMIN', 'GESTOR', 'ESTOQUISTA', 'GERENTE')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo de imagem no campo "file"' })
    if (!TIPOS_IMG.has(arquivo.mimetype)) return reply.code(422).send({ erro: 'Formato inválido. Use PNG, JPG, WEBP ou AVIF.' })

    const original = await arquivo.toBuffer()
    // Comprime: corrige orientação, redimensiona (sem ampliar) e converte para webp.
    const buffer = await sharp(original).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()

    const url = (await enviarParaR2({ buffer, contentType: 'image/webp', ext: 'webp', lojaId, pasta: 'fotos' })) ?? (await salvarLocal(buffer, 'webp'))
    return { url, modo: r2Configurado() ? 'r2' : 'local' }
  })
}

import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { redeIdDe } from '../../plugins/auth'
import { env } from '../../env'

/**
 * Identidade visual da marca (logo + cores) e regra de SLA dos leads — nível REDE.
 * O gestor configura uma vez e vale para o catálogo público de todas as lojas/vendedoras.
 */

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const TIPOS_LOGO: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }

const atualizarSchema = z.object({
  descricaoPublica: z.string().max(500).nullish(),
  corPrimaria: z.string().regex(HEX).optional(),
  corSecundaria: z.string().regex(HEX).optional(),
  slaEntrouMin: z.coerce.number().int().min(1).max(10080).optional(),
  slaAtendidoMin: z.coerce.number().int().min(1).max(43200).optional(),
  slaNegociandoMin: z.coerce.number().int().min(1).max(43200).optional(),
  slaApertadoPct: z.coerce.number().int().min(1).max(90).optional(),
  slaAutoRedistribuir: z.boolean().optional(),
  pedidoMinimoAtacado: z.coerce.number().int().min(2).max(1000).optional(),
  textoDisparoPadrao: z.string().max(1000).optional(),
  disparoVendedoraEditavel: z.boolean().optional(),
})

const selectMarca = {
  id: true, nome: true, slug: true, logoUrl: true, bannerUrl: true, descricaoPublica: true, corPrimaria: true, corSecundaria: true,
  slaEntrouMin: true, slaAtendidoMin: true, slaNegociandoMin: true, slaApertadoPct: true, slaAutoRedistribuir: true,
  pedidoMinimoAtacado: true,
  textoDisparoPadrao: true, disparoVendedoraEditavel: true,
}

export async function marcaRoutes(app: FastifyInstance) {
  // Lê o branding/SLA da própria rede (qualquer papel do tenant, para exibição na UI).
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const redeId = redeIdDe(request)
    return prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: selectMarca })
  })

  // Atualiza cores e SLA (só o gestor da marca).
  app.patch('/', { preHandler: [app.authorize('GESTOR')] }, async (request) => {
    const redeId = redeIdDe(request)
    const body = atualizarSchema.parse(request.body)
    return prisma.rede.update({ where: { id: redeId }, data: body, select: selectMarca })
  })

  // Upload da logo da marca (multipart). Salva em /api/uploads e grava o caminho na rede.
  app.post('/logo', { preHandler: [app.authorize('GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo de imagem no campo "file"' })
    const ext = TIPOS_LOGO[arquivo.mimetype]
    if (!ext) return reply.code(422).send({ erro: 'Formato inválido. Use PNG, JPG, WEBP ou SVG.' })

    const buffer = await arquivo.toBuffer()
    const nome = `logo-${redeId}-${crypto.randomBytes(6).toString('hex')}.${ext}`
    const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, nome), buffer)

    const logoUrl = `/api/uploads/${nome}`
    const rede = await prisma.rede.update({ where: { id: redeId }, data: { logoUrl }, select: selectMarca })

    // remove a logo antiga (best-effort) para não acumular arquivos órfãos
    const anterior = (request.query as { anterior?: string }).anterior
    if (anterior?.startsWith('/api/uploads/') && anterior !== logoUrl) {
      fs.unlink(path.join(dir, path.basename(anterior))).catch(() => {})
    }
    return rede
  })

  // Upload do banner do catálogo público (multipart). Mesma lógica da logo.
  app.post('/banner', { preHandler: [app.authorize('GESTOR')] }, async (request, reply) => {
    const redeId = redeIdDe(request)
    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie um arquivo de imagem no campo "file"' })
    const ext = TIPOS_LOGO[arquivo.mimetype]
    if (!ext) return reply.code(422).send({ erro: 'Formato inválido. Use PNG, JPG, WEBP ou SVG.' })

    const buffer = await arquivo.toBuffer()
    const nome = `banner-${redeId}-${crypto.randomBytes(6).toString('hex')}.${ext}`
    const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, nome), buffer)

    const bannerUrl = `/api/uploads/${nome}`
    const rede = await prisma.rede.update({ where: { id: redeId }, data: { bannerUrl }, select: selectMarca })

    const anterior = (request.query as { anterior?: string }).anterior
    if (anterior?.startsWith('/api/uploads/') && anterior !== bannerUrl) {
      fs.unlink(path.join(dir, path.basename(anterior))).catch(() => {})
    }
    return rede
  })

  // Remove o banner (volta a não exibir a faixa no catálogo).
  app.delete('/banner', { preHandler: [app.authorize('GESTOR')] }, async (request) => {
    const redeId = redeIdDe(request)
    const atual = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { bannerUrl: true } })
    if (atual.bannerUrl?.startsWith('/api/uploads/')) {
      const dir = path.resolve(process.cwd(), env.UPLOAD_DIR)
      fs.unlink(path.join(dir, path.basename(atual.bannerUrl))).catch(() => {})
    }
    return prisma.rede.update({ where: { id: redeId }, data: { bannerUrl: null }, select: selectMarca })
  })
}

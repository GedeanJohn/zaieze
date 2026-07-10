import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import sharp from 'sharp'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { lojaIdDe, redeIdDeQualquer } from '../../plugins/auth'
import { requireAddon } from '../../plugins/planos'
import { enviarParaR2 } from '../midia/r2.service'
import { salvarUploadLocal } from '../midia/midia.routes'
import { statusCota } from './cota.service'

/**
 * Provador virtual — add-on vendido À PARTE de qualquer plano (START/PRO/ELITE), com
 * assinatura própria (ver módulo addons). Fluxo B2B sem Portal do Cliente:
 *  1) a vendedora/gestor cria um look para uma peça → gera um LINK PÚBLICO por token;
 *  2) manda o link no WhatsApp; o cliente abre, CONSENTE (LGPD) e envia a selfie;
 *  3) o worker chama a FASHN (foto try-on + vídeo) e o resultado volta para a vendedora.
 * A selfie é dado pessoal sensível: expurgada assim que a foto é gerada (ver worker).
 */

const MUTACAO = ['SUPER_ADMIN', 'GESTOR', 'GERENTE', 'VENDEDORA'] as const
const TIPOS_IMG = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])

/** URL pública para o cliente enviar a selfie: <scheme>://<rede>.<dominio>/look/<token>. */
function urlProvadorPublica(redeSlug: string, token: string): string {
  return `${env.TENANT_SCHEME}://${redeSlug}.${env.DOMINIO_BASE}/look/${token}`
}

const criarSchema = z.object({
  produtoBaseId: z.string().min(1),
  comVideo: z.boolean().default(false),
})

export async function provadorRoutes(app: FastifyInstance) {
  // ─────────── Painel (autenticado, gate de plano ELITE) ───────────

  // Cota mensal da rede (para a tela mostrar quanto resta).
  app.get('/cota', { preHandler: [requireAddon('PROVADOR'), app.authorize(...MUTACAO)] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    return statusCota(redeId)
  })

  // Cria um look e devolve o link público para enviar ao cliente.
  app.post('/looks', { preHandler: [requireAddon('PROVADOR'), app.authorize(...MUTACAO)] }, async (request, reply) => {
    const body = criarSchema.parse(request.body ?? {})
    const lojaId = await lojaIdDe(request)
    const redeId = await redeIdDeQualquer(request)

    const cota = await statusCota(redeId)
    if (!cota.ok) return reply.code(429).send({ erro: `Cota mensal de looks atingida (${cota.usados}/${cota.limite}).`, cota })

    // A peça precisa existir na rede e ter ao menos uma foto (entrada do try-on).
    const produto = await prisma.produto.findFirst({
      where: { id: body.produtoBaseId, redeId },
      select: { id: true, nome: true, fotos: true },
    })
    if (!produto) return reply.code(404).send({ erro: 'Produto não encontrado nesta marca' })
    if (produto.fotos.length === 0) return reply.code(422).send({ erro: 'A peça precisa ter ao menos uma foto para o provador' })

    const expiraEm = new Date(Date.now() + env.PROVADOR_LINK_HORAS * 60 * 60 * 1000)
    const look = await prisma.lookProvador.create({
      data: { redeId, lojaId, produtoBaseId: produto.id, criadoPorId: request.user.sub, comVideo: body.comVideo, expiraEm },
      select: { id: true, token: true, expiraEm: true },
    })

    const rede = await prisma.rede.findUnique({ where: { id: redeId }, select: { slug: true } })
    return {
      id: look.id,
      token: look.token,
      url: rede ? urlProvadorPublica(rede.slug, look.token) : null,
      expiraEm: look.expiraEm,
    }
  })

  // Lista os looks da loja (galeria + acompanhamento de status).
  app.get('/looks', { preHandler: [requireAddon('PROVADOR'), app.authorize(...MUTACAO)] }, async (request) => {
    const lojaId = await lojaIdDe(request)
    const looks = await prisma.lookProvador.findMany({
      where: { lojaId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, status: true, comVideo: true, fotoUrl: true, videoUrl: true, viaIa: true,
        erro: true, expiraEm: true, createdAt: true,
        produto: { select: { nome: true, fotos: true } },
      },
    })
    return looks
  })

  // Status de um look (a vendedora faz polling enquanto gera).
  app.get('/looks/:id', { preHandler: [requireAddon('PROVADOR'), app.authorize(...MUTACAO)] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const lojaId = await lojaIdDe(request)
    const look = await prisma.lookProvador.findFirst({
      where: { id, lojaId },
      select: { id: true, status: true, comVideo: true, fotoUrl: true, videoUrl: true, viaIa: true, erro: true, expiraEm: true },
    })
    if (!look) return reply.code(404).send({ erro: 'Look não encontrado' })
    return look
  })

  // Exclui um look e limpa as mídias geradas (galeria/limpeza manual).
  app.delete('/looks/:id', { preHandler: [requireAddon('PROVADOR'), app.authorize(...MUTACAO)] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const lojaId = await lojaIdDe(request)
    const look = await prisma.lookProvador.findFirst({ where: { id, lojaId }, select: { id: true, fotoUrl: true, videoUrl: true, fotoClienteUrl: true } })
    if (!look) return reply.code(404).send({ erro: 'Look não encontrado' })
    const { excluirDoR2 } = await import('../midia/r2.service')
    const { removerUploadLocal } = await import('../midia/limpeza.service')
    const urls = [look.fotoUrl, look.videoUrl, look.fotoClienteUrl].filter((u): u is string => !!u)
    await excluirDoR2(urls).catch(() => {})
    await Promise.all(urls.map((u) => removerUploadLocal(u)))
    await prisma.lookProvador.delete({ where: { id: look.id } })
    return { ok: true }
  })

  // ─────────── Público (sem auth) — link da selfie por token ───────────

  // Dados para a tela de consentimento + upload (e o resultado quando pronto).
  app.get('/p/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const look = await prisma.lookProvador.findUnique({
      where: { token },
      select: {
        id: true, status: true, expiraEm: true, fotoUrl: true, videoUrl: true,
        produto: { select: { nome: true, fotos: true } },
        rede: { select: { nome: true, logoUrl: true, corPrimaria: true, corSecundaria: true } },
      },
    })
    if (!look) return reply.code(404).send({ erro: 'Link inválido' })

    const expirado = look.status === 'EXPIRADO' || (look.status === 'AGUARDANDO_FOTO' && look.expiraEm < new Date())
    return {
      status: expirado ? 'EXPIRADO' : look.status,
      aceitaEnvio: look.status === 'AGUARDANDO_FOTO' && !expirado,
      peca: { nome: look.produto.nome, foto: look.produto.fotos[0] ?? null },
      marca: look.rede,
      // resultado só é exposto quando concluído
      resultado: look.status === 'CONCLUIDO' ? { fotoUrl: look.fotoUrl, videoUrl: look.videoUrl } : null,
    }
  })

  // Cliente consente (LGPD) e envia a selfie → entra na fila do worker.
  app.post('/p/:token/foto', async (request, reply) => {
    const { token } = request.params as { token: string }
    const { consent } = request.query as { consent?: string }
    if (consent !== 'true') return reply.code(400).send({ erro: 'É necessário aceitar o uso da sua foto para gerar o provador.' })

    const look = await prisma.lookProvador.findUnique({ where: { token }, select: { id: true, lojaId: true, status: true, expiraEm: true } })
    if (!look) return reply.code(404).send({ erro: 'Link inválido' })
    if (look.status !== 'AGUARDANDO_FOTO') return reply.code(409).send({ erro: 'Este link já foi utilizado.' })
    if (look.expiraEm < new Date()) {
      await prisma.lookProvador.update({ where: { id: look.id }, data: { status: 'EXPIRADO' } })
      return reply.code(410).send({ erro: 'Este link expirou. Peça um novo à vendedora.' })
    }

    const arquivo = await request.file()
    if (!arquivo) return reply.code(422).send({ erro: 'Envie uma foto no campo "file"' })
    if (!TIPOS_IMG.has(arquivo.mimetype)) return reply.code(422).send({ erro: 'Formato inválido. Use PNG, JPG ou WEBP.' })

    // sharp re-encoda para webp e DESCARTA os metadados (EXIF/GPS) — privacidade do cliente.
    const original = await arquivo.toBuffer()
    const buffer = await sharp(original).rotate().resize({ width: 1024, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    const fotoClienteUrl = (await enviarParaR2({ buffer, contentType: 'image/webp', ext: 'webp', lojaId: look.lojaId, pasta: 'fotos' })) ?? (await salvarUploadLocal(buffer, 'webp'))

    await prisma.lookProvador.update({
      where: { id: look.id },
      data: { status: 'PENDENTE', fotoClienteUrl, consentLgpdEm: new Date(), consentIp: request.ip },
    })
    return { ok: true, status: 'PENDENTE' }
  })
}

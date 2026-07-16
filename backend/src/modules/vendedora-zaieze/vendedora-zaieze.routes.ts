import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { redeIdDeQualquer } from '../../plugins/auth'
import { requireAddon } from '../../plugins/planos'
import { provisionarUsuarioIa } from './vendedora-zaieze.service'

/**
 * Config do gestor para o add-on Vendedora ZAIEZE: escolhe a loja padrão (onde toda venda
 * fechada pela IA é lançada — estoque/preço são por loja, o WhatsApp/Instagram é único pra
 * rede) e provisiona a vendedora sintética nessa loja.
 */
export async function vendedoraZaiezeRoutes(app: FastifyInstance) {
  app.get('/config', { preHandler: [requireAddon('VENDEDORA_ZAIEZE'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request) => {
    const redeId = await redeIdDeQualquer(request)
    const [rede, lojas] = await Promise.all([
      prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { lojaVendedoraIaId: true } }),
      prisma.loja.findMany({ where: { redeId, ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    ])
    return { lojaVendedoraIaId: rede.lojaVendedoraIaId, lojas }
  })

  app.put('/config', { preHandler: [requireAddon('VENDEDORA_ZAIEZE'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const { lojaId } = z.object({ lojaId: z.string() }).parse(request.body)
    const loja = await prisma.loja.findFirst({ where: { id: lojaId, redeId }, select: { id: true } })
    if (!loja) return reply.code(422).send({ erro: 'Loja inválida para esta marca' })

    const rede = await prisma.rede.update({
      where: { id: redeId }, data: { lojaVendedoraIaId: lojaId }, select: { id: true, slug: true },
    })
    await provisionarUsuarioIa(rede, lojaId)
    return { lojaVendedoraIaId: lojaId }
  })

  // Pipeline: clientes hoje na carteira da Vendedora ZAIEZE (vendedoraId = Usuario sintético
  // da loja padrão), pra o gestor acompanhar e, quando quiser, atribuir a uma vendedora humana
  // (reaproveita PATCH /clientes/:id { vendedoraId }, que já permite isso pro gestor).
  app.get('/pipeline', { preHandler: [requireAddon('VENDEDORA_ZAIEZE'), app.authorize('SUPER_ADMIN', 'GESTOR')] }, async (request, reply) => {
    const redeId = await redeIdDeQualquer(request)
    const rede = await prisma.rede.findUniqueOrThrow({ where: { id: redeId }, select: { lojaVendedoraIaId: true } })
    if (!rede.lojaVendedoraIaId) return reply.code(422).send({ erro: 'Configure a loja padrão primeiro' })

    const usuarioIa = await prisma.usuario.findFirst({ where: { lojaId: rede.lojaVendedoraIaId, ehAgenteIa: true }, select: { id: true } })
    if (!usuarioIa) return []

    return prisma.cliente.findMany({
      where: { lojaId: rede.lojaVendedoraIaId, vendedoraId: usuarioIa.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, nome: true, telefone: true, instagram: true, totalGasto: true, ultimaCompraEm: true, createdAt: true },
      take: 200,
    })
  })
}

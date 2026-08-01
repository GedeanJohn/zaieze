import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { requireFeature } from '../../plugins/planos'
import { lojaIdDe } from '../../plugins/auth'
import { iniciarConexao, desconectar, obterQrAtual, listarGruposReais } from './baileys.service'

/** Cruza os participantes reais do grupo (telefones já normalizados) com os clientes da carteira
 * da vendedora — só o que já existe como Cliente entra; o resto fica de fora silenciosamente
 * (decisão do usuário: não cria Cliente novo automaticamente a partir de um grupo do WhatsApp). */
async function cruzarComCarteira(vendedoraId: string, lojaId: string, participantes: string[]) {
  const clientes = await prisma.cliente.findMany({
    where: { lojaId, vendedoraId, telefone: { in: participantes } },
    select: { id: true, nome: true, telefone: true },
  })
  return { membrosEncontrados: clientes, naoEncontrados: participantes.length - clientes.length }
}

/**
 * WhatsApp PESSOAL via QR Code (Baileys) — conexão individual da VENDEDORA, alternativa à
 * Cloud API oficial da marca (ver whatsapp.routes.ts). Cada vendedora conecta e desconecta
 * só a própria sessão (request.user.sub).
 */
export async function whatsappPessoalRoutes(app: FastifyInstance) {
  app.get('/status', { preHandler: [requireFeature('whatsapp'), app.authenticate] }, async (request) => {
    const usuario = await prisma.usuario.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { waPessoalConectado: true, waPessoalConectadoEm: true, waPessoalNumero: true },
    })
    return {
      conectado: usuario.waPessoalConectado,
      conectadoEm: usuario.waPessoalConectadoEm,
      numero: usuario.waPessoalNumero,
      // QR rotaciona sozinho a cada ~20-60s enquanto ninguém escaneia — o front usa isto pra
      // atualizar a imagem na tela em vez de deixar exibida uma versão já vencida.
      qrCode: obterQrAtual(request.user.sub),
    }
  })

  app.post('/conectar', { preHandler: [requireFeature('whatsapp'), app.authorize('VENDEDORA')] }, async (request) => {
    return iniciarConexao(request.user.sub)
  })

  app.post('/desconectar', { preHandler: [requireFeature('whatsapp'), app.authorize('VENDEDORA')] }, async (request) => {
    await desconectar(request.user.sub)
    return { ok: true }
  })

  // "Importar grupo do WhatsApp": só existe pelo canal pessoal (Baileys) — a API oficial da Meta
  // não tem nenhuma visibilidade sobre grupos reais (ver grupos.routes.ts). Prévia (não cria nada).
  app.get('/grupos-reais', { preHandler: [requireFeature('whatsapp'), app.authorize('VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const grupos = await listarGruposReais(request.user.sub)
    if (!grupos) return reply.code(422).send({ erro: 'Conecte seu WhatsApp pessoal primeiro.' })
    const resultado = await Promise.all(grupos.map(async (g) => {
      const { membrosEncontrados, naoEncontrados } = await cruzarComCarteira(request.user.sub, lojaId, g.participantes)
      return { waId: g.waId, nome: g.nome, totalParticipantes: g.participantes.length, membrosEncontrados, naoEncontrados }
    }))
    return resultado
  })

  const importarGrupoSchema = z.object({ nome: z.string().min(1).max(60).optional() })
  app.post('/grupos-reais/:waId/importar', { preHandler: [requireFeature('whatsapp'), app.authorize('VENDEDORA')] }, async (request, reply) => {
    const lojaId = await lojaIdDe(request)
    const { waId } = request.params as { waId: string }
    const body = importarGrupoSchema.parse(request.body)

    const grupos = await listarGruposReais(request.user.sub)
    if (!grupos) return reply.code(422).send({ erro: 'Conecte seu WhatsApp pessoal primeiro.' })
    const grupo = grupos.find((g) => g.waId === waId)
    if (!grupo) return reply.code(404).send({ erro: 'Grupo não encontrado (pode ter saído da lista — tente reabrir a importação).' })

    const { membrosEncontrados, naoEncontrados } = await cruzarComCarteira(request.user.sub, lojaId, grupo.participantes)
    const criado = await prisma.grupoTransmissao.create({
      data: {
        lojaId, vendedoraId: request.user.sub, nome: (body.nome ?? grupo.nome).trim(),
        membros: { create: membrosEncontrados.map((c) => ({ clienteId: c.id })) },
      },
      select: { id: true, nome: true },
    })
    return reply.code(201).send({ id: criado.id, nome: criado.nome, membros: membrosEncontrados.length, naoEncontrados })
  })
}

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { normalizarCodigo } from './afiliado.service'

const num = (v: unknown) => Number(v ?? 0)

const TERMOS_AFILIADO_VERSAO = '1.0-2026-07'

/** Programa de Afiliados: painel do próprio afiliado (rotas de admin ficam em admin.routes.ts). */
export async function afiliadosRoutes(app: FastifyInstance) {
  // Clique no link de indicação (?ref=<codigo>) — público, não vaza se o código existe ou não.
  app.post('/publico/clique', async (request) => {
    const { codigo } = z.object({ codigo: z.string().trim().min(1) }).parse(request.body)
    await prisma.afiliado.updateMany({ where: { codigo: normalizarCodigo(codigo) }, data: { cliques: { increment: 1 } } })
    return { ok: true }
  })

  app.addHook('onRequest', app.authorize('AFILIADO'))

  async function afiliadoDoUsuario(usuarioId: string) {
    return prisma.afiliado.findUniqueOrThrow({ where: { usuarioId } })
  }

  app.get('/minha', async (request) => {
    const afiliado = await afiliadoDoUsuario(request.user.sub)
    return {
      codigo: afiliado.codigo,
      link: `${env.TENANT_SCHEME}://${env.DOMINIO_BASE}/?ref=${afiliado.codigo}`,
      chavePixTipo: afiliado.chavePixTipo,
      chavePix: afiliado.chavePix,
      taxStatus: afiliado.taxStatus,
      aceiteTermosVersao: afiliado.aceiteTermosVersao,
      termosVigentes: TERMOS_AFILIADO_VERSAO,
      aceitouVersaoVigente: afiliado.aceiteTermosVersao === TERMOS_AFILIADO_VERSAO,
    }
  })

  const pixSchema = z.object({
    tipo: z.enum(['EMAIL', 'CPF', 'TELEFONE', 'ALEATORIA']),
    chave: z.string().trim().min(4).max(140),
  })
  app.patch('/minha/pix', async (request) => {
    const afiliado = await afiliadoDoUsuario(request.user.sub)
    const b = pixSchema.parse(request.body)
    return prisma.afiliado.update({ where: { id: afiliado.id }, data: { chavePixTipo: b.tipo, chavePix: b.chave } })
  })

  // Enquadramento fiscal (PF/PJ/MEI) — autodeclarado pelo próprio afiliado (só ele/contador sabe).
  // Sinaliza a regra de retenção de IR/INSS; a regra em si é validada com contador antes de automatizar.
  const fiscalSchema = z.object({ taxStatus: z.enum(['PF', 'PJ', 'MEI']) })
  app.patch('/minha/fiscal', async (request) => {
    const afiliado = await afiliadoDoUsuario(request.user.sub)
    const b = fiscalSchema.parse(request.body)
    return prisma.afiliado.update({ where: { id: afiliado.id }, data: { taxStatus: b.taxStatus } })
  })

  app.post('/minha/aceite-termos', async (request) => {
    const afiliado = await afiliadoDoUsuario(request.user.sub)
    await prisma.afiliado.update({
      where: { id: afiliado.id },
      data: { aceiteTermosVersao: TERMOS_AFILIADO_VERSAO, aceiteTermosEm: new Date(), aceiteTermosIp: request.ip },
    })
    return { ok: true }
  })

  app.get('/minha/metricas', async (request) => {
    const afiliado = await afiliadoDoUsuario(request.user.sub)
    const [redesIndicadas, comissoes] = await Promise.all([
      prisma.rede.count({ where: { afiliadoId: afiliado.id } }),
      prisma.comissaoAfiliado.findMany({ where: { afiliadoId: afiliado.id }, select: { valorComissao: true, status: true, createdAt: true } }),
    ])
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
    const pendente = comissoes.filter((c) => c.status === 'PENDENTE').reduce((s, c) => s + num(c.valorComissao), 0)
    const paga = comissoes.filter((c) => c.status === 'PAGA').reduce((s, c) => s + num(c.valorComissao), 0)
    const doMes = comissoes.filter((c) => c.createdAt >= inicioMes).reduce((s, c) => s + num(c.valorComissao), 0)
    return { cliques: afiliado.cliques, redesIndicadas, pendente, paga, doMes }
  })

  app.get('/minha/comissoes', async (request) => {
    const afiliado = await afiliadoDoUsuario(request.user.sub)
    const comissoes = await prisma.comissaoAfiliado.findMany({
      where: { afiliadoId: afiliado.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return {
      comissoes: comissoes.map((c) => ({
        id: c.id, redeNome: c.redeNome, cicloEm: c.cicloEm,
        valorBaseAssinatura: num(c.valorBaseAssinatura), percentualComissao: num(c.percentualComissao),
        valorComissao: num(c.valorComissao), status: c.status, pagoEm: c.pagoEm,
      })),
    }
  })
}

import path from 'node:path'
import fs from 'node:fs/promises'
import type { Plano } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { excluirDoR2 } from './r2.service'

/** Dias de retenção das mensagens de voz do Chat antes do expurgo automático. */
export const RETENCAO_AUDIO_DIAS = 7

/** Remove um upload local (dev), se a URL for do /api/uploads. Ignora URLs do R2. */
export async function removerUploadLocal(url: string): Promise<void> {
  const marca = '/api/uploads/'
  const i = url.indexOf(marca)
  if (i === -1) return
  const nome = url.slice(i + marca.length)
  if (!nome || nome.includes('/') || nome.includes('..')) return
  await fs.unlink(path.join(path.resolve(process.cwd(), env.UPLOAD_DIR), nome)).catch(() => {})
}

/**
 * Expurga as mensagens de voz (áudio) com mais de RETENCAO_AUDIO_DIAS dias: apaga o arquivo
 * (R2 e/ou local) e converte a mensagem em "áudio expirado" — o histórico da conversa fica,
 * mas o áudio some. Roda no job diário. Idempotente.
 * @returns nº de áudios expurgados.
 */
export async function limparAudiosAntigos(): Promise<number> {
  const limite = new Date(Date.now() - RETENCAO_AUDIO_DIAS * 24 * 60 * 60 * 1000)
  const antigos = await prisma.mensagemWhatsapp.findMany({
    where: { tipoMidia: 'AUDIO', midiaUrl: { not: null }, createdAt: { lt: limite } },
    select: { id: true, midiaUrl: true },
  })
  if (antigos.length === 0) return 0

  const urls = antigos.map((a) => a.midiaUrl).filter((u): u is string => !!u)
  try {
    await excluirDoR2(urls) // no-op em dev (sem R2)
  } catch {
    return 0 // falha no R2 → tenta de novo no próximo ciclo (não zera o banco)
  }
  await Promise.all(urls.map((u) => removerUploadLocal(u)))

  await prisma.mensagemWhatsapp.updateMany({
    where: { id: { in: antigos.map((a) => a.id) } },
    data: { tipoMidia: null, midiaUrl: null, texto: '🎤 Mensagem de voz (expirada após 7 dias)' },
  })
  return antigos.length
}

/**
 * Limpeza de mídia do catálogo por plano (Cloudflare R2).
 * Retenção a partir de `Colecao.liberadaEm`: START 6 meses, PRO 12 meses, ELITE perpétuo
 * (enquanto a empresa estiver ativa). O gestor é avisado na tela de Coleções (data + dias
 * restantes) antes da remoção — para marcar Outlet/promover. Aqui só executa a remoção.
 */

/** Meses de retenção da mídia por plano (null = perpétuo, não expira). */
export function mesesRetencao(plano: Plano): number | null {
  switch (plano) {
    case 'START': return 6
    case 'PRO': return 12
    default: return null // ELITE: perpétuo
  }
}

/** Data em que a mídia da coleção expira (null = nunca, ou sem liberação). */
export function midiaExpiraEm(liberadaEm: Date | null, plano: Plano): Date | null {
  if (!liberadaEm) return null
  const meses = mesesRetencao(plano)
  if (meses == null) return null
  const d = new Date(liberadaEm)
  d.setMonth(d.getMonth() + meses)
  return d
}

/**
 * Apaga TODA a mídia de uma rede no R2 — usado quando a marca ENCERRA a assinatura/sai do
 * sistema (libera o storage). Zera as URLs dos produtos e marca as coleções como expiradas.
 * @returns nº de objetos apagados.
 */
export async function limparMidiaDaRede(redeId: string): Promise<number> {
  const produtos = await prisma.produto.findMany({ where: { redeId }, select: { fotos: true, videos: true } })
  const urls = produtos.flatMap((p) => [...p.fotos, ...p.videos])
  if (urls.length === 0) return 0

  try {
    await excluirDoR2(urls)
  } catch {
    return 0 // falhou no R2 → não zera o banco (tenta de novo depois)
  }
  await prisma.$transaction([
    prisma.produto.updateMany({ where: { redeId }, data: { fotos: [], videos: [] } }),
    prisma.colecao.updateMany({ where: { redeId, midiaExpiradaEm: null }, data: { midiaExpiradaEm: new Date() } }),
  ])
  return urls.length
}

/**
 * Apaga do R2 a mídia das coleções cuja retenção do plano já venceu, limpa as URLs dos
 * produtos e marca `midiaExpiradaEm`. Roda diariamente (cron no server). Idempotente.
 * @returns nº de coleções processadas.
 */
export async function limparMidiaExpirada(): Promise<number> {
  const agora = new Date()
  // Só coleções liberadas, com mídia ainda não expirada, de redes START/PRO (ELITE nunca expira).
  const colecoes = await prisma.colecao.findMany({
    where: {
      status: 'LIBERADA',
      liberadaEm: { not: null },
      midiaExpiradaEm: null,
      rede: { plano: { in: ['START', 'PRO'] } },
    },
    select: { id: true, liberadaEm: true, rede: { select: { plano: true } } },
  })

  let processadas = 0
  for (const c of colecoes) {
    const plano = c.rede?.plano
    if (!plano) continue
    const expira = midiaExpiraEm(c.liberadaEm, plano)
    if (!expira || agora < expira) continue

    const produtos = await prisma.produto.findMany({ where: { colecaoId: c.id }, select: { id: true, fotos: true, videos: true } })
    const urls = produtos.flatMap((p) => [...p.fotos, ...p.videos])
    try {
      await excluirDoR2(urls)
    } catch {
      continue // falha no R2 → tenta de novo no próximo ciclo (não marca como expirada)
    }
    await prisma.$transaction([
      ...produtos.map((p) => prisma.produto.update({ where: { id: p.id }, data: { fotos: [], videos: [] } })),
      prisma.colecao.update({ where: { id: c.id }, data: { midiaExpiradaEm: agora } }),
    ])
    processadas += 1
  }
  return processadas
}

/**
 * Expurga as mídias do PROVADOR (foto/vídeo) com mais de PROVADOR_RETENCAO_DIAS — são caras e
 * efêmeas. Apaga do R2 (e local) e remove o registro do look. Rede de segurança: também limpa
 * selfies que por algum motivo não foram expurgadas no fluxo do worker. Idempotente.
 * @returns nº de looks expurgados.
 */
export async function limparLooksAntigos(): Promise<number> {
  const limite = new Date(Date.now() - env.PROVADOR_RETENCAO_DIAS * 24 * 60 * 60 * 1000)
  const antigos = await prisma.lookProvador.findMany({
    where: { createdAt: { lt: limite } },
    select: { id: true, fotoUrl: true, videoUrl: true, fotoClienteUrl: true },
  })
  if (antigos.length === 0) return 0

  const urls = antigos.flatMap((l) => [l.fotoUrl, l.videoUrl, l.fotoClienteUrl]).filter((u): u is string => !!u)
  try {
    await excluirDoR2(urls) // no-op em dev (sem R2)
  } catch {
    return 0 // falha no R2 → tenta de novo no próximo ciclo (não apaga o banco)
  }
  await Promise.all(urls.map((u) => removerUploadLocal(u)))
  await prisma.lookProvador.deleteMany({ where: { id: { in: antigos.map((l) => l.id) } } })
  return antigos.length
}

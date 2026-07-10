import type { FastifyBaseLogger } from 'fastify'
import { prisma } from '../../lib/prisma'
import { enviarParaR2, excluirDoR2 } from '../midia/r2.service'
import { salvarUploadLocal } from '../midia/midia.routes'
import { removerUploadLocal } from '../midia/limpeza.service'
import { fashnConfigurado, iniciarTryOn, iniciarVideo, consultar } from './fashn.service'
import type { LookProvador } from '@prisma/client'

/**
 * Worker do provador: fila no banco (sem Redis), no mesmo espírito dos crons do server.
 * A cada ciclo avança UM look pelo seu estado. Idempotente — falha de rede só adia o passo.
 * AGUARDANDO_FOTO/CONCLUIDO/FALHOU/EXPIRADO não são processados aqui.
 */

const INTERVALO_MS = 5000
const MAX_TENTATIVAS = 60 // ~5 min de polling por etapa antes de desistir

export function iniciarWorkerProvador(log: FastifyBaseLogger) {
  const tick = () => processarFila(log).catch((err) => log.error({ err }, 'Falha no worker do provador'))
  setInterval(tick, INTERVALO_MS).unref()
}

async function processarFila(log: FastifyBaseLogger): Promise<void> {
  const job = await prisma.lookProvador.findFirst({
    where: { status: { in: ['PENDENTE', 'PROCESSANDO_FOTO', 'FOTO_PRONTA', 'PROCESSANDO_VIDEO'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!job) return

  switch (job.status) {
    case 'PENDENTE': return iniciarFoto(job, log)
    case 'PROCESSANDO_FOTO': return poltarFoto(job, log)
    case 'FOTO_PRONTA': return job.comVideo ? iniciarVideoLook(job, log) : concluir(job)
    case 'PROCESSANDO_VIDEO': return poltarVideo(job, log)
  }
}

/** Baixa uma URL (output da FASHN) e devolve o buffer + extensão. */
async function baixar(url: string): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`download falhou: HTTP ${resp.status}`)
  const contentType = resp.headers.get('content-type') ?? 'application/octet-stream'
  const ext = contentType.includes('video') ? 'mp4' : contentType.includes('png') ? 'png' : 'webp'
  return { buffer: Buffer.from(await resp.arrayBuffer()), ext, contentType }
}

/** Guarda o output no R2 (ou local em dev) sob a loja do look. */
async function guardar(job: LookProvador, url: string, pasta: 'fotos' | 'videos'): Promise<string> {
  const { buffer, ext, contentType } = await baixar(url)
  return (await enviarParaR2({ buffer, contentType, ext, lojaId: job.lojaId, pasta })) ?? (await salvarUploadLocal(buffer, ext))
}

/** Expurga a selfie do cliente assim que cumpre a finalidade (LGPD). Idempotente. */
async function expurgarSelfie(job: LookProvador): Promise<void> {
  if (!job.fotoClienteUrl) return
  try {
    await excluirDoR2([job.fotoClienteUrl]) // no-op em dev (sem R2)
    await removerUploadLocal(job.fotoClienteUrl) // remove o arquivo local (dev)
  } catch {
    return // tenta de novo no próximo ciclo / no expurgo diário
  }
  await prisma.lookProvador.update({
    where: { id: job.id },
    data: { fotoClienteUrl: null, fotoClienteExpurgadaEm: new Date() },
  })
}

async function falhar(job: LookProvador, erro: string): Promise<void> {
  await prisma.lookProvador.update({ where: { id: job.id }, data: { status: 'FALHOU', erro } })
  await expurgarSelfie({ ...job, erro }) // não retém a selfie de um job morto
}

/** PENDENTE → inicia o try-on (ou, em modo simulado, usa a foto do produto). */
async function iniciarFoto(job: LookProvador, log: FastifyBaseLogger): Promise<void> {
  const produto = await prisma.produto.findUnique({ where: { id: job.produtoBaseId }, select: { fotos: true } })
  const pecaUrl = produto?.fotos?.[0]
  if (!pecaUrl) return falhar(job, 'Produto sem foto para o provador')
  if (!job.fotoClienteUrl) return falhar(job, 'Selfie do cliente ausente')

  // Modo simulado (sem FASHN_API_KEY): o look é a própria foto do produto. Não gasta API.
  if (!fashnConfigurado()) {
    await prisma.lookProvador.update({ where: { id: job.id }, data: { status: 'FOTO_PRONTA', fotoUrl: pecaUrl, viaIa: false } })
    await expurgarSelfie(job)
    return
  }

  try {
    const externalFotoId = await iniciarTryOn({ selfieUrl: job.fotoClienteUrl, pecaUrl })
    await prisma.lookProvador.update({ where: { id: job.id }, data: { status: 'PROCESSANDO_FOTO', externalFotoId, tentativas: 0 } })
  } catch (e) {
    log.error({ err: e, lookId: job.id }, 'FASHN try-on: falha ao iniciar')
    await falhar(job, 'Não foi possível iniciar o provador. Tente novamente.')
  }
}

/** PROCESSANDO_FOTO → faz polling na FASHN; pronto → grava no R2 e expurga a selfie. */
async function poltarFoto(job: LookProvador, log: FastifyBaseLogger): Promise<void> {
  if (!job.externalFotoId) return falhar(job, 'Job sem referência externa da foto')
  let r
  try {
    r = await consultar(job.externalFotoId)
  } catch (e) {
    return adiar(job, log, 'foto') // erro de rede: tenta de novo
  }
  if (r.status === 'processando') return adiar(job, log, 'foto')
  if (r.status === 'falhou') return falhar(job, r.erro)

  const fotoUrl = await guardar(job, r.url, 'fotos')
  await prisma.lookProvador.update({
    where: { id: job.id },
    data: { status: 'FOTO_PRONTA', fotoUrl, viaIa: true, creditos: { increment: 3 } },
  })
  await expurgarSelfie(job)
}

/** FOTO_PRONTA (+comVideo) → inicia o image-to-video. */
async function iniciarVideoLook(job: LookProvador, log: FastifyBaseLogger): Promise<void> {
  if (!fashnConfigurado() || !job.fotoUrl) return concluir(job) // simulado: sem vídeo
  try {
    const externalVideoId = await iniciarVideo({ fotoUrl: job.fotoUrl })
    await prisma.lookProvador.update({ where: { id: job.id }, data: { status: 'PROCESSANDO_VIDEO', externalVideoId, tentativas: 0 } })
  } catch (e) {
    log.error({ err: e, lookId: job.id }, 'FASHN vídeo: falha ao iniciar')
    await concluir(job) // a foto já é entregue mesmo se o vídeo falhar
  }
}

/** PROCESSANDO_VIDEO → polling; pronto → grava o vídeo no R2 e conclui. */
async function poltarVideo(job: LookProvador, log: FastifyBaseLogger): Promise<void> {
  if (!job.externalVideoId) return concluir(job)
  let r
  try {
    r = await consultar(job.externalVideoId)
  } catch {
    return adiar(job, log, 'video')
  }
  if (r.status === 'processando') return adiar(job, log, 'video')
  if (r.status === 'falhou') return concluir(job) // entrega a foto mesmo sem vídeo

  const videoUrl = await guardar(job, r.url, 'videos')
  await prisma.lookProvador.update({
    where: { id: job.id },
    data: { status: 'CONCLUIDO', videoUrl, creditos: { increment: 6 } },
  })
}

/** Incrementa as tentativas de polling; estourou o teto → desiste da etapa. */
async function adiar(job: LookProvador, log: FastifyBaseLogger, etapa: 'foto' | 'video'): Promise<void> {
  const tentativas = job.tentativas + 1
  if (tentativas > MAX_TENTATIVAS) {
    if (etapa === 'video') return concluir(job) // já tem a foto; abre mão do vídeo
    return falhar(job, 'Tempo esgotado ao gerar o provador')
  }
  await prisma.lookProvador.update({ where: { id: job.id }, data: { tentativas } })
}

async function concluir(job: LookProvador): Promise<void> {
  await prisma.lookProvador.update({ where: { id: job.id }, data: { status: 'CONCLUIDO' } })
}

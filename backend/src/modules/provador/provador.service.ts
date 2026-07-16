import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { statusCota } from './cota.service'

/** Erro de negócio do provador — carrega o status HTTP certo pra quem chamou por uma rota
 *  traduzir; quem chama internamente (ex.: Vendedora ZAIEZE) só lê message/detalhe. */
export class ProvadorError extends Error {
  statusCode: number
  detalhe?: unknown
  constructor(statusCode: number, message: string, detalhe?: unknown) {
    super(message)
    this.statusCode = statusCode
    this.detalhe = detalhe
  }
}

/** URL pública para o cliente enviar a selfie: <scheme>://<rede>.<dominio>/look/<token>. */
export function urlProvadorPublica(redeSlug: string, token: string): string {
  return `${env.TENANT_SCHEME}://${redeSlug}.${env.DOMINIO_BASE}/look/${token}`
}

export interface CriarLookParams {
  redeId: string
  lojaId: string
  produtoBaseId: string
  criadoPorId: string
  comVideo?: boolean
}

/**
 * Cria um look do Provador Virtual (valida cota mensal + peça com foto) e devolve o link
 * público — extraída de `POST /looks` pra ser reaproveitada pela Vendedora ZAIEZE (gera o
 * link durante a conversa, sem passar por uma rota HTTP autenticada por sessão humana) sem
 * duplicar a validação de cota/peça.
 */
export async function criarLook(params: CriarLookParams) {
  const cota = await statusCota(params.redeId)
  if (!cota.ok) throw new ProvadorError(429, `Cota mensal de looks atingida (${cota.usados}/${cota.limite}).`, cota)

  // A peça precisa existir na rede e ter ao menos uma foto (entrada do try-on).
  const produto = await prisma.produto.findFirst({
    where: { id: params.produtoBaseId, redeId: params.redeId },
    select: { id: true, nome: true, fotos: true },
  })
  if (!produto) throw new ProvadorError(404, 'Produto não encontrado nesta marca')
  if (produto.fotos.length === 0) throw new ProvadorError(422, 'A peça precisa ter ao menos uma foto para o provador')

  const expiraEm = new Date(Date.now() + env.PROVADOR_LINK_HORAS * 60 * 60 * 1000)
  const look = await prisma.lookProvador.create({
    data: {
      redeId: params.redeId, lojaId: params.lojaId, produtoBaseId: produto.id,
      criadoPorId: params.criadoPorId, comVideo: params.comVideo ?? false, expiraEm,
    },
    select: { id: true, token: true, expiraEm: true },
  })

  const rede = await prisma.rede.findUnique({ where: { id: params.redeId }, select: { slug: true } })
  return {
    id: look.id,
    token: look.token,
    url: rede ? urlProvadorPublica(rede.slug, look.token) : null,
    expiraEm: look.expiraEm,
    produtoNome: produto.nome,
  }
}

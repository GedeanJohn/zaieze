import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma'
import { gerarSenhaProvisoria } from '../auth/senha-provisoria'

const SLUG_RESERVADO = new Set(['www', 'api', 'app', 'admin', 'cdn'])

/** slug normalizado: minúsculo, sem acento, só [a-z0-9-]. */
export function normalizarSlug(slug: string): string {
  return slug
    .trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Um subdomínio só pode pertencer a UMA rede OU UMA assessora — checa as duas tabelas. */
export async function slugDisponivel(slug: string, ignorarAssessorId?: string): Promise<boolean> {
  if (!slug || SLUG_RESERVADO.has(slug)) return false
  const [rede, assessor] = await Promise.all([
    prisma.rede.findUnique({ where: { slug }, select: { id: true } }),
    prisma.assessor.findUnique({ where: { slug }, select: { id: true } }),
  ])
  if (rede) return false
  if (assessor && assessor.id !== ignorarAssessorId) return false
  return true
}

interface CriarAssessorInput {
  nome: string
  email: string
  telefone?: string
  slug: string
}

/** Cria o Usuario(role=ASSESSORA) + Assessor numa transação. Gera senha provisória (retornada 1x). */
export async function criarAssessor(input: CriarAssessorInput) {
  const email = input.email.toLowerCase()
  if (await prisma.usuario.findUnique({ where: { email } })) {
    throw Object.assign(new Error('Já existe uma conta com este e-mail.'), { statusCode: 409 })
  }
  const slug = normalizarSlug(input.slug)
  if (!(await slugDisponivel(slug))) {
    throw Object.assign(new Error('Este endereço (subdomínio) já está em uso. Escolha outro.'), { statusCode: 409 })
  }

  const senha = gerarSenhaProvisoria()
  const senhaHash = await bcrypt.hash(senha, 10)

  const assessor = await prisma.$transaction(async (tx) => {
    const usuario = await tx.usuario.create({
      data: { nome: input.nome, email, senhaHash, role: 'ASSESSORA', telefone: input.telefone ?? null },
    })
    return tx.assessor.create({
      data: { usuarioId: usuario.id, slug },
      include: { usuario: { select: { id: true, nome: true, email: true, telefone: true, ativo: true } } },
    })
  })
  return { assessor, senha }
}

import { api, type Usuario } from '../api'
import { ehDev } from '../host'

// "Entrar como": SUPER_ADMIN assume a sessão de qualquer usuário (POST /admin/usuarios/:id/entrar-como),
// ou GESTOR assume a de um membro da própria equipe (POST /usuarios/:id/entrar-como). Como cada
// <slug>.zaieze.com é uma origem própria do navegador, localStorage não atravessa subdomínio — o
// token/usuário viajam via querystring no redirect (base64 de um JSON) quando a origem muda; quando
// não muda (gestor entrando num membro da própria rede, mesmo domínio), aplica direto sem round-trip.
const TOKEN = 'modacrm_token'
const USUARIO = 'modacrm_usuario'
const ADMIN_TOKEN_ORIGINAL = 'modacrm_admin_token_original'
const ADMIN_USUARIO_ORIGINAL = 'modacrm_admin_usuario_original'
const ADMIN_ORIGEM = 'modacrm_admin_origem'
const PARAM = 'entrar_como'

interface Pacote {
  token: string
  usuario: Usuario
  adminToken: string | null
  adminUsuario: string | null // JSON já serializado, repassado como veio
  origem: string | null
}

function codificar(p: Pacote): string {
  return btoa(encodeURIComponent(JSON.stringify(p)))
}
function decodificar(s: string): Pacote {
  return JSON.parse(decodeURIComponent(atob(s))) as Pacote
}

function urlBase(slug: string | null): string {
  if (ehDev()) return `${window.location.protocol}//${window.location.host}/${slug ? `?tenant=${slug}` : ''}`
  return slug ? `https://${slug}.zaieze.com/` : `https://zaieze.com/`
}

/** true enquanto uma sessão de "entrar como" estiver ativa (tem admin original guardado). */
export function estaImpersonando(): boolean {
  return localStorage.getItem(ADMIN_TOKEN_ORIGINAL) !== null
}

/** Aplica uma nova sessão guardando a anterior pra permitir "voltar" — usado tanto ao chegar via
 *  querystring (troca de origem) quanto ao entrar direto (mesma origem, sem redirect). */
function assumirSessao(token: string, usuario: Usuario) {
  const tokenAtual = localStorage.getItem(TOKEN)
  const usuarioAtual = localStorage.getItem(USUARIO)
  if (tokenAtual && usuarioAtual) {
    localStorage.setItem(ADMIN_TOKEN_ORIGINAL, tokenAtual)
    localStorage.setItem(ADMIN_USUARIO_ORIGINAL, usuarioAtual)
    localStorage.setItem(ADMIN_ORIGEM, window.location.href)
  }
  localStorage.setItem(TOKEN, token)
  localStorage.setItem(USUARIO, JSON.stringify(usuario))
}

/** SUPER_ADMIN: entra como qualquer usuário — pode exigir trocar de subdomínio (rede/assessora
 *  diferentes da origem atual, ex.: admin.zaieze.com → <loja>.zaieze.com). */
export async function entrarComoUsuario(usuarioId: string): Promise<void> {
  const { data } = await api.post(`/admin/usuarios/${usuarioId}/entrar-como`)
  const slugDestino: string | null = data.redeSlug ?? data.usuario.assessor?.slug ?? null
  const mesmaOrigem = !slugDestino || (!ehDev() && window.location.hostname.startsWith(`${slugDestino}.`))
  if (mesmaOrigem) { assumirSessao(data.token, data.usuario); window.location.href = '/'; return }

  const pacote: Pacote = {
    token: data.token, usuario: data.usuario,
    adminToken: localStorage.getItem(TOKEN), adminUsuario: localStorage.getItem(USUARIO),
    origem: window.location.href,
  }
  const url = new URL(urlBase(slugDestino))
  url.searchParams.set(PARAM, codificar(pacote))
  window.location.href = url.toString()
}

/** GESTOR: entra como um membro da própria equipe — sempre no mesmo subdomínio dele, então
 *  aplica direto, sem precisar trocar de origem. */
export async function entrarComoDaEquipe(usuarioId: string): Promise<void> {
  const { data } = await api.post(`/usuarios/${usuarioId}/entrar-como`)
  assumirSessao(data.token, data.usuario)
  window.location.href = '/'
}

/** Chamado do banner "Operando como": restaura a sessão original e volta pra onde estava —
 *  direto se for a mesma origem (caso do gestor), ou via querystring se mudou de subdomínio
 *  (caso do super admin). */
export function voltarDoImpersonar(): void {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_ORIGINAL)
  const adminUsuario = localStorage.getItem(ADMIN_USUARIO_ORIGINAL)
  const origem = localStorage.getItem(ADMIN_ORIGEM)
  localStorage.removeItem(ADMIN_TOKEN_ORIGINAL)
  localStorage.removeItem(ADMIN_USUARIO_ORIGINAL)
  localStorage.removeItem(ADMIN_ORIGEM)
  if (!adminToken || !adminUsuario) { window.location.href = '/'; return }

  if (!origem || new URL(origem).origin === window.location.origin) {
    localStorage.setItem(TOKEN, adminToken)
    localStorage.setItem(USUARIO, adminUsuario)
    window.location.href = origem || '/'
    return
  }

  const pacote: Pacote = { token: adminToken, usuario: JSON.parse(adminUsuario) as Usuario, adminToken: null, adminUsuario: null, origem: null }
  const url = new URL(origem)
  url.searchParams.set(PARAM, codificar(pacote))
  window.location.href = url.toString()
}

/**
 * Roda uma vez, síncrono, ANTES do app renderizar (ver main.tsx) — se a URL trouxer um pacote de
 * impersonação, aplica no localStorage (guardando a sessão do admin, se houver) e limpa a
 * querystring. Sem isso o token do "entrar como" ficaria só na URL, nunca chegando ao localStorage.
 */
export function aplicarImpersonacaoDaUrl(): void {
  const params = new URLSearchParams(window.location.search)
  const bruto = params.get(PARAM)
  if (!bruto) return
  try {
    const pacote = decodificar(bruto)
    if (pacote.adminToken && pacote.adminUsuario) {
      localStorage.setItem(ADMIN_TOKEN_ORIGINAL, pacote.adminToken)
      localStorage.setItem(ADMIN_USUARIO_ORIGINAL, pacote.adminUsuario)
      if (pacote.origem) localStorage.setItem(ADMIN_ORIGEM, pacote.origem)
    }
    localStorage.setItem(TOKEN, pacote.token)
    localStorage.setItem(USUARIO, JSON.stringify(pacote.usuario))
  } catch {
    // pacote inválido/corrompido — ignora, segue pro login normal
  } finally {
    params.delete(PARAM)
    const resto = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (resto ? `?${resto}` : ''))
  }
}

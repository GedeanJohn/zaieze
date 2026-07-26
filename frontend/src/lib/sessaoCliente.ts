// Sessão do cliente verificado por WhatsApp no Portal do Cliente (catálogo público) — compartilhada
// entre MeusPedidos.tsx (que gera a sessão) e Catalogo.tsx (que a usa pra sincronizar favoritos).
const CHAVE_SESSAO = 'zz_pedido_sessao'

export interface SessaoCliente { telefone: string; token: string }

/** Sessão verificada (telefone + token) — em localStorage se "lembrar neste aparelho" foi
 *  marcado (sobrevive a fechar o navegador), senão em sessionStorage (só durante esta aba). */
export function lerSessaoSalva(): SessaoCliente | null {
  const raw = localStorage.getItem(CHAVE_SESSAO) ?? sessionStorage.getItem(CHAVE_SESSAO)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function salvarSessao(telefone: string, token: string, lembrar: boolean) {
  const raw = JSON.stringify({ telefone, token })
  if (lembrar) localStorage.setItem(CHAVE_SESSAO, raw)
  else sessionStorage.setItem(CHAVE_SESSAO, raw)
}

export function limparSessao() {
  localStorage.removeItem(CHAVE_SESSAO)
  sessionStorage.removeItem(CHAVE_SESSAO)
}

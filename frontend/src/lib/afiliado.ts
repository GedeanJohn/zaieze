import { api } from '../api'

const CHAVE = 'zaieze_ref_afiliado'
const DIAS_VALIDADE = 30

interface RefSalva { codigo: string; expiraEm: number }

/** Lê ?ref= da URL atual; se presente, persiste (30 dias) e registra o clique (best-effort). */
export function capturarRefAfiliado(): void {
  const codigo = new URLSearchParams(window.location.search).get('ref')
  if (!codigo?.trim()) return
  const salvo: RefSalva = { codigo: codigo.trim(), expiraEm: Date.now() + DIAS_VALIDADE * 86_400_000 }
  localStorage.setItem(CHAVE, JSON.stringify(salvo))
  api.post('/afiliados/publico/clique', { codigo: salvo.codigo }).catch(() => {})
}

/** Código do afiliado ativo (ainda dentro da validade), se houver. */
export function refAfiliadoAtivo(): string | undefined {
  const raw = localStorage.getItem(CHAVE)
  if (!raw) return undefined
  try {
    const salvo = JSON.parse(raw) as RefSalva
    if (salvo.expiraEm < Date.now()) { localStorage.removeItem(CHAVE); return undefined }
    return salvo.codigo
  } catch { return undefined }
}

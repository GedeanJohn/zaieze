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

const CHAVE_ASSESSOR = 'zaieze_ref_assessor'

/** Lê ?refAssessor= da URL atual (link de indicação de lojista de uma Assessora de Moda);
 *  se presente, persiste (30 dias) e registra o clique (best-effort). */
export function capturarRefAssessor(): void {
  const slug = new URLSearchParams(window.location.search).get('refAssessor')
  if (!slug?.trim()) return
  const salvo: RefSalva = { codigo: slug.trim(), expiraEm: Date.now() + DIAS_VALIDADE * 86_400_000 }
  localStorage.setItem(CHAVE_ASSESSOR, JSON.stringify(salvo))
  api.post('/assessores/publico/indicacao-clique', { slug: salvo.codigo }).catch(() => {})
}

/** Slug do assessor(a) de indicação ativo (ainda dentro da validade), se houver. */
export function refAssessorAtivo(): string | undefined {
  const raw = localStorage.getItem(CHAVE_ASSESSOR)
  if (!raw) return undefined
  try {
    const salvo = JSON.parse(raw) as RefSalva
    if (salvo.expiraEm < Date.now()) { localStorage.removeItem(CHAVE_ASSESSOR); return undefined }
    return salvo.codigo
  } catch { return undefined }
}

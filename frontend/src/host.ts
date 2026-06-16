// Resolução de tenant por wildcard de subdomínio.
//   www.zaieze.com / zaieze.com        → landing comercial
//   <slug>.zaieze.com                  → CRM do tenant (rede = <slug>)
// Em dev: use http://<slug>.localhost:5184 ou http://<slug>.lvh.me:5184,
// ou ainda ?tenant=<slug> em qualquer host.

export interface HostInfo {
  tipo: 'landing' | 'tenant'
  slug: string | null
}

const APEX = new Set(['zaieze.com', 'localhost', '127.0.0.1', ''])

function resolver(): HostInfo {
  const params = new URLSearchParams(window.location.search)
  const override = params.get('tenant')
  if (override) return { tipo: 'tenant', slug: override.toLowerCase() }

  const host = window.location.hostname
  if (APEX.has(host)) return { tipo: 'landing', slug: null }

  const partes = host.split('.')
  const primeiro = partes[0]
  // www em qualquer domínio = landing
  if (primeiro === 'www') return { tipo: 'landing', slug: null }
  // há subdomínio (ex.: lojademo.zaieze.com, lojademo.localhost, lojademo.lvh.me)
  if (partes.length >= 2) return { tipo: 'tenant', slug: primeiro.toLowerCase() }

  return { tipo: 'landing', slug: null }
}

export const HOST: HostInfo = resolver()

export function ehDev(): boolean {
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost') || h.endsWith('.lvh.me')
}

/** URL de login do tenant. Em prod usa o subdomínio wildcard; em dev usa ?tenant= no host atual. */
export function urlTenantLogin(slug: string, dominioBase: string): string {
  if (ehDev()) return `${window.location.protocol}//${window.location.host}/login?tenant=${slug}`
  return `https://${slug}.${dominioBase}/login`
}

/**
 * URL pública compartilhável do catálogo da vendedora: <marca>.zaieze.com/<vendedora>.
 * Em dev (sem subdomínio real) cai para ?tenant=<marca> no host atual.
 */
export function urlCatalogo(redeSlug: string, path: string, dominioBase = 'zaieze.com'): string {
  if (ehDev()) return `${window.location.protocol}//${window.location.host}${path}?tenant=${redeSlug}`
  return `https://${redeSlug}.${dominioBase}${path}`
}

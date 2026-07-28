import { env } from '../../env'

/**
 * Captador Leads Zaieze — prospecção de empresas novas (fora do SaaS) via Google Places API, pro time
 * comercial da própria ZAIEZE. Sem GOOGLE_PLACES_API_KEY → modo simulado (mesmo padrão de
 * FASHN/R2/Mercado Pago: `xConfigurado()` + fallback com dados fictícios, sem chamar a API).
 *
 * Limitação real da Places API (avisar no frontend, não fabricar): não traz CNPJ nem Instagram.
 * O telefone vira link wa.me por boa prática (não é garantia de ser o WhatsApp comercial deles).
 */

export function googlePlacesConfigurado(): boolean {
  return Boolean(env.GOOGLE_PLACES_API_KEY)
}

export interface EmpresaEncontrada {
  googlePlaceId: string | null
  nome: string
  categoria: string | null
  telefone: string | null
  site: string | null
  endereco: string | null
  cidade: string | null
  uf: string | null
  notaGoogle: number | null
  totalAvaliacoes: number | null
  horarioFuncionamento: string[] | null
  latitude: number | null
  longitude: number | null
}

interface GeoPonto { lat: number; lng: number }

/** Geocodifica "cidade, UF" para lat/lng (Google Geocoding API). null se não encontrar. */
export async function geocodificar(cidade: string, uf: string): Promise<GeoPonto | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', `${cidade}, ${uf}, Brasil`)
  url.searchParams.set('region', 'br')
  url.searchParams.set('key', env.GOOGLE_PLACES_API_KEY!)

  const resp = await fetch(url)
  if (!resp.ok) throw Object.assign(new Error(`Geocoding respondeu ${resp.status}`), { statusCode: 502 })
  const data = (await resp.json()) as { status: string; results?: { geometry: { location: GeoPonto } }[] }
  if (data.status !== 'OK' || !data.results?.length) return null
  return data.results[0].geometry.location
}

/** Extrai o nome da cidade/UF a partir do endereço formatado do Google (best-effort, texto livre). */
function cidadeUfDoEndereco(endereco: string | undefined): { cidade: string | null; uf: string | null } {
  if (!endereco) return { cidade: null, uf: null }
  // Formato típico: "Rua X, 123 - Bairro, Cidade - UF, CEP, Brasil"
  const m = endereco.match(/,\s*([^,-]+)\s*-\s*([A-Z]{2}),/)
  return { cidade: m?.[1]?.trim() ?? null, uf: m?.[2] ?? null }
}

async function detalharEmpresa(placeId: string): Promise<{ telefone: string | null; site: string | null; horario: string[] | null }> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'formatted_phone_number,website,opening_hours')
  url.searchParams.set('language', 'pt-BR')
  url.searchParams.set('key', env.GOOGLE_PLACES_API_KEY!)

  const resp = await fetch(url)
  if (!resp.ok) return { telefone: null, site: null, horario: null } // best-effort — não derruba a busca toda
  const data = (await resp.json()) as {
    status: string
    result?: { formatted_phone_number?: string; website?: string; opening_hours?: { weekday_text?: string[] } }
  }
  if (data.status !== 'OK' || !data.result) return { telefone: null, site: null, horario: null }
  return {
    telefone: data.result.formatted_phone_number ?? null,
    site: data.result.website ?? null,
    horario: data.result.opening_hours?.weekday_text ?? null,
  }
}

/**
 * Busca empresas de verdade (Text Search + Place Details por resultado). Requer
 * GOOGLE_PLACES_API_KEY. `quantidade` já vem capado (ver rota) — cada resultado gasta 1 chamada
 * extra de Place Details, então o custo escala com a quantidade pedida.
 */
export async function buscarEmpresas(opts: {
  segmento: string
  tipoEmpresa?: string | null
  ponto: GeoPonto
  raioKm?: number | null
  quantidade: number
}): Promise<EmpresaEncontrada[]> {
  const query = [opts.segmento, opts.tipoEmpresa].filter(Boolean).join(' ')
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('query', query)
  url.searchParams.set('location', `${opts.ponto.lat},${opts.ponto.lng}`)
  url.searchParams.set('radius', String((opts.raioKm ?? 20) * 1000))
  url.searchParams.set('language', 'pt-BR')
  url.searchParams.set('region', 'br')
  url.searchParams.set('key', env.GOOGLE_PLACES_API_KEY!)

  const resp = await fetch(url)
  if (!resp.ok) throw Object.assign(new Error(`Google Places respondeu ${resp.status}`), { statusCode: 502 })
  const data = (await resp.json()) as {
    status: string
    results?: {
      place_id: string; name: string; formatted_address?: string; rating?: number
      user_ratings_total?: number; types?: string[]; geometry?: { location: GeoPonto }
    }[]
  }
  if (data.status === 'ZERO_RESULTS') return []
  if (data.status !== 'OK') throw Object.assign(new Error(`Google Places: ${data.status}`), { statusCode: 502 })

  const resultados = (data.results ?? []).slice(0, opts.quantidade)
  const empresas: EmpresaEncontrada[] = []
  for (const r of resultados) {
    const detalhe = await detalharEmpresa(r.place_id)
    const { cidade, uf } = cidadeUfDoEndereco(r.formatted_address)
    empresas.push({
      googlePlaceId: r.place_id,
      nome: r.name,
      categoria: r.types?.[0]?.replaceAll('_', ' ') ?? null,
      telefone: detalhe.telefone,
      site: detalhe.site,
      endereco: r.formatted_address ?? null,
      cidade, uf,
      notaGoogle: r.rating ?? null,
      totalAvaliacoes: r.user_ratings_total ?? null,
      horarioFuncionamento: detalhe.horario,
      latitude: r.geometry?.location.lat ?? null,
      longitude: r.geometry?.location.lng ?? null,
    })
  }
  return empresas
}

const NOMES_SIMULADOS = ['Comércio', 'Loja', 'Distribuidora', 'Indústria', 'Atelier', 'Studio']

/** Sem GOOGLE_PLACES_API_KEY: gera empresas fictícias determinísticas — só pra demonstrar a ferramenta. */
export function gerarResultadosSimulados(opts: { segmento: string; cidade: string; uf: string; quantidade: number }): EmpresaEncontrada[] {
  return Array.from({ length: opts.quantidade }, (_, i) => ({
    googlePlaceId: null,
    nome: `${NOMES_SIMULADOS[i % NOMES_SIMULADOS.length]} ${opts.segmento} ${i + 1} (simulado)`,
    categoria: opts.segmento,
    telefone: `5562${String(90000000 + i).padStart(9, '0')}`,
    site: null,
    endereco: `Rua Exemplo, ${100 + i} - Centro, ${opts.cidade} - ${opts.uf}`,
    cidade: opts.cidade,
    uf: opts.uf,
    notaGoogle: 4 + (i % 10) / 10,
    totalAvaliacoes: 10 + i * 7,
    horarioFuncionamento: ['Seg a Sex: 09:00–18:00', 'Sáb: 09:00–13:00'],
    latitude: null,
    longitude: null,
  }))
}

import { useEffect } from 'react'

interface MetaTagsOpts {
  titulo: string
  descricao: string
  imagem?: string
  url?: string
  /** Dados estruturados (schema.org) desta página — ajuda buscadores e IA a entenderem o conteúdo. */
  jsonLd?: Record<string, unknown>
}

function upsertMeta(attr: 'name' | 'property', chave: string, conteudo: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[${attr}="${chave}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, chave)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', conteudo)
}

/** Atualiza título, meta description, Open Graph e JSON-LD da página atual (SPA sem SSR). */
export function useMetaTags({ titulo, descricao, imagem, url, jsonLd }: MetaTagsOpts) {
  useEffect(() => {
    document.title = titulo
    upsertMeta('name', 'description', descricao)
    upsertMeta('property', 'og:title', titulo)
    upsertMeta('property', 'og:description', descricao)
    if (imagem) upsertMeta('property', 'og:image', imagem)
    if (url) upsertMeta('property', 'og:url', url)

    let script: HTMLScriptElement | null = null
    if (jsonLd) {
      script = document.createElement('script')
      script.type = 'application/ld+json'
      script.text = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }
    return () => { script?.remove() }
  }, [titulo, descricao, imagem, url, jsonLd])
}

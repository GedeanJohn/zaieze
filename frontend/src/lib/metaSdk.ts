// SDK JS da Meta (Facebook Login / Embedded Signup) — carregado sob demanda, só quando alguma
// conexão automática (WhatsApp ou Instagram) está disponível no servidor. Compartilhado entre as
// telas que usam login da Meta (WhatsApp.tsx, Instagram.tsx) pra não carregar o script 2x.
declare global {
  interface Window {
    FB?: { init: (opts: Record<string, unknown>) => void; login: (cb: (r: any) => void, opts: Record<string, unknown>) => void }
    fbAsyncInit?: () => void
  }
}

let sdkMetaCarregado: Promise<void> | null = null

export function carregarSdkMeta(appId: string): Promise<void> {
  if (window.FB) return Promise.resolve()
  if (sdkMetaCarregado) return sdkMetaCarregado
  sdkMetaCarregado = new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v21.0' })
      resolve()
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/pt_BR/sdk.js'
    s.async = true
    s.defer = true
    s.crossOrigin = 'anonymous'
    document.body.appendChild(s)
  })
  return sdkMetaCarregado
}

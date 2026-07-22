import { api } from '../api'

// Quando o subdomínio pertence a uma assessora (Brand Partner), troca o título e o ícone que
// aparecem ao "Adicionar à Tela de Início" (celular) do genérico "ZAIEZE" pro nome/foto dela.
//
// Android (Chrome): lê o manifest.webmanifest via rede — reescrevemos o href do <link rel=manifest>
// pra apontar pro manifesto dinâmico dela antes que o usuário abra o menu de instalação.
// iPhone (Safari): não usa o manifest pra isso — lê apple-mobile-web-app-title/apple-touch-icon
// do HTML no momento em que ela toca em "Adicionar à Tela de Início", então basta atualizar essas
// tags aqui (sem API oficial de "instalação" no iOS, mas funciona na prática).
//
// Se o slug não for de uma assessora (ex.: subdomínio de uma Rede/marca), a chamada dá 404 e as
// tags padrão do ZAIEZE continuam intactas.
export function aplicarIdentidadeAssessoraNoPWA(slug: string) {
  api.get(`/assessores/publico/${slug}`).then(({ data }) => {
    if (!data?.nome) return

    const manifestLink = document.querySelector('link[rel="manifest"]')
    if (manifestLink) manifestLink.setAttribute('href', `/api/assessores/publico/${slug}/manifest.webmanifest`)

    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    if (appleTitle) appleTitle.setAttribute('content', data.nome)

    if (data.fotoUrl) {
      const appleIcon = document.querySelector('link[rel="apple-touch-icon"]')
      if (appleIcon) appleIcon.setAttribute('href', data.fotoUrl)
    }
  }).catch(() => {})
}

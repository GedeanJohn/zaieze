import { useEffect } from 'react'

/**
 * Dificultadores de cópia casual (imagens/código) só nas páginas comerciais (site público) —
 * bloqueia botão direito, arrastar imagem e os atalhos mais óbvios de ver/salvar a página.
 *
 * IMPORTANTE — isto NÃO é uma trava de verdade: o navegador precisa baixar HTML/CSS/JS/imagens
 * pra exibir a página, então qualquer pessoa com conhecimento técnico ainda acessa tudo pela aba
 * de rede do DevTools (que não dá pra bloquear via JS — o menu do navegador sempre abre) ou tira
 * print. Isto só reduz a cópia casual (clique direito → salvar imagem, Ctrl+U, arrastar a logo).
 * Não aplicar no CRM autenticado (equipe precisa selecionar/copiar texto e inspecionar pra suporte).
 */
export function useProtegerConteudo() {
  useEffect(() => {
    function bloquearMenu(e: MouseEvent) {
      e.preventDefault()
    }
    function bloquearArrastarImagem(e: DragEvent) {
      if (e.target instanceof HTMLImageElement) e.preventDefault()
    }
    function bloquearAtalhos(e: KeyboardEvent) {
      const tecla = e.key.toLowerCase()
      // Ctrl/Cmd+U (ver código-fonte), Ctrl/Cmd+S (salvar página) — o navegador ainda abre o
      // DevTools por F12/Ctrl+Shift+I pelo menu dele, isso não dá pra bloquear via JS.
      const combinacaoBloqueada =
        ((e.ctrlKey || e.metaKey) && (tecla === 'u' || tecla === 's')) ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(tecla))
      if (combinacaoBloqueada) e.preventDefault()
    }

    document.addEventListener('contextmenu', bloquearMenu)
    document.addEventListener('dragstart', bloquearArrastarImagem)
    document.addEventListener('keydown', bloquearAtalhos)
    document.body.classList.add('protegido-copia')
    return () => {
      document.removeEventListener('contextmenu', bloquearMenu)
      document.removeEventListener('dragstart', bloquearArrastarImagem)
      document.removeEventListener('keydown', bloquearAtalhos)
      document.body.classList.remove('protegido-copia')
    }
  }, [])
}

import { useEffect, useState } from 'react'
import { Download, Share, X, PlusSquare } from 'lucide-react'

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function estaStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

function ehIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** Botão "Instalar app" — no Android/Chrome dispara o prompt nativo de instalação (PWA);
 *  no iPhone/Safari (sem esse evento) mostra o passo a passo do "Adicionar à Tela de Início".
 *  Some sozinho se o app já estiver instalado (aberto em modo standalone). */
export default function BotaoInstalarApp({ className = 'vit-icone-botao' }: { className?: string }) {
  const [promptEvento, setPromptEvento] = useState<EventoInstalacao | null>(null)
  const [instrucoesIosAbertas, setInstrucoesIosAbertas] = useState(false)
  const [instalado, setInstalado] = useState(estaStandalone())

  useEffect(() => {
    if (instalado) return
    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setPromptEvento(e as EventoInstalacao)
    }
    function onInstalled() { setInstalado(true); setPromptEvento(null) }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [instalado])

  if (instalado) return null
  if (!promptEvento && !ehIos()) return null // navegador sem suporte (ex.: Firefox mobile) — não mostra nada

  async function clicar() {
    if (promptEvento) {
      await promptEvento.prompt()
      const { outcome } = await promptEvento.userChoice
      if (outcome === 'accepted') setInstalado(true)
      setPromptEvento(null)
      return
    }
    setInstrucoesIosAbertas(true)
  }

  return (
    <>
      <button type="button" className={className} aria-label="Instalar app" onClick={clicar}><Download size={18} /></button>
      {instrucoesIosAbertas && (
        <div className="vit-modal-fundo" onClick={() => setInstrucoesIosAbertas(false)}>
          <div className="vit-modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <button type="button" className="vit-modal-fechar" onClick={() => setInstrucoesIosAbertas(false)} aria-label="Fechar"><X size={18} /></button>
            <h3 className="vit-modal-nome">Instalar na tela de início</h3>
            <p style={{ margin: '16px 0', lineHeight: 1.6 }}>
              1. Toque no ícone <Share size={16} style={{ verticalAlign: 'middle' }} /> <strong>Compartilhar</strong> na barra do Safari.<br />
              2. Escolha <strong>Adicionar à Tela de Início</strong> <PlusSquare size={16} style={{ verticalAlign: 'middle' }} />.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

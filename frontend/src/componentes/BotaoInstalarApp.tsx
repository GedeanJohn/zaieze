import { useEffect, useState } from 'react'
import { Download, Share, X, PlusSquare, Compass } from 'lucide-react'

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

/** "Adicionar à Tela de Início" só existe no Safari de verdade — dentro do navegador embutido de
 *  outros apps (WhatsApp, Instagram etc., que abrem o link numa SFSafariViewController) essa opção
 *  nem aparece no compartilhar. O esquema x-safari-https:// é reconhecido pelo iOS pra tirar a
 *  página desse navegador embutido e abrir na Safari de verdade (mesma página, mesma URL). */
function urlForcaSafari(url: string): string {
  return url.replace(/^https?:\/\//, (m) => (m === 'https://' ? 'x-safari-https://' : 'x-safari-http://'))
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
            <p style={{ margin: '16px 0 6px', lineHeight: 1.6, fontSize: 13, color: '#b8b3ac' }}>
              Abriu esse link pelo WhatsApp, Instagram ou outro app? "Adicionar à Tela de Início" só
              funciona no Safari de verdade — toque no botão abaixo primeiro.
            </p>
            <a
              className="vit-modal-catalogo" style={{ marginTop: 10 }}
              href={urlForcaSafari(window.location.href)}
            >
              <Compass size={18} /> Abrir no Safari
            </a>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#8a8a8a' }}>
              O iPhone vai perguntar se pode abrir no Safari — toque em <strong>"Abrir"</strong> na confirmação.
            </p>
            <p style={{ margin: '18px 0 0', lineHeight: 1.6 }}>
              1. Toque no ícone <Share size={16} style={{ verticalAlign: 'middle' }} /> <strong>Compartilhar</strong> na barra do Safari.<br />
              2. Escolha <strong>Adicionar à Tela de Início</strong> <PlusSquare size={16} style={{ verticalAlign: 'middle' }} />.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

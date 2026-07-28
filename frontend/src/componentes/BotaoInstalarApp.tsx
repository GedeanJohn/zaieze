import { useEffect, useState } from 'react'
import { Download, Share, X, PlusSquare, Copy, Check } from 'lucide-react'
import { useToast } from './Toast'

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
  const [linkCopiado, setLinkCopiado] = useState(false)
  const avisar = useToast()

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

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {
      avisar('Não deu pra copiar automaticamente. Toque e segure o endereço na barra do navegador pra copiar.')
      return
    }
    setLinkCopiado(true)
    avisar('Link copiado.')
    setTimeout(() => setLinkCopiado(false), 3000)
  }

  return (
    <>
      <button type="button" className={className} aria-label="Instalar app" onClick={clicar}><Download size={18} /></button>
      {instrucoesIosAbertas && (
        // Estilo 100% inline (não depende de classes "vit-*"/"pv-*" da página que renderiza este
        // componente) — ele é usado em telas com temas diferentes (Brand Partner, vitrine da
        // vendedora), e depender de CSS externo deixava o modal sem estilo (texto ilegível, botão
        // parecendo desativado) fora da página onde essas classes foram originalmente definidas.
        <div
          onClick={() => setInstrucoesIosAbertas(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: 'min(400px, 100%)', maxHeight: '88vh', overflowY: 'auto', position: 'relative', textAlign: 'center', color: '#f2efe9' }}
          >
            <button type="button" onClick={() => setInstrucoesIosAbertas(false)} aria-label="Fechar" style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', color: '#ccc', cursor: 'pointer' }}><X size={18} /></button>
            <h3 style={{ margin: '0 0 18px', fontSize: 18 }}>Instalar na tela de início</h3>
            <p style={{ margin: '16px 0 6px', lineHeight: 1.6, fontSize: 13, color: '#b8b3ac' }}>
              Abriu esse link pelo WhatsApp, Instagram ou outro app? "Adicionar à Tela de Início" só
              funciona no Safari de verdade — copie o link abaixo e cole no Safari.
            </p>
            <button
              type="button"
              onClick={copiarLink}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, width: '100%', border: 'none', padding: '12px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #d6b06f, #b8863f)', color: '#14100a', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              {linkCopiado ? <Check size={18} /> : <Copy size={18} />} {linkCopiado ? 'Link copiado' : 'Copiar link'}
            </button>
            <p style={{ margin: '18px 0 0', lineHeight: 1.6 }}>
              1. Abra o Safari e cole o link.<br />
              2. Toque no ícone <Share size={16} style={{ verticalAlign: 'middle' }} /> <strong>Compartilhar</strong> na barra do Safari.<br />
              3. Escolha <strong>Adicionar à Tela de Início</strong> <PlusSquare size={16} style={{ verticalAlign: 'middle' }} />.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

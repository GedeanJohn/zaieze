import { useEffect, useState } from 'react'
import { Download, Share, X, PlusSquare, Copy, Check, Smartphone } from 'lucide-react'
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
        // Estilo próprio, isolado por classes "zz-pwa-*" (não depende de CSS da página que renderiza
        // este componente) — ele é usado em telas com temas diferentes (Brand Partner, vitrine da
        // vendedora), e depender de CSS externo deixava o modal sem estilo (texto ilegível, botão
        // parecendo desativado) fora da página onde essas classes foram originalmente definidas.
        <div className="zz-pwa-fundo" onClick={() => setInstrucoesIosAbertas(false)}>
          <ZzPwaEstilos />
          <div className="zz-pwa-janela" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="zz-pwa-fechar" onClick={() => setInstrucoesIosAbertas(false)} aria-label="Fechar"><X size={18} /></button>
            <div className="zz-pwa-selo"><Smartphone size={22} /></div>
            <h3 className="zz-pwa-titulo">Instalar na tela de início</h3>
            <p className="zz-pwa-texto">
              Abriu esse link pelo WhatsApp, Instagram ou outro app? "Adicionar à Tela de Início" só
              funciona no Safari de verdade — copie o link abaixo e cole no Safari.
            </p>
            <button type="button" className="zz-pwa-botao" onClick={copiarLink}>
              {linkCopiado ? <Check size={18} /> : <Copy size={18} />} {linkCopiado ? 'Link copiado' : 'Copiar link'}
            </button>
            <ol className="zz-pwa-passos">
              <li><span className="zz-pwa-passo-num">1</span> Abra o Safari e cole o link.</li>
              <li><span className="zz-pwa-passo-num">2</span> Toque no ícone <Share size={14} style={{ verticalAlign: 'middle' }} /> <strong>Compartilhar</strong> na barra do Safari.</li>
              <li><span className="zz-pwa-passo-num">3</span> Escolha <strong>Adicionar à Tela de Início</strong> <PlusSquare size={14} style={{ verticalAlign: 'middle' }} />.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  )
}

function ZzPwaEstilos() {
  return (
    <style>{`
      @keyframes zz-pwa-entra { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      .zz-pwa-fundo {
        position: fixed; inset: 0; z-index: 9999; padding: 16px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(10, 8, 6, 0.72); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
      }
      .zz-pwa-janela {
        position: relative; width: min(420px, 100%); max-height: 88vh; overflow-y: auto;
        text-align: center; padding: 32px 28px 26px;
        background: linear-gradient(180deg, #1a1a1a 0%, #121212 100%);
        border: 1px solid rgba(214, 176, 111, 0.25); border-radius: 20px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.03) inset;
        color: #f2efe9; animation: zz-pwa-entra 0.22s ease-out;
      }
      .zz-pwa-fechar {
        position: absolute; top: 14px; right: 14px; background: rgba(255,255,255,0.06); border: none;
        color: #cfc9c1; cursor: pointer; width: 30px; height: 30px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center; transition: background 0.15s ease, color 0.15s ease;
      }
      .zz-pwa-fechar:hover { background: rgba(255,255,255,0.14); color: #fff; }
      .zz-pwa-selo {
        width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center; color: #14100a;
        background: radial-gradient(circle at 35% 30%, #f0c481 0%, #d6b06f 55%, #b8863f 100%);
        box-shadow: 0 8px 22px rgba(214, 176, 111, 0.35);
      }
      .zz-pwa-titulo { margin: 0 0 10px; font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
      .zz-pwa-texto { margin: 0 0 18px; line-height: 1.6; font-size: 13.5px; color: #a8a29a; }
      .zz-pwa-botao {
        display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
        border: none; padding: 13px 14px; border-radius: 11px; cursor: pointer;
        background: linear-gradient(135deg, #e3c07f, #b8863f); color: #14100a;
        font-size: 14px; font-weight: 700; letter-spacing: 0.01em;
        box-shadow: 0 6px 18px rgba(214, 176, 111, 0.3); transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      .zz-pwa-botao:hover { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(214, 176, 111, 0.4); }
      .zz-pwa-botao:active { transform: translateY(0); }
      .zz-pwa-passos {
        list-style: none; margin: 20px 0 0; padding: 16px 16px 4px; text-align: left;
        border-top: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 14px;
      }
      .zz-pwa-passos li { display: flex; align-items: flex-start; gap: 10px; line-height: 1.5; font-size: 13.5px; color: #d8d3ca; }
      .zz-pwa-passo-num {
        flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; margin-top: 1px;
        display: flex; align-items: center; justify-content: center;
        background: rgba(214, 176, 111, 0.16); color: #e3c07f; font-size: 12px; font-weight: 700;
      }
    `}</style>
  )
}

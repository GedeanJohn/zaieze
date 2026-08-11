import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ShoppingBag, Package, ShoppingCart } from 'lucide-react'
import { CatalogoEstilos } from '../paginas/site/Catalogo'
import { PerfilVendedoraEstilos, montarPaleta } from '../paginas/site/PerfilVendedora'

interface Props {
  nome: string
  logoUrl: string | null
  corPrimaria: string
  corSecundaria: string
  onClose: () => void
}

/** Miniatura de 2-3 peças fictícias, só para dar noção de como o grid de produtos fica na cor de fundo escolhida. */
const PLACEHOLDERS = [
  { nome: 'Vestido Essencial', preco: 'R$ 189,90' },
  { nome: 'Blazer Alfaiataria', preco: 'R$ 279,90' },
  { nome: 'Calça Wide Leg', preco: 'R$ 159,90' },
]

/**
 * Cada frame (mobile/desktop) roda dentro do PRÓPRIO <iframe> — documento isolado, com a folha de
 * estilos do app copiada pro <head> dele. Só assim as media queries (@media max-width, usadas por
 * CatalogoEstilos/PerfilVendedoraEstilos) respondem à largura REAL do frame simulado, em vez da
 * largura da janela do navegador — sem isso "Mobile" e "Desktop" sempre renderizam com o mesmo CSS
 * quando vistos numa tela grande (era por isso que os cards apareciam cortados no frame "Mobile").
 */
function FrameIsolado({ children }: { children: ReactNode }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [body, setBody] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.open()
    doc.write('<!doctype html><html><head></head><body style="margin:0"></body></html>')
    doc.close()
    document.querySelectorAll('head link[rel="stylesheet"], head > style').forEach((no) => {
      doc.head.appendChild(no.cloneNode(true))
    })
    setBody(doc.body)
  }, [])

  return (
    <>
      <iframe ref={iframeRef} title="Prévia da loja" style={{ border: 'none', width: '100%', height: '100%', display: 'block' }} />
      {body && createPortal(children, body)}
    </>
  )
}

/**
 * Prévia (mobile + desktop) de como a vitrine da vendedora fica com a logo/cores atuais da marca.
 * Reaproveita a estrutura e o CSS reais da vitrine (PerfilVendedoraEstilos/montarPaleta) em vez de
 * markup próprio — antes usava classes "cat-perfil"/"cat-avatar-perfil"/etc. que não existem mais
 * desde o redesign da vitrine (commit bd2d605), então o cabeçalho renderizava sem nenhum estilo
 * (texto sobreposto). O banner da marca não aparece aqui porque hoje ele não é exibido em nenhuma
 * tela pública real (nem vitrine, nem catálogo) — mostrar isso no preview seria prometer algo que
 * não existe.
 */
export default function PreviewLoja({ nome, logoUrl, corPrimaria, corSecundaria, onClose }: Props) {
  const paleta = montarPaleta(corPrimaria || '#111111', corSecundaria || '#ffffff')
  const vars = {
    '--pv-fundo': paleta.fundo, '--pv-texto': paleta.texto, '--pv-texto-suave': paleta.textoSuave,
    '--pv-borda': paleta.borda, '--pv-mistura': paleta.mistura,
    '--pv-acento': paleta.acento, '--pv-acento-texto': paleta.acentoTexto,
  } as CSSProperties

  const conteudo = (
    <>
      <CatalogoEstilos />
      <PerfilVendedoraEstilos />
      <div className="pv-root" style={{ ...vars, minHeight: 'auto', paddingBottom: 24 }}>
        <header className="pv-topo">
          <div className="pv-marca-wrap">
            {logoUrl ? <img className="pv-marca-logo" src={logoUrl} alt={nome} /> : <div className="pv-marca-nome">{nome}</div>}
          </div>
        </header>

        <section className="pv-hero">
          <div className="pv-hero-topo">
            <div className="pv-hero-foto-col">
              <div className="pv-hero-foto">
                <div className="pv-hero-fotoVazia">S</div>
                <span className="pv-disponivel"><span className="pv-disponivel-bolha" /> Disponível</span>
              </div>
            </div>
            <div className="pv-hero-info">
              <div className="pv-selo">Vendedora Oficial {nome}</div>
              <h1 className="pv-nome"><strong>Sua</strong> Vendedora</h1>
              <p className="pv-bio">✨ A bio da vendedora aparece aqui, quando ela preencher em "Minha conta".</p>
              <div className="pv-pilares">
                <span>Atacado e varejo</span>
                <span>Envio rápido</span>
                <span>Suporte dedicado</span>
              </div>
            </div>
          </div>
          <div className="pv-acoes">
            <button type="button" className="pv-btn-secundario"><ShoppingBag size={18} /> Vitrine Virtual</button>
            <button type="button" className="pv-btn-secundario"><Package size={18} /> Pedidos</button>
            <button type="button" className="pv-btn-secundario pv-btn-full"><ShoppingCart size={18} /> Carrinho</button>
          </div>
        </section>

        <section className="cat-secao">
          <h2 className="cat-secao-titulo">Novidades</h2>
          <div className="cat-grid">
            {PLACEHOLDERS.map((p) => (
              <div key={p.nome} className="cat-card">
                <div className="cat-foto"><div className="cat-foto-vazia">{p.nome}</div></div>
                <div className="cat-info">
                  <div className="cat-nome">{p.nome}</div>
                  <div className="cat-preco"><span>{p.preco}</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="pv-rodape">{nome} · powered by ZAIEZE</footer>
      </div>
    </>
  )

  return (
    <div className="modal-fundo" onClick={onClose}>
      <div className="preview-loja" onClick={(e) => e.stopPropagation()}>
        <div className="preview-loja-topo">
          <strong>Como sua loja vai aparecer</strong>
          <button type="button" className="btn secundario" onClick={onClose}>Fechar</button>
        </div>
        <div className="preview-loja-frames">
          <div className="preview-loja-frame mobile">
            <div className="preview-loja-rotulo">📱 Mobile</div>
            <div className="preview-loja-tela"><FrameIsolado>{conteudo}</FrameIsolado></div>
          </div>
          <div className="preview-loja-frame desktop">
            <div className="preview-loja-rotulo">🖥️ Desktop</div>
            <div className="preview-loja-tela"><FrameIsolado>{conteudo}</FrameIsolado></div>
          </div>
        </div>
      </div>
    </div>
  )
}

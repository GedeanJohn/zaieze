import type { CSSProperties } from 'react'
import { CatalogoEstilos } from '../paginas/site/Catalogo'

interface Props {
  nome: string
  logoUrl: string | null
  bannerUrl: string | null
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

/** Prévia (mobile + desktop) de como o catálogo público fica com a logo/banner/cores atuais da marca. */
export default function PreviewLoja({ nome, logoUrl, bannerUrl, corPrimaria, corSecundaria, onClose }: Props) {
  const vars = { '--cat-primaria': corPrimaria || '#111111', '--cat-fundo': corSecundaria || '#ffffff' } as CSSProperties

  const conteudo = (
    <div className="cat-root" style={{ ...vars, minHeight: 'auto' }}>
      <header className="cat-perfil">
        <div className="cat-capa">
          {bannerUrl
            ? <img src={bannerUrl} alt="" />
            : <div className="cat-capa-marca">
                {logoUrl ? <img src={logoUrl} alt={nome} /> : <span>{nome}</span>}
              </div>}
        </div>
        <div className="cat-avatar-perfil"><span>SV</span></div>
        <div className="cat-cartao">
          <h1 className="cat-nome-perfil">Sua Vendedora <span className="cat-sep">|</span> {nome}</h1>
          <p className="cat-bio">✨ A bio da vendedora aparece aqui, quando ela preencher em "Minha conta".</p>
          <div className="cat-atalhos">
            <button type="button" className="cat-atalho">✨ Novidades</button>
            <button type="button" className="cat-atalho">👗 Coleções</button>
            <button type="button" className="cat-atalho cat-atalho-full">💬 Falar com a vendedora</button>
          </div>
        </div>
      </header>

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

      <footer className="cat-rodape">{nome} · powered by ZAIEZE</footer>
    </div>
  )

  return (
    <div className="modal-fundo" onClick={onClose}>
      <CatalogoEstilos />
      <div className="preview-loja" onClick={(e) => e.stopPropagation()}>
        <div className="preview-loja-topo">
          <strong>Como sua loja vai aparecer</strong>
          <button type="button" className="btn secundario" onClick={onClose}>Fechar</button>
        </div>
        <div className="preview-loja-frames">
          <div className="preview-loja-frame mobile">
            <div className="preview-loja-rotulo">📱 Mobile</div>
            <div className="preview-loja-tela">{conteudo}</div>
          </div>
          <div className="preview-loja-frame desktop">
            <div className="preview-loja-rotulo">🖥️ Desktop</div>
            <div className="preview-loja-tela">{conteudo}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { VitrineEstilos } from '../paginas/assessora/VitrineAssessora'

interface Props {
  nome: string
  fotoUrl: string | null
  tagline: string
  bio: string
  disponivel: boolean
  totalMarcas: number
  statProdutos: string
  statClientes: string
  statAvaliacao: string
  onClose: () => void
}

/** Miniaturas de marca fictícias, só para dar noção de como a grade fica. */
const PLACEHOLDERS = ['Marca A', 'Marca B', 'Marca C']

/** Prévia (mobile + desktop) de como a vitrine pública fica com os dados atuais do formulário. */
export default function PreviewVitrine({ nome, fotoUrl, tagline, bio, disponivel, totalMarcas, statProdutos, statClientes, statAvaliacao, onClose }: Props) {
  const [primeiroNome, ...resto] = (nome || 'Seu Nome').split(' ')

  const conteudo = (
    <div className="vit-root" style={{ minHeight: 'auto' }}>
      <header className="vit-topo">
        <div className="vit-marca-wrap">
          <div className="vit-marca-nome">zaieze</div>
          <div className="vit-marca-sub">SISTEMAS PARA MODA</div>
        </div>
      </header>

      <section className="vit-hero">
        <div className="vit-hero-foto">
          {fotoUrl ? <img src={fotoUrl} alt={nome} /> : <div className="vit-hero-fotoVazia">{(nome || '?').slice(0, 1).toUpperCase()}</div>}
          <span className="vit-disponivel"><span className={`vit-disponivel-bolha${disponivel ? '' : ' off'}`} /> {disponivel ? 'Disponível' : 'Indisponível'}</span>
        </div>
        <div className="vit-hero-info">
          <div className="vit-selo">Brand Partner</div>
          <h1 className="vit-nome"><strong>{primeiroNome}</strong>{resto.length > 0 ? ` ${resto.join(' ')}` : ''}</h1>
          {tagline && <p className="vit-tagline">{tagline}</p>}
          {bio && <p className="vit-bio">{bio}</p>}
          <div className="vit-stats">
            <div className="vit-stat"><strong>{totalMarcas}</strong><span>Marcas</span></div>
            {statProdutos && <div className="vit-stat"><strong>{statProdutos}+</strong><span>Produtos</span></div>}
            {statClientes && <div className="vit-stat"><strong>{statClientes}+</strong><span>Clientes</span></div>}
            {statAvaliacao && <div className="vit-stat"><strong>{Number(statAvaliacao).toFixed(1)}</strong><span>Avaliação</span></div>}
          </div>
          <div className="vit-acoes">
            <span className="vit-btn-primario">Falar no WhatsApp</span>
            <span className="vit-btn-secundario">Ligar</span>
          </div>
        </div>
      </section>

      <section className="vit-marcas-secao">
        <div className="vit-marcas-cabec"><h2>Marcas que represento</h2></div>
        <div className="vit-grid">
          {PLACEHOLDERS.map((p) => <div key={p} className="vit-cardMarca"><div className="vit-cardMarca-semImagem">{p}</div></div>)}
        </div>
      </section>

      <footer style={{ textAlign: 'center', color: '#666', fontSize: 11, padding: '20px 0' }}>powered by ZAIEZE</footer>
    </div>
  )

  return (
    <div className="modal-fundo" onClick={onClose}>
      <VitrineEstilos />
      <div className="preview-loja" onClick={(e) => e.stopPropagation()}>
        <div className="preview-loja-topo">
          <strong>Como sua vitrine vai aparecer</strong>
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

import { useEffect, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api'
import { HOST } from '../../host'
import AgenteLoja from './AgenteLoja'

interface Produto {
  id: string; nome: string; descricao?: string | null; preco: number
  outlet?: boolean; descontoPct?: number | null; precoOriginal?: number | null
  fotos: string[]; videos: string[]; categoria: string | null; cores: string[]; tamanhos: string[]; disponivel: boolean
}
interface Colecao { id: string; nome: string; descricao?: string | null; outlet?: boolean; produtos: Produto[] }
interface Catalogo {
  marca: { nome: string; logoUrl: string | null; corPrimaria: string; corSecundaria: string }
  loja: { nome: string }
  vendedora: { nome: string; primeiroNome: string; temWhatsapp: boolean }
  pedidoMinimoAtacado?: number
  colecoes: Colecao[]
}

const real = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function Catalogo() {
  const { vendSlug } = useParams<{ vendSlug: string }>()
  const redeSlug = HOST.slug
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [erro, setErro] = useState('')
  const [agente, setAgente] = useState<{ produtoId?: string; produtoNome?: string } | null>(null)

  useEffect(() => {
    if (!redeSlug || !vendSlug) { setErro('Catálogo não encontrado.'); return }
    api.get(`/catalogo/publico/${redeSlug}/${vendSlug}`)
      .then(({ data }) => setCat(data))
      .catch(() => setErro('Este catálogo não está disponível.'))
  }, [redeSlug, vendSlug])

  if (erro) return <div className="cat-vazio">{erro}</div>
  if (!cat) return <div className="cat-vazio">Carregando…</div>

  const primaria = cat.marca.corPrimaria || '#111111'
  const fundo = cat.marca.corSecundaria || '#ffffff'

  return (
    <div className="cat-root" style={{ '--cat-primaria': primaria, '--cat-fundo': fundo } as CSSProperties}>
      <CatalogoEstilos />

      <header className="cat-header">
        {cat.marca.logoUrl
          ? <img className="cat-logo" src={cat.marca.logoUrl} alt={cat.marca.nome} />
          : <div className="cat-logo-texto">{cat.marca.nome}</div>}
        <div className="cat-sub">com <strong>{cat.vendedora.primeiroNome}</strong> · {cat.loja.nome}</div>
      </header>

      {cat.colecoes.length === 0 && <div className="cat-vazio">Em breve, novidades por aqui. ✨</div>}

      {cat.colecoes.map((c) => (
        <section key={c.id} className="cat-secao">
          <h2 className="cat-secao-titulo">{c.nome}{c.outlet && <span className="cat-outlet-tag">Outlet</span>}</h2>
          {c.descricao && <p className="cat-secao-desc">{c.descricao}</p>}
          <div className="cat-grid">
            {c.produtos.map((p) => (
              <button key={p.id} className="cat-card" onClick={() => setAgente({ produtoId: p.id, produtoNome: p.nome })}>
                <div className="cat-foto">
                  {p.fotos[0]
                    ? <img src={p.fotos[0]} alt={p.nome} loading="lazy" />
                    : <div className="cat-foto-vazia">{p.nome}</div>}
                  {p.videos.length > 0 && <span className="cat-video-badge">▶ vídeo</span>}
                  {!p.disponivel && <span className="cat-esgotado">esgotado</span>}
                  {p.descontoPct ? <span className="cat-desconto">−{p.descontoPct}%</span> : null}
                </div>
                <div className="cat-info">
                  <div className="cat-nome">{p.nome}</div>
                  <div className="cat-preco">
                    {p.precoOriginal ? <span className="cat-preco-antigo">{real(p.precoOriginal)}</span> : null}
                    <span className={p.descontoPct ? 'cat-preco-promo' : ''}>{real(p.preco)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* CTA fixo — abre a Vendedora Online (Agente 2) */}
      <button className="cat-cta-fixo" onClick={() => setAgente({})}>
        💬 Falar com {cat.vendedora.primeiroNome}
      </button>

      {agente && (
        <AgenteLoja
          redeSlug={redeSlug!}
          vendSlug={vendSlug!}
          marcaNome={cat.marca.nome}
          vendedora={cat.vendedora.primeiroNome}
          pedidoMinimoAtacado={cat.pedidoMinimoAtacado}
          produtoId={agente.produtoId}
          produtoNome={agente.produtoNome}
          onClose={() => setAgente(null)}
        />
      )}

      <footer className="cat-rodape">{cat.marca.nome} · powered by ZAIEZE</footer>
    </div>
  )
}

/** Estética inspirada no emmacloth: claro, minimalista, foto em destaque, sans-serif. */
function CatalogoEstilos() {
  return (
    <style>{`
      .cat-root { min-height: 100vh; background: var(--cat-fundo); color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; padding-bottom: 96px; }
      .cat-vazio { min-height: 70vh; display: flex; align-items: center; justify-content: center; color: #777; font-family: sans-serif; padding: 40px; text-align: center; }
      .cat-header { padding: 28px 16px 18px; text-align: center; border-bottom: 1px solid #00000010; }
      .cat-logo { max-height: 64px; max-width: 220px; object-fit: contain; }
      .cat-logo-texto { font-size: 26px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; }
      .cat-sub { margin-top: 8px; font-size: 13px; color: #555; }
      .cat-secao { max-width: 1100px; margin: 0 auto; padding: 26px 14px 6px; }
      .cat-secao-titulo { font-size: 18px; font-weight: 700; letter-spacing: .5px; margin: 0 0 2px; text-transform: uppercase; }
      .cat-secao-desc { margin: 0 0 14px; color: #666; font-size: 13px; }
      .cat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
      @media (min-width: 640px) { .cat-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; } }
      @media (min-width: 960px) { .cat-grid { grid-template-columns: repeat(4, 1fr); } }
      .cat-card { border: none; background: transparent; padding: 0; cursor: pointer; text-align: left; }
      .cat-foto { position: relative; aspect-ratio: 3/4; background: #f2f2f2; overflow: hidden; border-radius: 4px; }
      .cat-foto img { width: 100%; height: 100%; object-fit: cover; transition: transform .35s ease; }
      .cat-card:hover .cat-foto img { transform: scale(1.04); }
      .cat-foto-vazia { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 13px; padding: 8px; text-align: center; }
      .cat-esgotado { position: absolute; top: 8px; left: 8px; background: #00000099; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: .5px; }
      .cat-video-badge { position: absolute; top: 8px; right: 8px; background: #000000aa; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 99px; letter-spacing: .3px; }
      .cat-info { padding: 8px 2px 4px; }
      .cat-nome { font-size: 13px; color: #222; line-height: 1.3; }
      .cat-preco { font-size: 14px; font-weight: 700; margin-top: 2px; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
      .cat-preco-antigo { color: #999; font-weight: 500; text-decoration: line-through; font-size: 12px; }
      .cat-preco-promo { color: #d12c2c; }
      .cat-desconto { position: absolute; bottom: 8px; left: 8px; background: #d12c2c; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; letter-spacing: .3px; }
      .cat-outlet-tag { display: inline-block; margin-left: 8px; vertical-align: middle; background: #f59e0b; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 99px; letter-spacing: .5px; text-transform: uppercase; }
      .cat-cta-fixo { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--cat-primaria); color: #fff; border: none; padding: 14px 26px; border-radius: 99px; font-size: 15px; font-weight: 600; cursor: pointer; box-shadow: 0 8px 24px #00000033; z-index: 20; }
      .cat-modal-fundo { position: fixed; inset: 0; background: #00000066; display: flex; align-items: flex-end; justify-content: center; z-index: 30; }
      @media (min-width: 640px) { .cat-modal-fundo { align-items: center; } }
      .cat-modal { background: #fff; width: min(440px, 100%); border-radius: 16px 16px 0 0; padding: 22px; display: flex; flex-direction: column; gap: 10px; }
      @media (min-width: 640px) { .cat-modal { border-radius: 16px; } }
      .cat-modal h3 { margin: 0; font-size: 18px; }
      .cat-modal-item { margin: 0; font-size: 13px; color: #333; background: #f5f5f5; padding: 8px 10px; border-radius: 8px; }
      .cat-modal-txt { margin: 0; font-size: 13px; color: #666; }
      .cat-modal input { border: 1px solid #ddd; border-radius: 8px; padding: 12px; font-size: 15px; }
      .cat-cta { background: var(--cat-primaria); color: #fff; border: none; padding: 13px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
      .cat-cta:disabled { opacity: .6; }
      .cat-fechar { background: none; border: none; color: #888; cursor: pointer; font-size: 13px; padding: 4px; }
      .cat-rodape { text-align: center; color: #aaa; font-size: 12px; padding: 30px 0 16px; }
    `}</style>
  )
}

import { useEffect, useMemo, useState } from 'react'
import {
  Search, Share2, MessageCircle, Menu, X, Tag, Shirt, Users, Star, Gift, Megaphone, Truck,
  Headphones, Home, ShoppingBag, UserRound, FileText, MoreHorizontal, Globe, Send, Phone, Play,
} from 'lucide-react'
import { api } from '../../api'
import { useToast } from '../../componentes/Toast'

interface Midia { id: string; tipo: 'FOTO' | 'VIDEO'; url: string; ordem: number }
interface Marca {
  id: string; redeId: string | null; nome: string; logoUrl: string | null; bannerUrl: string | null
  midias: Midia[]
  instagram: string | null; facebook: string | null; whatsapp: string | null; telegram: string | null; tiktok: string | null; site: string | null
  linkCatalogo: string | null
}
interface Vitrine {
  nome: string; fotoUrl: string | null; bio: string | null; tagline: string | null; disponivel: boolean
  whatsapp: string | null; telefone: string | null; instagram: string | null; site: string | null
  statMarcas: number; statProdutos: number | null; statClientes: number | null; statAvaliacao: number | null
  marcas: Marca[]
}

function linkWhatsapp(numero: string): string {
  return `https://wa.me/${numero.replace(/\D/g, '')}`
}

/** Defesa em profundidade: mesmo com validação no cadastro (backend), nunca renderiza um href
 *  de esquema perigoso (ex.: "javascript:") vindo de campo livre da marca — página pública,
 *  sem autenticação, clicável por qualquer visitante. */
function linkPublicoSeguro(url: string | null | undefined): string | null {
  if (url && /^https?:\/\//i.test(url)) return url
  return null
}

const NAV_ITENS = [
  { id: 'inicio', rotulo: 'Início', Icone: Home },
  { id: 'catalogo', rotulo: 'Catálogo', Icone: ShoppingBag },
  { id: 'perfil', rotulo: 'Perfil', Icone: UserRound },
  { id: 'pedidos', rotulo: 'Pedidos', Icone: FileText },
  { id: 'mais', rotulo: 'Mais', Icone: MoreHorizontal },
] as const

export default function VitrineAssessora({ slug }: { slug: string }) {
  const [v, setV] = useState<Vitrine | null>(null)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [marcaModal, setMarcaModal] = useState<Marca | null>(null)
  const avisar = useToast()

  useEffect(() => {
    api.get(`/assessores/publico/${slug}`).then(({ data }) => setV(data)).catch(() => setErro('Página não encontrada.'))
  }, [slug])

  const marcasFiltradas = useMemo(() => {
    if (!v) return []
    const q = busca.trim().toLowerCase()
    return q ? v.marcas.filter((m) => m.nome.toLowerCase().includes(q)) : v.marcas
  }, [v, busca])

  function compartilhar() {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: v?.nome, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url)
      avisar('Link copiado.')
    }
  }

  function irPara(id: (typeof NAV_ITENS)[number]['id']) {
    setDrawerAberto(false)
    if (id === 'inicio' || id === 'perfil') { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    if (id === 'mais') { setDrawerAberto(true); return }
    avisar('Em breve.')
  }

  if (erro) return <div className="vit-vazio">{erro}</div>
  if (!v) return <div className="vit-vazio">Carregando…</div>

  const [primeiroNome, ...resto] = v.nome.split(' ')

  return (
    <div className="vit-root">
      <VitrineEstilos />

      <header className="vit-topo">
        <div className="vit-marca-wrap">
          <div className="vit-marca-nome">zaieze</div>
          <div className="vit-marca-sub">SISTEMAS PARA MODA</div>
        </div>
        <div className="vit-topo-acoes">
          <button type="button" className="vit-icone-botao" aria-label="Buscar marca" onClick={() => setBuscaAberta((a) => !a)}><Search size={18} /></button>
          <button type="button" className="vit-icone-botao" aria-label="Compartilhar" onClick={compartilhar}><Share2 size={18} /></button>
          {v.whatsapp && (
            <a className="vit-icone-botao" aria-label="Falar no WhatsApp" href={linkWhatsapp(v.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle size={18} /></a>
          )}
          <button type="button" className="vit-icone-botao" aria-label="Menu" onClick={() => setDrawerAberto(true)}><Menu size={18} /></button>
        </div>
      </header>

      {buscaAberta && (
        <div className="vit-busca-barra">
          <Search size={16} />
          <input autoFocus placeholder="Buscar marca…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      )}

      {drawerAberto && (
        <div className="vit-drawer-fundo" onClick={() => setDrawerAberto(false)}>
          <nav className="vit-drawer" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="vit-drawer-fechar" onClick={() => setDrawerAberto(false)} aria-label="Fechar"><X size={18} /></button>
            {NAV_ITENS.map(({ id, rotulo, Icone }) => (
              <button key={id} type="button" className="vit-drawer-item" onClick={() => irPara(id)}>
                <Icone size={18} /> {rotulo}
              </button>
            ))}
          </nav>
        </div>
      )}

      <section className="vit-hero">
        <div className="vit-hero-topo">
          <div className="vit-hero-foto">
            {v.fotoUrl
              ? <img src={v.fotoUrl} alt={v.nome} />
              : <div className="vit-hero-fotoVazia">{v.nome.slice(0, 1).toUpperCase()}</div>}
            <span className="vit-disponivel"><span className={`vit-disponivel-bolha${v.disponivel ? '' : ' off'}`} /> {v.disponivel ? 'Disponível' : 'Offline'}</span>
          </div>

          <div className="vit-hero-info">
            <div className="vit-selo">Brand Partner</div>
            <h1 className="vit-nome"><strong>{primeiroNome}</strong>{resto.length > 0 ? ` ${resto.join(' ')}` : ''}</h1>
            {v.tagline && <p className="vit-tagline">{v.tagline}</p>}
            {v.bio && <p className="vit-bio">{v.bio}</p>}

            <div className="vit-stats">
              <div className="vit-stat"><Tag size={20} /><strong>{v.statMarcas}</strong><span>Marcas</span></div>
              {v.statProdutos != null && <div className="vit-stat"><Shirt size={20} /><strong>{v.statProdutos}+</strong><span>Produtos</span></div>}
              {v.statClientes != null && <div className="vit-stat"><Users size={20} /><strong>{v.statClientes}+</strong><span>Clientes</span></div>}
              {v.statAvaliacao != null && <div className="vit-stat"><Star size={20} /><strong>{v.statAvaliacao.toFixed(1)}</strong><span>Avaliação</span></div>}
            </div>
          </div>
        </div>

        <div className="vit-acoes">
          {v.whatsapp && <a className="vit-btn-primario" href={linkWhatsapp(v.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle size={18} /> Falar no WhatsApp</a>}
          {v.telefone && <a className="vit-btn-secundario" href={`tel:${v.telefone}`}><Phone size={18} /> Ligar</a>}
        </div>
      </section>

      <section className="vit-marcas-secao">
        <div className="vit-marcas-cabec">
          <h2>Marcas que represento</h2>
        </div>
        {marcasFiltradas.length === 0 && <div className="vit-vazio-secao">{v.marcas.length === 0 ? 'Nenhuma marca cadastrada ainda.' : 'Nenhuma marca encontrada.'}</div>}
        <div className="vit-grid">
          {marcasFiltradas.map((m) => (
            <button key={m.id} type="button" className="vit-cardMarca" onClick={() => setMarcaModal(m)}>
              {m.bannerUrl
                ? <img src={m.bannerUrl} alt={m.nome} />
                : m.logoUrl
                  ? <div className="vit-cardMarca-logoFundo"><img src={m.logoUrl} alt={m.nome} /></div>
                  : <div className="vit-cardMarca-semImagem">{m.nome}</div>}
              <span className="vit-cardMarca-nome">{m.nome}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="vit-faixa">
        <div className="vit-faixaItem"><Gift size={20} /><div>Novidades<br />Exclusivas</div></div>
        <div className="vit-faixaItem"><Megaphone size={20} /><div>Condições<br />Especiais</div></div>
        <div className="vit-faixaItem"><Truck size={20} /><div>Envio Rápido<br />e Seguro</div></div>
        <div className="vit-faixaItem"><Headphones size={20} /><div>Atendimento<br />Personalizado</div></div>
      </section>

      <nav className="vit-bottom-nav">
        {NAV_ITENS.map(({ id, rotulo, Icone }) => (
          <button key={id} type="button" className={`vit-nav-item${id === 'perfil' ? ' ativo' : ''}`} onClick={() => irPara(id)}>
            <span className="vit-nav-icone"><Icone size={20} /></span>
            {rotulo}
          </button>
        ))}
      </nav>

      {marcaModal && <ModalLinksMarca marca={marcaModal} onClose={() => setMarcaModal(null)} />}
    </div>
  )
}

function ModalLinksMarca({ marca, onClose }: { marca: Marca; onClose: () => void }) {
  const [midiaAberta, setMidiaAberta] = useState<{ tipo: 'imagem' | 'video'; url: string } | null>(null)

  const links: { rotulo: string; href: string; Icone: (p: { size?: number }) => JSX.Element }[] = []
  if (marca.whatsapp) links.push({ rotulo: 'WhatsApp', href: linkWhatsapp(marca.whatsapp), Icone: (p) => <MessageCircle {...p} /> })
  const instagramHref = linkPublicoSeguro(marca.instagram)
  if (instagramHref) links.push({ rotulo: 'Instagram', href: instagramHref, Icone: (p) => <IconeInstagram {...p} /> })
  const facebookHref = linkPublicoSeguro(marca.facebook)
  if (facebookHref) links.push({ rotulo: 'Facebook', href: facebookHref, Icone: (p) => <IconeFacebook {...p} /> })
  const tiktokHref = linkPublicoSeguro(marca.tiktok)
  if (tiktokHref) links.push({ rotulo: 'TikTok', href: tiktokHref, Icone: (p) => <IconeTiktok {...p} /> })
  const telegramHref = linkPublicoSeguro(marca.telegram)
  if (telegramHref) links.push({ rotulo: 'Telegram', href: telegramHref, Icone: (p) => <Send {...p} /> })
  const siteHref = linkPublicoSeguro(marca.site)
  if (siteHref) links.push({ rotulo: 'Site', href: siteHref, Icone: (p) => <Globe {...p} /> })
  const linkCatalogoHref = linkPublicoSeguro(marca.linkCatalogo)

  const midias = marca.midias.map((m) => ({ tipo: m.tipo === 'FOTO' ? ('imagem' as const) : ('video' as const), url: m.url }))

  return (
    <div className="vit-modal-fundo" onClick={onClose}>
      <div className="vit-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="vit-modal-fechar" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        {marca.logoUrl && <img className="vit-modal-logo" src={marca.logoUrl} alt={marca.nome} />}
        <h3 className="vit-modal-nome">{marca.nome}</h3>
        {linkCatalogoHref && (
          <a className="vit-modal-catalogo" href={linkCatalogoHref} target="_blank" rel="noreferrer">
            <ShoppingBag size={18} /> Ver catálogo
          </a>
        )}
        {midias.length > 0 && (
          <div className="vit-modal-galeria">
            {midias.map((m, i) => (
              <button key={i} type="button" className="vit-modal-galeriaItem" onClick={() => setMidiaAberta(m)}>
                {m.tipo === 'imagem'
                  ? <img src={m.url} alt="" />
                  : <>
                      <video src={m.url} muted playsInline />
                      <span className="vit-modal-galeriaPlay"><Play size={16} fill="currentColor" /></span>
                    </>}
              </button>
            ))}
          </div>
        )}
        {links.length === 0 && !linkCatalogoHref && (
          <p className="vit-modal-vazio">Essa marca ainda não cadastrou links de contato.</p>
        )}
        {links.length > 0 && (
          <div className="vit-modal-links">
            {links.map((l) => (
              <a key={l.rotulo} className="vit-modal-link" href={l.href} target="_blank" rel="noreferrer">
                <l.Icone size={20} /> {l.rotulo}
              </a>
            ))}
          </div>
        )}
      </div>

      {midiaAberta && (
        <div className="vit-lightbox-fundo" onClick={(e) => { e.stopPropagation(); setMidiaAberta(null) }}>
          <button type="button" className="vit-lightbox-fechar" onClick={() => setMidiaAberta(null)} aria-label="Fechar"><X size={22} /></button>
          {midiaAberta.tipo === 'imagem'
            ? <img src={midiaAberta.url} alt="" onClick={(e) => e.stopPropagation()} />
            : <video src={midiaAberta.url} controls autoPlay onClick={(e) => e.stopPropagation()} />}
        </div>
      )}
    </div>
  )
}

function IconeInstagram({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconeFacebook({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.53-1.5H16.7V3.6C16.4 3.56 15.4 3.47 14.2 3.47c-2.4 0-4.1 1.47-4.1 4.17v2.32H7.4v3.1h2.7V21h3.4Z" />
    </svg>
  )
}
function IconeTiktok({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M14.5 3c.3 1.8 1.6 3.3 3.4 3.7v2.6c-1.2-.1-2.4-.5-3.4-1.2v6.4c0 3-2.4 5.4-5.4 5.4S3.7 17.5 3.7 14.5c0-2.8 2.1-5.1 4.8-5.4v2.7c-1.2.3-2.1 1.4-2.1 2.7 0 1.5 1.3 2.8 2.8 2.8s2.8-1.3 2.8-2.8V3h2.5Z" />
    </svg>
  )
}

/** CSS-in-JS da vitrine — exportado para ser reaproveitado pelo preview ao vivo no painel (PreviewVitrine). */
export function VitrineEstilos() {
  return (
    <style>{`
      .vit-root {
        background: #0a0a0a; min-height: 100vh; color: #f2efe9;
        font-family: var(--leitura); letter-spacing: 0.01em;
      }
      .vit-root h1, .vit-root h2, .vit-root h3 { font-family: var(--leitura); font-weight: 600; letter-spacing: 0.02em; }
      .vit-vazio { max-width: 700px; margin: 80px auto; text-align: center; color: #999; padding: 0 16px; }

      .vit-topo {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.08);
        position: sticky; top: 0; background: #0a0a0ae6; backdrop-filter: blur(6px); z-index: 20;
      }
      .vit-marca-nome { font-family: var(--marca); font-size: 22px; letter-spacing: 0.06em; color: #fff; line-height: 1; }
      .vit-marca-sub { font-size: 10px; letter-spacing: 0.12em; color: #8a8a8a; margin-top: 2px; }
      .vit-topo-acoes { display: flex; gap: 8px; }
      .vit-icone-botao {
        width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: transparent; border: 1px solid rgba(255,255,255,0.16); color: #f2efe9; cursor: pointer; text-decoration: none;
      }
      .vit-icone-botao:hover { background: rgba(255,255,255,0.06); }

      .vit-busca-barra {
        display: flex; align-items: center; gap: 10px; max-width: 1100px; margin: 0 auto; padding: 10px 24px 0; color: #9a9a9a;
      }
      .vit-busca-barra input { background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.16); color: #fff; padding: 6px 0; font-size: 14px; }
      .vit-busca-barra input:focus { outline: none; border-color: #c9a25f; }

      .vit-drawer-fundo { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 60; display: flex; justify-content: flex-end; }
      .vit-drawer { width: 260px; background: #121212; height: 100%; padding: 20px; display: flex; flex-direction: column; gap: 4px; border-left: 1px solid rgba(255,255,255,0.08); }
      .vit-drawer-fechar { align-self: flex-end; background: none; border: none; color: #ccc; cursor: pointer; margin-bottom: 12px; }
      .vit-drawer-item {
        display: flex; align-items: center; gap: 12px; background: none; border: none; color: #eee; text-align: left;
        padding: 12px 8px; border-radius: 8px; font-size: 15px; cursor: pointer;
      }
      .vit-drawer-item:hover { background: rgba(255,255,255,0.06); }

      .vit-hero { max-width: 1100px; margin: 0 auto; padding: 32px 24px 8px; }
      .vit-hero-topo { display: grid; grid-template-columns: 340px 1fr; gap: 40px; }
      .vit-hero-foto { position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 3/3.5; background: #1a1a1a; }
      .vit-hero-foto img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .vit-hero-fotoVazia { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 64px; font-weight: 800; color: #555; }
      .vit-disponivel {
        position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 6px;
        background: rgba(10,10,10,0.72); padding: 6px 12px; border-radius: 999px; font-size: 12px; color: #eee;
      }
      .vit-disponivel-bolha { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
      .vit-disponivel-bolha.off { background: #666; }

      .vit-hero-info { display: flex; flex-direction: column; justify-content: center; }
      .vit-selo { color: #c9a25f; font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
      .vit-nome { font-size: 40px; margin: 8px 0 0; line-height: 1.1; }
      .vit-nome strong { font-weight: 800; }
      .vit-nome { font-weight: 300; }
      .vit-tagline { font-family: var(--fonte-script); color: #c9a25f; font-size: 30px; margin: 10px 0 0; line-height: 1; }
      .vit-bio { color: #b8b3ac; font-size: 15px; line-height: 1.6; margin: 18px 0 0; max-width: 480px; }

      .vit-stats { display: flex; gap: 40px; margin-top: 28px; flex-wrap: wrap; }
      .vit-stat { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; color: #c9a25f; }
      .vit-stat strong { font-size: 24px; color: #fff; font-weight: 800; }
      .vit-stat span { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #9a9a9a; }

      .vit-acoes { display: flex; gap: 12px; margin-top: 28px; flex-wrap: wrap; }
      .vit-btn-primario, .vit-btn-secundario {
        display: inline-flex; align-items: center; gap: 8px; padding: 13px 22px; border-radius: 10px;
        font-size: 14px; font-weight: 700; letter-spacing: 0.03em; text-decoration: none; cursor: pointer; border: none;
      }
      .vit-btn-primario { background: linear-gradient(135deg, #d6b06f, #b8863f); color: #14100a; }
      .vit-btn-secundario { background: transparent; border: 1px solid rgba(255,255,255,0.18); color: #f2efe9; }
      .vit-btn-secundario:hover { background: rgba(255,255,255,0.06); }

      .vit-marcas-secao { max-width: 1100px; margin: 44px auto 0; padding: 0 24px; }
      .vit-marcas-cabec { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .vit-marcas-cabec h2 { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; margin: 0; }
      .vit-vazio-secao { color: #888; font-size: 14px; padding: 12px 0 24px; }

      .vit-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
      .vit-cardMarca {
        position: relative; aspect-ratio: 4/3.1; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08);
        background: #141414; cursor: pointer; padding: 0; display: block;
      }
      .vit-cardMarca img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .vit-cardMarca-logoFundo { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #1a1a1a; padding: 20%; }
      .vit-cardMarca-logoFundo img { width: 100%; height: 100%; object-fit: contain; }
      .vit-cardMarca-semImagem { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #ccc; font-weight: 700; font-size: 14px; text-align: center; padding: 12px; }
      .vit-cardMarca-nome {
        position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 10px;
        background: linear-gradient(to top, rgba(0,0,0,0.75), transparent); font-size: 12px; font-weight: 700; text-align: left; color: #fff;
      }

      .vit-faixa {
        max-width: 1100px; margin: 40px auto 0; padding: 22px 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
        border-top: 1px solid rgba(255,255,255,0.08); border-bottom: 1px solid rgba(255,255,255,0.08);
      }
      .vit-faixaItem { display: flex; align-items: center; gap: 10px; color: #c9a25f; font-size: 12px; font-weight: 700; line-height: 1.3; }
      .vit-faixaItem div { color: #d8d3ca; }

      .vit-root { padding-bottom: 64px; }
      .vit-bottom-nav {
        display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 45;
        background: #0d0d0d; border-top: 1px solid rgba(255,255,255,0.08); padding: 8px 4px calc(8px + env(safe-area-inset-bottom, 0));
      }
      .vit-nav-item {
        flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none;
        color: #8a8a8a; font-size: 11px; padding: 6px 2px; cursor: pointer;
      }
      .vit-nav-item.ativo { color: #c9a25f; }
      .vit-nav-icone { display: flex; }

      .vit-modal-fundo { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 70; padding: 16px; }
      .vit-modal {
        background: #141414; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 28px;
        width: min(400px, 100%); max-height: 88vh; overflow-y: auto; position: relative; text-align: center;
      }
      .vit-modal-fechar { position: absolute; top: 14px; right: 14px; background: none; border: none; color: #ccc; cursor: pointer; }
      .vit-modal-logo { width: 56px; height: 56px; object-fit: contain; border-radius: 10px; margin: 0 auto 10px; display: block; background: #1e1e1e; }
      .vit-modal-nome { margin: 0 0 18px; font-size: 18px; }
      .vit-modal-catalogo {
        display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px;
        padding: 12px 14px; border-radius: 10px; background: linear-gradient(135deg, #d6b06f, #b8863f);
        color: #14100a; text-decoration: none; font-size: 14px; font-weight: 700;
      }
      .vit-modal-galeria { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
      .vit-modal-galeriaItem {
        position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);
        background: #0a0a0a; padding: 0; cursor: pointer;
      }
      .vit-modal-galeriaItem img, .vit-modal-galeriaItem video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .vit-modal-galeriaPlay {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.35); color: #fff;
      }
      .vit-lightbox-fundo {
        position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 80;
        display: flex; align-items: center; justify-content: center; padding: 24px;
      }
      .vit-lightbox-fundo img, .vit-lightbox-fundo video { max-width: 100%; max-height: 90vh; border-radius: 8px; }
      .vit-lightbox-fechar { position: absolute; top: 18px; right: 18px; background: none; border: none; color: #fff; cursor: pointer; }
      .vit-modal-vazio { color: #999; font-size: 13px; }
      .vit-modal-links { display: flex; flex-direction: column; gap: 8px; }
      .vit-modal-link {
        display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 10px;
        background: rgba(255,255,255,0.05); color: #f2efe9; text-decoration: none; font-size: 14px; font-weight: 600;
      }
      .vit-modal-link:hover { background: rgba(255,255,255,0.1); }

      @media (max-width: 860px) {
        .vit-hero { padding: 20px 16px 8px; }
        .vit-hero-topo { grid-template-columns: 34% 1fr; gap: 14px; align-items: start; }
        .vit-hero-foto { aspect-ratio: 3/4; border-radius: 12px; }
        .vit-hero-fotoVazia { font-size: 36px; }
        .vit-disponivel { left: 6px; bottom: 6px; padding: 4px 8px; gap: 4px; font-size: 10px; }
        .vit-disponivel-bolha { width: 6px; height: 6px; }
        .vit-selo { font-size: 10px; }
        .vit-nome { font-size: 19px; margin-top: 4px; }
        .vit-tagline { font-size: 16px; margin-top: 6px; }
        .vit-bio { font-size: 12.5px; line-height: 1.5; margin-top: 10px; }
        .vit-stats { gap: 10px 18px; margin-top: 12px; }
        .vit-stat strong { font-size: 15px; }
        .vit-stat span { font-size: 8.5px; }
        .vit-acoes { margin-top: 16px; gap: 8px; }
        .vit-btn-primario, .vit-btn-secundario { padding: 10px 10px; font-size: 12px; flex: 1; justify-content: center; }
        .vit-grid { grid-template-columns: repeat(2, 1fr); }
        .vit-faixa { grid-template-columns: repeat(2, 1fr); }
        .vit-marcas-secao { margin-top: 28px; }
        .vit-topo { padding: 12px 16px; }
      }
    `}</style>
  )
}

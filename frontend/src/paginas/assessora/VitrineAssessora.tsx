import { useEffect, useMemo, useState } from 'react'
import {
  Search, Share2, Menu, X, Tag, Shirt, Users, Star, Gift, Megaphone, Truck,
  Headphones, Home, ShoppingBag, UserRound, User, FileText, MoreHorizontal, Globe, Phone, Play, Sparkles, ArrowLeft, MapPin,
} from 'lucide-react'
import { siInstagram, siFacebook, siTiktok, siTelegram, siWhatsapp, siGoogle } from 'simple-icons'
import { api, formataReal } from '../../api'
import { useToast } from '../../componentes/Toast'
import BotaoInstalarApp from '../../componentes/BotaoInstalarApp'

/** Logo real da rede social (simple-icons, SVG vetorial) — sempre na cor atual do texto
 *  (currentColor), pra combinar com o resto do visual dourado/monocromático da vitrine. */
function IconeMarca({ icone, size = 20 }: { icone: { path: string; title: string }; size?: number }) {
  return (
    <svg role="img" aria-label={icone.title} viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d={icone.path} />
    </svg>
  )
}

interface Midia { id: string; tipo: 'FOTO' | 'VIDEO'; url: string; ordem: number }
interface WhatsappMarca { id: string; numero: string; rotulo: string | null }
interface Marca {
  id: string; redeId: string | null; nome: string; logoUrl: string | null; bannerUrl: string | null
  fotoProdutoUrl: string | null; exibirLogo: boolean
  midias: Midia[]
  instagram: string | null; facebook: string | null; whatsapps: WhatsappMarca[]; telegram: string | null; tiktok: string | null; site: string | null
  googleEmpresas: string | null
  linkCatalogo: string | null; endereco: string | null
}
interface Depoimento { nota: number; comentario: string | null; nomeCliente: string | null; createdAt: string }
interface Lancamento {
  id: string; nome: string; fotoUrl: string | null; preco: number | null; descricao: string | null
  assessorMarca: { id: string; nome: string; linkCatalogo: string | null; whatsapps: WhatsappMarca[] }
}
interface Vitrine {
  nome: string; fotoUrl: string | null; bio: string | null; tagline: string | null; disponivel: boolean
  plano: 'BASICO' | 'AVANCADO'
  whatsapp: string | null; instagram: string | null; site: string | null
  statMarcas: number; statProdutos: number | null; statClientes: number; statAvaliacao: number | null
  totalAvaliacoes: number; depoimentos: Depoimento[]
  marcas: Marca[]
}

/** Plano AVANCADO: o PWA instalado a partir da vitrine usa a foto e o nome dela em vez do
 *  ícone/nome padrão do ZAIEZE — reforça a marca pessoal da Brand Partner pros clientes dela.
 *  Troca o <link rel="manifest"> por um gerado em memória (Blob URL, sem rota nova no backend)
 *  e o ícone/título usados pelo "Adicionar à Tela de Início" do iOS. Restaura tudo ao sair da
 *  tela, já que é uma SPA e outras rotas (login, painel) não podem herdar essa personalização. */
function usePwaPersonalizado(v: Vitrine | null) {
  useEffect(() => {
    if (!v || v.plano !== 'AVANCADO' || !v.fotoUrl) return

    const linkManifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const linkAppleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    const metaAppleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    const original = {
      manifest: linkManifest?.href ?? null,
      appleIcon: linkAppleIcon?.href ?? null,
      appleTitle: metaAppleTitle?.content ?? null,
      titulo: document.title,
    }

    const manifest = {
      name: v.nome,
      short_name: v.nome.split(' ')[0],
      start_url: `${window.location.pathname}?pwa=1`,
      scope: window.location.pathname,
      display: 'standalone',
      background_color: '#0a0a0a',
      theme_color: '#0a0a0a',
      icons: [
        { src: v.fotoUrl, sizes: '192x192', purpose: 'any' },
        { src: v.fotoUrl, sizes: '512x512', purpose: 'any' },
      ],
    }
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }))

    if (linkManifest) linkManifest.href = blobUrl
    if (linkAppleIcon) linkAppleIcon.href = v.fotoUrl
    if (metaAppleTitle) metaAppleTitle.content = v.nome
    document.title = v.nome

    return () => {
      URL.revokeObjectURL(blobUrl)
      if (linkManifest && original.manifest) linkManifest.href = original.manifest
      if (linkAppleIcon && original.appleIcon) linkAppleIcon.href = original.appleIcon
      if (metaAppleTitle && original.appleTitle) metaAppleTitle.content = original.appleTitle
      document.title = original.titulo
    }
  }, [v])
}

function linkWhatsapp(numero: string): string {
  return `https://wa.me/${numero.replace(/\D/g, '')}`
}

/** Arte abstrata de moda pra card de marca sem nenhuma imagem própria (nem foto de produto, nem
 *  banner/logo cadastrado) — determinística (mesma marca sempre cai na mesma arte), evocando
 *  texturas do universo da moda (lã, seda, veludo, linho, pedra) em vez de um cinza plano. */
const ARTE_ABSTRATA_MARCA = [
  'linear-gradient(135deg, #2a2a2a 0%, #161616 45%, #2f2a26 100%)', // lã escura
  'linear-gradient(120deg, #d8cdb8 0%, #efe8d8 35%, #cabb9d 70%, #e4dac4 100%)', // seda clara
  'linear-gradient(125deg, #2b2b2f 0%, #1a1a1d 30%, #3a3a40 55%, #17171a 100%)', // seda escura
  'linear-gradient(160deg, #4a4a4a 0%, #2e2e2e 50%, #55534f 100%)', // pedra/concreto
  'radial-gradient(120% 120% at 30% 20%, #5a2430 0%, #2c1116 60%, #1a0a0d 100%)', // veludo vinho
  'linear-gradient(135deg, #d9cdb8 0%, #c3b394 50%, #ddd2bc 100%)', // linho claro
]
function arteAbstrataMarca(nome: string): string {
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0
  return ARTE_ABSTRATA_MARCA[hash % ARTE_ABSTRATA_MARCA.length]
}

/** Botão "Ligar" usa o MESMO número do WhatsApp (não um campo separado) — só muda a ação
 *  (abre o discador do telefone via tel:, em vez do WhatsApp). */
function linkLigar(numero: string): string {
  return `tel:${numero.replace(/\D/g, '')}`
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
  const [avaliacaoAberta, setAvaliacaoAberta] = useState(false)
  const [depoimentosExpandidos, setDepoimentosExpandidos] = useState(false)
  const [todosDepoimentos, setTodosDepoimentos] = useState<Depoimento[] | null>(null)
  const [carregandoDepoimentos, setCarregandoDepoimentos] = useState(false)
  const [lancamentosAberto, setLancamentosAberto] = useState(false)
  const [lancamentos, setLancamentos] = useState<Lancamento[] | null>(null)
  const avisar = useToast()

  useEffect(() => {
    api.get(`/assessores/publico/${slug}`).then(({ data }) => setV(data)).catch(() => setErro('Página não encontrada.'))
  }, [slug])

  usePwaPersonalizado(v)

  useEffect(() => {
    if (lancamentosAberto && lancamentos === null) {
      api.get(`/assessores/publico/${slug}/lancamentos`).then(({ data }) => setLancamentos(data)).catch(() => setLancamentos([]))
    }
  }, [lancamentosAberto, lancamentos, slug])

  const marcasFiltradas = useMemo(() => {
    if (!v) return []
    const q = busca.trim().toLowerCase()
    return q ? v.marcas.filter((m) => m.nome.toLowerCase().includes(q)) : v.marcas
  }, [v, busca])

  async function verMaisDepoimentos() {
    if (todosDepoimentos === null) {
      setCarregandoDepoimentos(true)
      try {
        const { data } = await api.get(`/assessores/publico/${slug}/avaliacoes`)
        setTodosDepoimentos(data)
      } catch {
        setTodosDepoimentos(v?.depoimentos ?? [])
      } finally {
        setCarregandoDepoimentos(false)
      }
    }
    setDepoimentosExpandidos(true)
  }

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
    if (id === 'inicio') { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    if (id === 'perfil') { setAvaliacaoAberta(true); return }
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
          <BotaoInstalarApp />
          <button type="button" className="vit-icone-botao" aria-label="Compartilhar" onClick={compartilhar}><Share2 size={18} /></button>
          {v.whatsapp && (
            <a className="vit-icone-botao" aria-label="Falar no WhatsApp" href={linkWhatsapp(v.whatsapp)} target="_blank" rel="noreferrer"><IconeMarca icone={siWhatsapp} size={18} /></a>
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
              {v.statClientes > 0 && <div className="vit-stat"><Users size={20} /><strong>{v.statClientes}+</strong><span>Clientes</span></div>}
              {v.statAvaliacao != null && <div className="vit-stat"><Star size={20} /><strong>{v.statAvaliacao.toFixed(1)}</strong><span>Avaliação</span></div>}
            </div>
          </div>
        </div>

        <div className="vit-acoes">
          {v.whatsapp && <a className="vit-btn-primario" href={linkWhatsapp(v.whatsapp)} target="_blank" rel="noreferrer"><IconeMarca icone={siWhatsapp} size={18} /> WhatsApp</a>}
          {v.whatsapp && <a className="vit-btn-secundario" href={linkLigar(v.whatsapp)}><Phone size={18} /> Ligar</a>}
          <button type="button" className="vit-btn-secundario" onClick={() => setLancamentosAberto(true)}><Sparkles size={18} /> Lançamentos</button>
        </div>
      </section>

      <section className="vit-marcas-secao">
        <div className="vit-marcas-cabec">
          <h2>Marcas que represento</h2>
        </div>
        {marcasFiltradas.length === 0 && <div className="vit-vazio-secao">{v.marcas.length === 0 ? 'Nenhuma marca cadastrada ainda.' : 'Nenhuma marca encontrada.'}</div>}
        <div className="vit-grid">
          {marcasFiltradas.map((m) => {
            // Se a assessora optou por mostrar a logo (exibirLogo), o card exibe a logo contida
            // e centralizada no lugar do nome + foto de fundo — nesse modo NÃO usa a primeira foto
            // de produto da loja. Senão, prioridade do fundo: 1) primeira foto de produto da loja
            // (mais autêntico, já é do catálogo real) 2) banner cadastrado manualmente 3) arte
            // abstrata de moda (nem foto de produto nem banner). logoUrl nunca vira fundo "cover" —
            // é um recorte pequeno (geralmente com fundo branco), esticado vira uma mancha branca.
            const usaLogo = m.exibirLogo && m.logoUrl
            const imagemFundo = !usaLogo ? (m.fotoProdutoUrl || m.bannerUrl) : null
            return (
              <button
                key={m.id} type="button" className={`vit-cardMarca${usaLogo ? ' vit-cardMarca--logo' : ''}`} onClick={() => setMarcaModal(m)}
                style={imagemFundo || usaLogo ? undefined : { background: arteAbstrataMarca(m.nome) }}
              >
                {imagemFundo && <img src={imagemFundo} alt={m.nome} />}
                {usaLogo
                  ? <span className="vit-cardMarca-logo"><img src={m.logoUrl!} alt={m.nome} /></span>
                  : <span className="vit-cardMarca-nome">{m.nome}</span>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="vit-faixa">
        <div className="vit-faixaItem"><Gift size={20} /><div>Novidades<br />Exclusivas</div></div>
        <div className="vit-faixaItem"><Megaphone size={20} /><div>Condições<br />Especiais</div></div>
        <div className="vit-faixaItem"><Truck size={20} /><div>Envio Rápido<br />e Seguro</div></div>
        <div className="vit-faixaItem"><Headphones size={20} /><div>Atendimento<br />Personalizado</div></div>
      </section>

      {v.totalAvaliacoes > 0 && (
        <section className="vit-marcas-secao">
          <div className="vit-marcas-cabec">
            <h2>Avaliações</h2>
            <button type="button" className="vit-avaliar-link" onClick={() => setAvaliacaoAberta(true)}>Avaliar</button>
          </div>
          <div className="vit-avaliacoes-resumo">
            <strong>{(v.statAvaliacao ?? 0).toFixed(1)}</strong>
            <div>
              <div className="vit-estrelas">{'★'.repeat(Math.round(v.statAvaliacao ?? 0))}{'☆'.repeat(5 - Math.round(v.statAvaliacao ?? 0))}</div>
              <span>Baseado em {v.totalAvaliacoes} avaliaç{v.totalAvaliacoes === 1 ? 'ão' : 'ões'}</span>
            </div>
          </div>
          <div className="vit-depoimentos">
            {(depoimentosExpandidos ? (todosDepoimentos ?? v.depoimentos) : v.depoimentos).map((d, i) => (
              <div className="vit-depoimento" key={i}>
                <div className="vit-estrelas">{'★'.repeat(d.nota)}{'☆'.repeat(5 - d.nota)}</div>
                {d.comentario && <p>&ldquo;{d.comentario}&rdquo;</p>}
                <span>{d.nomeCliente || 'Cliente'}</span>
              </div>
            ))}
          </div>
          {!depoimentosExpandidos && v.totalAvaliacoes > v.depoimentos.length && (
            <button type="button" className="vit-avaliar-link" style={{ marginTop: 10 }} disabled={carregandoDepoimentos} onClick={verMaisDepoimentos}>
              {carregandoDepoimentos ? 'Carregando…' : `Ver mais avaliações (${v.totalAvaliacoes})`}
            </button>
          )}
          {depoimentosExpandidos && (
            <button type="button" className="vit-avaliar-link" style={{ marginTop: 10 }} onClick={() => setDepoimentosExpandidos(false)}>
              Recolher
            </button>
          )}
        </section>
      )}

      <nav className="vit-bottom-nav">
        {NAV_ITENS.map(({ id, rotulo, Icone }) => (
          <button key={id} type="button" className={`vit-nav-item${id === 'perfil' ? ' ativo' : ''}`} onClick={() => irPara(id)}>
            {/* "Perfil" (sempre ativo) usa User preenchido — silhueta sólida, como no mockup —
                em vez do UserRound de contorno fino (que tem um anel externo; preenchido viraria
                só um disco sólido sem detalhe) usado nas outras referências desse ícone. */}
            <span className="vit-nav-icone">{id === 'perfil' ? <User size={22} fill="#fff" /> : <Icone size={20} />}</span>
            {rotulo}
          </button>
        ))}
      </nav>

      {marcaModal && <ModalLinksMarca marca={marcaModal} onClose={() => setMarcaModal(null)} />}
      {avaliacaoAberta && <ModalAvaliacao slug={slug} onClose={() => setAvaliacaoAberta(false)} />}
      {lancamentosAberto && <PaginaLancamentos lancamentos={lancamentos} onClose={() => setLancamentosAberto(false)} />}
    </div>
  )
}

function ModalLinksMarca({ marca, onClose }: { marca: Marca; onClose: () => void }) {
  const [midiaAberta, setMidiaAberta] = useState<{ tipo: 'imagem' | 'video'; url: string } | null>(null)
  const [localizacao, setLocalizacao] = useState<{ lat: number; lng: number } | null>(null)
  const [localizacaoNegada, setLocalizacaoNegada] = useState(false)

  // Pede a localização do visitante (permissão nativa do navegador) só quando a marca tem
  // endereço — usada pra traçar a rota dele até a marca no mapa, em vez de só o pino da marca.
  useEffect(() => {
    if (!marca.endereco || !('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocalizacao({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocalizacaoNegada(true),
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    )
  }, [marca.endereco])

  const links: { rotulo: string; href: string; Icone: (p: { size?: number }) => JSX.Element }[] = []
  marca.whatsapps.forEach((w, i) => {
    const rotulo = w.rotulo ? `WhatsApp — ${w.rotulo}` : (marca.whatsapps.length > 1 ? `WhatsApp ${i + 1}` : 'WhatsApp')
    links.push({ rotulo, href: linkWhatsapp(w.numero), Icone: (p) => <IconeMarca icone={siWhatsapp} {...p} /> })
  })
  const instagramHref = linkPublicoSeguro(marca.instagram)
  if (instagramHref) links.push({ rotulo: 'Instagram', href: instagramHref, Icone: (p) => <IconeMarca icone={siInstagram} {...p} /> })
  const facebookHref = linkPublicoSeguro(marca.facebook)
  if (facebookHref) links.push({ rotulo: 'Facebook', href: facebookHref, Icone: (p) => <IconeMarca icone={siFacebook} {...p} /> })
  const tiktokHref = linkPublicoSeguro(marca.tiktok)
  if (tiktokHref) links.push({ rotulo: 'TikTok', href: tiktokHref, Icone: (p) => <IconeMarca icone={siTiktok} {...p} /> })
  const telegramHref = linkPublicoSeguro(marca.telegram)
  if (telegramHref) links.push({ rotulo: 'Telegram', href: telegramHref, Icone: (p) => <IconeMarca icone={siTelegram} {...p} /> })
  const siteHref = linkPublicoSeguro(marca.site)
  if (siteHref) links.push({ rotulo: 'Site', href: siteHref, Icone: (p) => <Globe {...p} /> })
  const googleEmpresasHref = linkPublicoSeguro(marca.googleEmpresas)
  if (googleEmpresasHref) links.push({ rotulo: 'Avaliações no Google', href: googleEmpresasHref, Icone: (p) => <IconeMarca icone={siGoogle} {...p} /> })
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
              <a key={`${l.rotulo}-${l.href}`} className="vit-modal-link" href={l.href} target="_blank" rel="noreferrer">
                <l.Icone size={20} /> {l.rotulo}
              </a>
            ))}
          </div>
        )}
        {marca.endereco && (
          <div className="vit-modal-endereco">
            <div className="vit-modal-endereco-texto"><MapPin size={16} /> {marca.endereco}</div>
            <iframe
              className="vit-modal-mapa"
              title={`Mapa de ${marca.nome}`}
              src={
                localizacao
                  ? `https://maps.google.com/maps?saddr=${localizacao.lat},${localizacao.lng}&daddr=${encodeURIComponent(marca.endereco)}&output=embed`
                  : `https://maps.google.com/maps?q=${encodeURIComponent(marca.endereco)}&z=17&output=embed`
              }
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            {localizacao ? (
              <div className="vit-modal-endereco-texto" style={{ fontSize: 12 }}>Rota da sua localização até a marca.</div>
            ) : localizacaoNegada ? (
              <div className="vit-modal-endereco-texto" style={{ fontSize: 12 }}>Ative a localização no navegador pra ver a rota até você.</div>
            ) : null}
            <a
              className="vit-modal-link" style={{ justifyContent: 'center' }}
              href={
                localizacao
                  ? `https://www.google.com/maps/dir/?api=1&origin=${localizacao.lat},${localizacao.lng}&destination=${encodeURIComponent(marca.endereco)}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(marca.endereco)}`
              }
              target="_blank" rel="noreferrer"
            >
              <MapPin size={18} /> Abrir no Google Maps
            </a>
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

/** Formulário público (sem login) pra cliente avaliar o atendimento — nota 1-5 + comentário
 *  curto. Nasce PENDENTE no backend; só entra na média/depoimentos depois de aprovada. */
function ModalAvaliacao({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [nota, setNota] = useState(0)
  const [notaHover, setNotaHover] = useState(0)
  const [comentario, setComentario] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar() {
    if (nota === 0) { setErro('Escolha de 1 a 5 estrelas.'); return }
    setErro(''); setEnviando(true)
    try {
      await api.post(`/assessores/publico/${slug}/avaliacao`, {
        nota, comentario: comentario.trim() || undefined, nomeCliente: nomeCliente.trim() || undefined,
      })
      setEnviado(true)
    } catch {
      setErro('Não deu pra enviar agora. Tente de novo em alguns minutos.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="vit-modal-fundo" onClick={onClose}>
      <div className="vit-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="vit-modal-fechar" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        {enviado ? (
          <>
            <h3 className="vit-modal-nome">Obrigado!</h3>
            <p className="vit-modal-vazio">Sua avaliação foi enviada e vai aparecer aqui assim que for aprovada.</p>
          </>
        ) : (
          <>
            <h3 className="vit-modal-nome">Avalie o atendimento</h3>
            <div className="vit-estrelas-input">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n} type="button" aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                  onClick={() => setNota(n)} onMouseEnter={() => setNotaHover(n)} onMouseLeave={() => setNotaHover(0)}
                >
                  {(notaHover || nota) >= n ? '★' : '☆'}
                </button>
              ))}
            </div>
            <textarea
              className="vit-avaliacao-textarea" placeholder="Conte rapidinho como foi o atendimento (opcional)"
              maxLength={400} rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)}
            />
            <input
              className="vit-avaliacao-input" placeholder="Seu nome (opcional)" maxLength={80}
              value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)}
            />
            {erro && <p className="vit-modal-vazio" style={{ color: '#e5484d' }}>{erro}</p>}
            <button type="button" className="vit-modal-catalogo" disabled={enviando} onClick={enviar} style={{ width: '100%', border: 'none' }}>
              {enviando ? 'Enviando…' : 'Enviar avaliação'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Tela cheia (não é uma rota própria — a vitrine é um app de página única) com os modelos que
 *  o Brand Partner escolheu destacar. Vem ordenada pelo backend (comissão da marca, depois mais
 *  recente) — não reordena no cliente. */
function PaginaLancamentos({ lancamentos, onClose }: { lancamentos: Lancamento[] | null; onClose: () => void }) {
  const [itemAberto, setItemAberto] = useState<Lancamento | null>(null)

  return (
    <div className="vit-pagina-fundo">
      <header className="vit-topo">
        <button type="button" className="vit-icone-botao" aria-label="Voltar" onClick={onClose}><ArrowLeft size={18} /></button>
        <strong style={{ fontSize: 15 }}>Lançamentos</strong>
        <span style={{ width: 38 }} />
      </header>

      {lancamentos === null && <div className="vit-vazio">Carregando…</div>}
      {lancamentos?.length === 0 && <div className="vit-vazio">Nenhum lançamento no momento.</div>}
      {lancamentos != null && lancamentos.length > 0 && (
        <div className="vit-lancamentos-grid">
          {lancamentos.map((l) => (
            <button key={l.id} type="button" className="vit-lancamentoCard" onClick={() => setItemAberto(l)}>
              {l.fotoUrl && <img src={l.fotoUrl} alt={l.nome} />}
              <div className="vit-lancamentoCard-info">
                <strong>{l.nome}</strong>
                <span>{l.assessorMarca.nome}</span>
                {l.preco != null && <span className="vit-lancamentoCard-preco">{formataReal(l.preco)}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {itemAberto && (
        <div className="vit-modal-fundo" onClick={() => setItemAberto(null)}>
          <div className="vit-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="vit-modal-fechar" onClick={() => setItemAberto(null)} aria-label="Fechar"><X size={18} /></button>
            {itemAberto.fotoUrl && <img className="vit-detalhe-foto" src={itemAberto.fotoUrl} alt={itemAberto.nome} />}
            <h3 className="vit-modal-nome" style={{ marginTop: 14 }}>{itemAberto.nome}</h3>
            <p className="vit-modal-vazio" style={{ marginBottom: 10 }}>{itemAberto.assessorMarca.nome}</p>
            {itemAberto.preco != null && <div className="vit-lancamentoCard-preco" style={{ fontSize: 22, marginBottom: 10 }}>{formataReal(itemAberto.preco)}</div>}
            {itemAberto.descricao && <p style={{ color: '#d8d3ca', fontSize: 14, lineHeight: 1.5 }}>{itemAberto.descricao}</p>}
            <div className="vit-modal-links">
              {itemAberto.assessorMarca.whatsapps.map((w, i) => (
                <a key={w.id} className="vit-modal-link" href={linkWhatsapp(w.numero)} target="_blank" rel="noreferrer">
                  <IconeMarca icone={siWhatsapp} />
                  Perguntar no WhatsApp{w.rotulo ? ` — ${w.rotulo}` : itemAberto.assessorMarca.whatsapps.length > 1 ? ` ${i + 1}` : ''}
                </a>
              ))}
              {linkPublicoSeguro(itemAberto.assessorMarca.linkCatalogo) && (
                <a className="vit-modal-link" href={linkPublicoSeguro(itemAberto.assessorMarca.linkCatalogo)!} target="_blank" rel="noreferrer">
                  <ShoppingBag size={20} /> Ver no catálogo da marca
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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
      .vit-hero-foto {
        position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 9/16; background: #1a1a1a;
        border: 2px solid #9a9a9a;
      }
      .vit-hero-foto img { width: 100%; height: 100%; object-fit: cover; object-position: center 25%; display: block; }
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
      .vit-bio { color: #b8b3ac; font-size: 13px; line-height: 1.6; margin: 18px 0 0; max-width: 480px; }

      .vit-stats { display: flex; gap: 40px; margin-top: 28px; flex-wrap: wrap; }
      .vit-stat { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; color: #c9a25f; }
      .vit-stat strong { font-size: 24px; color: #fff; font-weight: 800; }
      .vit-stat span { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #9a9a9a; }

      .vit-acoes { display: flex; gap: 12px; margin-top: 28px; flex-wrap: wrap; }
      .vit-btn-primario, .vit-btn-secundario {
        display: inline-flex; align-items: center; gap: 8px; padding: 13px 22px; border-radius: 6px;
        font-size: 14px; font-weight: 700; letter-spacing: 0.03em; text-decoration: none; cursor: pointer; border: none;
      }
      .vit-btn-primario { background: linear-gradient(135deg, #d6b06f, #b8863f); color: #14100a; }
      .vit-btn-secundario { background: transparent; border: 1px solid rgba(255,255,255,0.18); color: #f2efe9; }
      .vit-btn-secundario:hover { background: rgba(255,255,255,0.06); }

      .vit-marcas-secao { max-width: 1100px; margin: 44px auto 0; padding: 0 24px; }
      .vit-marcas-cabec { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .vit-marcas-cabec h2 { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; margin: 0; }
      .vit-vazio-secao { color: #888; font-size: 14px; padding: 12px 0 24px; }
      .vit-avaliar-link { background: none; border: none; color: #c9a25f; font-size: 12px; font-weight: 700; cursor: pointer; padding: 0; }

      .vit-avaliacoes-resumo { display: flex; align-items: center; gap: 16px; padding: 16px; background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; margin-bottom: 14px; }
      .vit-avaliacoes-resumo > strong { font-size: 34px; font-family: var(--leitura); }
      .vit-avaliacoes-resumo span { display: block; font-size: 12px; color: #9a9a9a; margin-top: 2px; }
      .vit-estrelas { color: #c9a25f; font-size: 15px; letter-spacing: 1px; }
      .vit-depoimentos { display: flex; flex-direction: column; gap: 10px; }
      .vit-depoimento { padding: 12px 14px; background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; }
      .vit-depoimento p { margin: 6px 0; font-size: 14px; color: #d8d3ca; line-height: 1.5; }
      .vit-depoimento span { font-size: 12px; color: #9a9a9a; font-weight: 600; }

      .vit-estrelas-input { display: flex; gap: 6px; justify-content: center; margin: 4px 0 16px; }
      .vit-estrelas-input button { background: none; border: none; color: #c9a25f; font-size: 32px; line-height: 1; cursor: pointer; padding: 2px; }
      .vit-avaliacao-textarea, .vit-avaliacao-input {
        width: 100%; background: #0a0a0a; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px;
        color: #f2efe9; padding: 10px 12px; font-size: 14px; font-family: inherit; margin-bottom: 10px; resize: vertical;
      }

      .vit-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
      /* Vitrine curada: todo card de marca leva o MESMO tratamento — imagem (ou cor determinística
         de fallback) cobrindo o card + gradiente escurecendo pra legibilidade + nome centralizado
         numa serifada editorial única (não a identidade visual de cada marca; é a "grade" da
         vitrine que fica consistente, com ou sem banner/logo cadastrado). */
      .vit-cardMarca {
        position: relative; aspect-ratio: 4/2.7; border-radius: 3px; overflow: hidden;
        background: #141414; cursor: pointer; padding: 0; display: block;
        border: none; -webkit-appearance: none; appearance: none; box-shadow: none;
      }
      .vit-cardMarca img { width: 100%; height: 100%; object-fit: cover; display: block; filter: brightness(0.72); }
      .vit-cardMarca::after {
        content: ''; position: absolute; inset: 0; z-index: 1;
        background: linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0.6) 100%);
      }
      .vit-cardMarca-nome {
        position: absolute; z-index: 2; inset: 0; padding: 10px;
        display: flex; align-items: center; justify-content: center; text-align: center;
        font-family: var(--fonte-editorial); font-size: 15px; font-weight: 600; letter-spacing: 0.09em;
        text-transform: uppercase; color: #f5f1e8; line-height: 1.3;
      }
      /* Modo "mostrar logo" (Marca.exibirLogo): sem foto de fundo, então sem o véu escurecedor —
         a logo fica contida (sem cortar), com uma margem de respiro dentro do card. */
      .vit-cardMarca--logo::after { content: none; }
      .vit-cardMarca-logo { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; padding: 16%; }
      .vit-cardMarca-logo img { width: 100%; height: 100%; object-fit: contain; }

      .vit-pagina-fundo { position: fixed; inset: 0; background: #0a0a0a; z-index: 90; overflow-y: auto; }
      .vit-lancamentos-grid { max-width: 1100px; margin: 0 auto; padding: 20px 24px 40px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
      .vit-lancamentoCard {
        display: block; text-align: left; padding: 0; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden;
        background: #141414; cursor: pointer;
      }
      .vit-lancamentoCard img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
      .vit-lancamentoCard-info { padding: 10px 12px; color: #f2efe9; }
      .vit-lancamentoCard-info strong { display: block; font-size: 13px; }
      .vit-lancamentoCard-info span { display: block; font-size: 11px; color: #9a9a9a; margin-top: 2px; }
      .vit-lancamentoCard-preco { color: #c9a25f; font-weight: 800; font-family: var(--leitura); }

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
      .vit-nav-item.ativo { color: #c9a25f; font-weight: 700; }
      .vit-nav-icone { display: flex; }
      /* Aba ativa ("Perfil") ganha um botão circular elevado, dourado — igual ao mockup —
         em vez de só mudar a cor do ícone como as outras abas. */
      .vit-nav-item.ativo .vit-nav-icone {
        width: 56px; height: 56px; margin-top: -30px; border-radius: 50%; align-items: center; justify-content: center;
        background: #c9963f; color: #fff;
        box-shadow: 0 6px 16px rgba(0,0,0,0.4), 0 0 0 4px #0d0d0d;
      }

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
      .vit-modal-endereco { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; text-align: left; }
      .vit-modal-endereco-texto {
        display: flex; align-items: flex-start; gap: 8px; color: #ccc; font-size: 13px; line-height: 1.4;
      }
      .vit-modal-endereco-texto svg { flex-shrink: 0; margin-top: 1px; color: #c9a25f; }
      .vit-modal-mapa {
        width: 100%; aspect-ratio: 16/9; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; filter: grayscale(0.2) invert(0.92) contrast(0.9);
      }

      @media (max-width: 860px) {
        .vit-hero { padding: 20px 16px 8px; }
        .vit-hero-topo { grid-template-columns: 34% 1fr; gap: 14px; align-items: start; }
        .vit-hero-foto { aspect-ratio: 9/16; border-radius: 12px; }
        .vit-hero-fotoVazia { font-size: 36px; }
        .vit-disponivel { left: 6px; bottom: 6px; padding: 4px 8px; gap: 4px; font-size: 10px; }
        .vit-disponivel-bolha { width: 6px; height: 6px; }
        .vit-selo { font-size: 10px; }
        .vit-nome { font-size: 19px; margin-top: 4px; }
        .vit-tagline { font-size: 16px; margin-top: 6px; }
        .vit-bio { font-size: 11px; line-height: 1.5; margin-top: 10px; }
        .vit-stats { gap: 10px 18px; margin-top: 12px; }
        .vit-stat strong { font-size: 15px; }
        .vit-stat span { font-size: 8.5px; }
        /* Os 3 botões crescem pra preencher a linha toda (flex-grow), mas com base "auto" (não
           "0%" — evitar o atalho "flex: 1"): o navegador calcula a largura de cada um pelo
           próprio conteúdo primeiro, e só distribui o espaço QUE SOBRAR depois. Com "flex: 1"
           (base 0%) o cálculo começa do zero pra cada botão, e o min-width:auto padrão do
           flexbox não deixa o texto de "Lançamentos" (o mais longo) encolher abaixo do próprio
           conteúdo — isso forçava a quebra de linha em telas estreitas. Com base "auto" nunca
           precisa encolher abaixo do conteúdo (só distribui sobra), e ainda preenche telas largas. */
        .vit-acoes { gap: 6px; margin-top: 10px; }
        .vit-btn-primario, .vit-btn-secundario { padding: 10px 8px; font-size: 11px; gap: 5px; white-space: nowrap; }
        /* WhatsApp alinhado com a largura da coluna da foto (34%, mesma fração do
           .vit-hero-topo) — "0 1 34%" nunca CRESCE além disso (grow:0), só encolhe se precisar
           (shrink:1), sem o bug do "flex:1" (base 0%) que afetava Ligar/Lançamentos abaixo. */
        .vit-btn-primario { flex: 0 1 34%; }
        .vit-btn-secundario { flex: 1 1 auto; }
        .vit-btn-primario svg, .vit-btn-secundario svg { width: 15px; height: 15px; flex-shrink: 0; }
        .vit-grid { grid-template-columns: repeat(4, 1fr); gap: 7px; }
        .vit-lancamentos-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 16px 16px 32px; }
        .vit-cardMarca-nome { padding: 6px; font-size: 10px; letter-spacing: 0.06em; line-height: 1.25; }
        .vit-faixa { grid-template-columns: repeat(2, 1fr); }
        .vit-marcas-secao { margin-top: 28px; padding: 0 16px; }
        .vit-topo { padding: 12px 16px; }
      }
    `}</style>
  )
}

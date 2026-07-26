import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CalendarClock, CreditCard, FileText, Gem, Heart, Headphones, Home, LayoutGrid, MessageCircle, MoreHorizontal, Plus, Search,
  RotateCcw, Share2, ShieldCheck, Shirt, ShoppingBag, SlidersHorizontal, Sparkles, Star, Truck, User, UserRound, Wallet, X,
} from 'lucide-react'
import { api } from '../../api'
import { HOST } from '../../host'
import AgenteLoja from './AgenteLoja'
import MeusPedidos from './MeusPedidos'
import { useMetaTags } from '../../lib/useMetaTags'
import { useToast } from '../../componentes/Toast'
import { lerSessaoSalva } from '../../lib/sessaoCliente'

// Mesmo rodapé de navegação da PerfilVendedora.tsx — aqui "Catálogo" é sempre o item ativo
// (esta página É a vitrine); "Início"/"Perfil" levam de volta pro perfil da vendedora.
const NAV_ITENS = [
  { id: 'inicio', rotulo: 'Início', Icone: Home },
  { id: 'catalogo', rotulo: 'Catálogo', Icone: ShoppingBag },
  { id: 'perfil', rotulo: 'Perfil', Icone: UserRound },
  { id: 'pedidos', rotulo: 'Pedidos', Icone: FileText },
  { id: 'mais', rotulo: 'Mais', Icone: MoreHorizontal },
] as const

/** Sem acento/caixa — "Vestido Luná" casa com a busca "vestido luna". */
function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

interface Variacao { cor: string; estampa: string; tamanho: string; estoque: number }
interface Produto {
  id: string; nome: string; descricao?: string | null; referencia?: string | null
  genero: string; pesoGramas?: number | null; loteMinimo: number
  preco: number; precoVarejo: number; precoAtacado: number | null
  outlet?: boolean; descontoPct?: number | null; precoOriginal?: number | null
  fotos: string[]; fotosPorCor?: Record<string, string[]>; videos: string[]; categoria: string | null
  cores: string[]; estampas: string[]; tamanhos: string[]; variacoes: Variacao[]; disponivel: boolean
  destaque: boolean; destaqueEspecial: boolean; createdAt: string
}
interface Colecao { id: string; nome: string; descricao?: string | null; outlet?: boolean; produtos: Produto[] }
interface Catalogo {
  marca: {
    nome: string; logoUrl: string | null; bannerUrl: string | null; descricaoPublica: string | null; corPrimaria: string; corSecundaria: string
    parcelasMax: number; parcelasFormaPagamento: string | null; parcelasMinPecas: number; parcelasMinValor: number
    entregaPrazoTexto: string | null; entregaFreteGratisValor: number | null; entregaTexto: string | null
    devolucaoPrazoDias: number; devolucaoTexto: string | null
  }
  loja: { nome: string }
  vendedora: { nome: string; primeiroNome: string; fotoUrl: string | null; bio: string | null; temWhatsapp: boolean }
  pedidoMinimoAtacado?: number
  colecoes: Colecao[]
}
type RegrasNegocio = Catalogo['marca']

type Modo = 'ATACADO' | 'VAREJO'
interface ItemCarrinho {
  chave: string; produtoId: string; nome: string; cor: string; estampa: string; tamanho: string
  modo: Modo; precoUnit: number; economiaUnit: number; qtd: number; loteMinimo: number
  pesoGramas: number; estoque: number; foto?: string
}
// Snapshot do carrinho enviado no /lead — pra vendedora ver o pedido formatado no card do Funil.
export interface ItemPedido {
  produtoId: string; nome: string; fotoUrl?: string | null
  cor?: string; estampa?: string; tamanho?: string; modo: Modo; precoUnit: number; qtd: number
}

const real = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
/** "6x de R$ X" — só ilustrativo (não há gateway de cartão aqui, a compra fecha pelo WhatsApp),
 *  por isso o número de parcelas é configurado pelo gestor (Rede.parcelasMax) e pode ficar em 1
 *  (não exibe nada) pra quem não quiser passar essa impressão. */
function textoParcela(preco: number, parcelasMax: number): string | null {
  if (parcelasMax <= 1) return null
  return `${parcelasMax}x de ${real(preco / parcelasMax)}`
}
const PESO_PADRAO = 300 // g por peça quando o produto não tem peso cadastrado
const VOLUME_PECA_L = 0.8 // litros estimados por peça dobrada
const LANCAMENTO_DIAS = 30 // produto criado há até esse tanto de dias conta como "Lançamento"
const LANCAMENTOS = '__lancamentos__' // valor sentinela do filtro (não é uma categoria de verdade)
const FAVORITOS = '__favoritos__' // idem, acionado pelo ícone de coração (card) e pelo atalho do cabeçalho

/** Favoritos são só do navegador (sem conta de cliente) — uma lista por vendedora/loja. */
function chaveFavoritos(redeSlug: string, vendSlug: string): string {
  return `zaieze_favoritos_${redeSlug}_${vendSlug}`
}

export default function Catalogo() {
  const { vendSlug } = useParams<{ vendSlug: string }>()
  const redeSlug = HOST.slug
  const navigate = useNavigate()
  const avisar = useToast()
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [erro, setErro] = useState('')
  const [detalhe, setDetalhe] = useState<Produto | null>(null)
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [verCarrinho, setVerCarrinho] = useState(false)
  const [agente, setAgente] = useState<{ produtoId?: string; produtoNome?: string; resumo?: string; itens?: ItemPedido[] } | null>(null)
  const [busca, setBusca] = useState('')
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null) // null = "Todos"
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set())
  // Token do cliente verificado por WhatsApp (mesma sessão do MeusPedidos) — presente = favoritos
  // sincronizam com o Cliente no servidor; ausente = ficam só no localStorage deste aparelho.
  const [tokenCliente, setTokenCliente] = useState<string | null>(null)
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [meusPedidosAberto, setMeusPedidosAberto] = useState<'abertos' | 'fechados' | null>(null)

  function irPara(id: (typeof NAV_ITENS)[number]['id']) {
    setDrawerAberto(false)
    if (id === 'inicio' || id === 'perfil') { navigate(`/${vendSlug}`); return }
    if (id === 'catalogo') { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    if (id === 'pedidos') { setMeusPedidosAberto('fechados'); return }
    setDrawerAberto(true)
  }

  function salvarFavoritosLocal(novo: Set<string>) {
    if (!redeSlug || !vendSlug) return
    try { localStorage.setItem(chaveFavoritos(redeSlug, vendSlug), JSON.stringify([...novo])) } catch { /* ignora */ }
  }

  // Carrega os favoritos salvos no navegador assim que sabe de qual loja/vendedora se trata; se
  // o cliente já verificou o WhatsApp antes (sessão salva), sincroniza com o servidor também.
  useEffect(() => {
    if (!redeSlug || !vendSlug) return
    try {
      const salvos = localStorage.getItem(chaveFavoritos(redeSlug, vendSlug))
      if (salvos) setFavoritos(new Set(JSON.parse(salvos)))
    } catch { /* localStorage indisponível (modo privado etc.) — segue sem favoritos salvos */ }

    const sessao = lerSessaoSalva()
    if (sessao) sincronizarFavoritos(sessao.token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redeSlug, vendSlug])

  // Chamado ao abrir a vitrine já com sessão salva, ou assim que o MeusPedidos confirma o
  // código — busca o que já tinha no servidor, mescla com o que já tinha no aparelho (nenhum
  // dos dois lados perde favorito) e devolve a união pro servidor, se precisar.
  async function sincronizarFavoritos(token: string) {
    if (!redeSlug || !vendSlug) return
    setTokenCliente(token)
    try {
      const { data } = await api.post(`/catalogo/publico/${redeSlug}/${vendSlug}/favoritos/buscar`, { token })
      const doServidor: string[] = data.favoritos ?? []
      setFavoritos((atual) => {
        const uniao = new Set([...atual, ...doServidor])
        salvarFavoritosLocal(uniao)
        if (uniao.size !== doServidor.length) {
          api.post(`/catalogo/publico/${redeSlug}/${vendSlug}/favoritos`, { token, favoritos: [...uniao] }).catch(() => {})
        }
        return uniao
      })
    } catch { /* token expirado ou erro de rede — favoritos seguem só no aparelho por ora */ }
  }

  function alternarFavorito(id: string, e: React.SyntheticEvent) {
    e.stopPropagation() // o coração fica dentro do card clicável (abre o detalhe do produto)
    setFavoritos((atual) => {
      const novo = new Set(atual)
      novo.has(id) ? novo.delete(id) : novo.add(id)
      salvarFavoritosLocal(novo)
      if (tokenCliente && redeSlug && vendSlug) {
        api.post(`/catalogo/publico/${redeSlug}/${vendSlug}/favoritos`, { token: tokenCliente, favoritos: [...novo] }).catch(() => {})
      }
      return novo
    })
  }

  function compartilharProduto(p: Produto) {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}`
    if (navigator.share) {
      navigator.share({ title: p.nome, text: `Olha essa peça: ${p.nome}`, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url)
      avisar('Link copiado.')
    }
  }

  // Grade única: sem separação visual por coleção — o cliente vê tudo liberado, uma vitrine só.
  const produtosTodos = useMemo(() => (cat?.colecoes ?? []).flatMap((c) => c.produtos), [cat])

  // Categorias de verdade (da taxonomia já cadastrada) + "Lançamentos" fixo — sem inventar
  // campo novo: usa a data de criação da peça, que já existe no cadastro.
  const categorias = useMemo(
    () => [...new Set(produtosTodos.map((p) => p.categoria).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [produtosTodos])
  const ehLancamento = (p: Produto) => Date.now() - new Date(p.createdAt).getTime() <= LANCAMENTO_DIAS * 86_400_000

  // Busca (nome/referência/categoria) + categoria/lançamentos selecionados — os dois filtros somam.
  const buscaNorm = normalizarBusca(busca)
  const produtosFiltrados = useMemo(() => {
    let lista = produtosTodos
    if (categoriaAtiva === LANCAMENTOS) lista = lista.filter(ehLancamento)
    else if (categoriaAtiva === FAVORITOS) lista = lista.filter((p) => favoritos.has(p.id))
    else if (categoriaAtiva) lista = lista.filter((p) => p.categoria === categoriaAtiva)
    if (buscaNorm) {
      lista = lista.filter((p) =>
        normalizarBusca(p.nome).includes(buscaNorm)
        || normalizarBusca(p.referencia ?? '').includes(buscaNorm)
        || normalizarBusca(p.categoria ?? '').includes(buscaNorm))
    }
    return lista
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtosTodos, buscaNorm, categoriaAtiva, favoritos])

  // Produtos que giram no carrossel do topo: todos os "destaqueEspecial"; sem nenhum marcado,
  // cai nos "destaque" comuns. Some durante uma busca ativa — não faz sentido puxar atenção pro
  // carrossel enquanto o cliente está procurando outra coisa.
  const produtosDestaque = useMemo(() => {
    if (buscaNorm) return []
    const especiais = produtosTodos.filter((p) => p.destaqueEspecial)
    return especiais.length > 0 ? especiais : produtosTodos.filter((p) => p.destaque)
  }, [produtosTodos, buscaNorm])

  const [heroIdx, setHeroIdx] = useState(0)
  useEffect(() => { setHeroIdx(0) }, [produtosDestaque])
  // Gira sozinho a cada 6s — pausa não é necessário, o clique num ponto já reinicia a contagem.
  useEffect(() => {
    if (produtosDestaque.length < 2) return
    const t = setInterval(() => setHeroIdx((i) => (i + 1) % produtosDestaque.length), 6000)
    return () => clearInterval(t)
  }, [produtosDestaque, heroIdx])
  const produtoDestaque = produtosDestaque[heroIdx] ?? null

  useEffect(() => {
    if (!redeSlug || !vendSlug) { setErro('Catálogo não encontrado.'); return }
    api.get(`/catalogo/publico/${redeSlug}/${vendSlug}`)
      .then(({ data }) => setCat(data))
      .catch(() => setErro('Este catálogo não está disponível.'))
  }, [redeSlug, vendSlug])

  const descricaoLoja = cat?.marca.descricaoPublica
    || (cat ? `Catálogo de ${cat.marca.nome} — moda direto da vendedora ${cat.vendedora.primeiroNome} pelo WhatsApp.` : '')
  useMetaTags({
    titulo: cat ? `${cat.vendedora.nome} | ${cat.marca.nome}` : 'Catálogo',
    descricao: descricaoLoja,
    imagem: cat?.marca.logoUrl ?? undefined,
    jsonLd: cat ? {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: `${cat.marca.nome} — ${cat.vendedora.nome}`,
      description: descricaoLoja,
      image: cat.marca.logoUrl ?? undefined,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    } : undefined,
  })

  // Botão "+" do card: só adiciona direto quando não há ambiguidade de variação (uma única
  // combinação de cor/tamanho com estoque) — havendo escolha de verdade, abre o detalhe normal
  // pra não arriscar mandar o tamanho errado pra vendedora.
  function adicionarRapido(p: Produto, e: React.SyntheticEvent) {
    e.stopPropagation()
    const disponiveis = p.variacoes.filter((v) => v.estoque > 0)
    const cores = new Set(disponiveis.map((v) => v.cor))
    const tamanhos = new Set(disponiveis.map((v) => v.tamanho))
    if (disponiveis.length === 0 || cores.size !== 1 || tamanhos.size !== 1) { setDetalhe(p); return }
    const v = disponiveis[0]
    adicionar({
      chave: `${p.id}|${v.cor}|${v.estampa}|${v.tamanho}|VAREJO`,
      produtoId: p.id, nome: p.nome, cor: v.cor, estampa: v.estampa, tamanho: v.tamanho, modo: 'VAREJO',
      precoUnit: p.precoVarejo, economiaUnit: p.precoOriginal ? Math.max(0, p.precoOriginal - p.precoVarejo) : 0,
      qtd: 1, loteMinimo: p.loteMinimo, pesoGramas: p.pesoGramas || PESO_PADRAO, estoque: v.estoque, foto: p.fotos?.[0],
    })
  }

  function adicionar(item: ItemCarrinho) {
    setCarrinho((cur) => {
      const i = cur.findIndex((x) => x.chave === item.chave)
      if (i >= 0) {
        const copia = [...cur]
        copia[i] = { ...copia[i], qtd: Math.min(copia[i].estoque, copia[i].qtd + item.qtd) }
        return copia
      }
      return [...cur, item]
    })
    setDetalhe(null)
    setVerCarrinho(true)
  }
  function mudarQtd(chave: string, delta: number) {
    setCarrinho((cur) => cur.map((x) => {
      if (x.chave !== chave) return x
      const passo = x.modo === 'ATACADO' ? x.loteMinimo : 1
      const min = passo
      let q = x.qtd + delta * passo
      q = Math.max(min, Math.min(x.estoque - (x.estoque % passo), q))
      return { ...x, qtd: q }
    }))
  }
  const remover = (chave: string) => setCarrinho((cur) => cur.filter((x) => x.chave !== chave))

  const totais = useMemo(() => {
    const pecas = carrinho.reduce((s, x) => s + x.qtd, 0)
    const subtotal = carrinho.reduce((s, x) => s + x.precoUnit * x.qtd, 0)
    const economia = carrinho.reduce((s, x) => s + x.economiaUnit * x.qtd, 0)
    const pesoKg = carrinho.reduce((s, x) => s + (x.pesoGramas || PESO_PADRAO) * x.qtd, 0) / 1000
    const volumeL = pecas * VOLUME_PECA_L
    return { pecas, subtotal, economia, pesoKg, volumeL }
  }, [carrinho])

  function finalizar() {
    const linhas = carrinho.map((x) =>
      `• ${x.qtd}x ${x.nome} (${[x.cor, x.estampa, x.tamanho].filter(Boolean).join(' / ')}) — ${x.modo === 'ATACADO' ? 'Atacado' : 'Varejo'} ${real(x.precoUnit)} = ${real(x.precoUnit * x.qtd)}`)
    const resumo = [
      '🛒 *Pedido pelo catálogo*',
      ...linhas,
      '',
      `Peças: ${totais.pecas}`,
      `Subtotal: ${real(totais.subtotal)}`,
      totais.economia > 0 ? `Economia: ${real(totais.economia)}` : '',
      `Peso estimado: ${totais.pesoKg.toFixed(2)} kg`,
    ].filter(Boolean).join('\n')
    const itens: ItemPedido[] = carrinho.map((x) => ({
      produtoId: x.produtoId, nome: x.nome, fotoUrl: x.foto ?? null,
      cor: x.cor || undefined, estampa: x.estampa || undefined, tamanho: x.tamanho || undefined,
      modo: x.modo, precoUnit: x.precoUnit, qtd: x.qtd,
    }))
    setVerCarrinho(false)
    setAgente({ resumo, itens })
  }

  if (erro) return <div className="cat-vazio">{erro}</div>
  if (!cat) return <div className="cat-vazio">Carregando…</div>

  const primaria = cat.marca.corPrimaria || '#111111'
  const fundo = cat.marca.corSecundaria || '#ffffff'

  return (
    <div className="cat-root" style={{ '--cat-primaria': primaria, '--cat-fundo': fundo } as CSSProperties}>
      <CatalogoEstilos />

      <header className="cat-topo">
        <div className="cat-topo-marca">
          {cat.marca.logoUrl
            ? <img src={cat.marca.logoUrl} alt={cat.marca.nome} />
            : <span className="cat-topo-marca-nome">{cat.marca.nome}</span>}
          <span className="cat-topo-marca-sub">Catálogo</span>
        </div>

        <label className="cat-busca">
          <input
            type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produtos ou coleções"
          />
          <Search size={18} />
        </label>

        <div className="cat-topo-acoes">
          <button type="button" className="cat-topo-icone" aria-label="Carrinho" onClick={() => setVerCarrinho(true)}>
            <ShoppingBag size={20} />
            {totais.pecas > 0 && <span className="cat-topo-selo">{totais.pecas}</span>}
          </button>
        </div>
      </header>

      {drawerAberto && (
        <div className="cat-drawer-fundo" onClick={() => setDrawerAberto(false)}>
          <nav className="cat-drawer" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cat-drawer-fechar" onClick={() => setDrawerAberto(false)} aria-label="Fechar"><X size={18} /></button>
            {NAV_ITENS.map(({ id, rotulo, Icone }) => (
              <button key={id} type="button" className="cat-drawer-item" onClick={() => irPara(id)}>
                <Icone size={18} /> {rotulo}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Trilho de categorias em ícone circular — vem antes do hero, como na referência */}
      <div className="cat-categorias">
        <button type="button" className={`cat-cat-item${categoriaAtiva === null ? ' ativo' : ''}`} onClick={() => setCategoriaAtiva(null)}>
          <span className="cat-cat-icone"><LayoutGrid size={22} /></span>
          <span className="cat-cat-rotulo">Todos</span>
        </button>
        <button type="button" className={`cat-cat-item${categoriaAtiva === LANCAMENTOS ? ' ativo' : ''}`} onClick={() => setCategoriaAtiva(LANCAMENTOS)}>
          <span className="cat-cat-icone"><Star size={22} /></span>
          <span className="cat-cat-rotulo">Lançamentos</span>
        </button>
        {categorias.map((c) => (
          <button key={c} type="button" className={`cat-cat-item${categoriaAtiva === c ? ' ativo' : ''}`} onClick={() => setCategoriaAtiva(c)}>
            <span className="cat-cat-icone"><Shirt size={22} /></span>
            <span className="cat-cat-rotulo">{c}</span>
          </button>
        ))}
        <button
          type="button" className={`cat-cat-item${categoriaAtiva === FAVORITOS ? ' ativo' : ''}`}
          onClick={() => setCategoriaAtiva((c) => (c === FAVORITOS ? null : FAVORITOS))}
        >
          <span className="cat-cat-icone"><Heart size={22} fill={categoriaAtiva === FAVORITOS ? 'currentColor' : 'none'} /></span>
          <span className="cat-cat-rotulo">Favoritos</span>
        </button>
        <button type="button" className="cat-cat-item" onClick={() => avisar('Filtros avançados chegando em breve. ✨')}>
          <span className="cat-cat-icone"><SlidersHorizontal size={22} /></span>
          <span className="cat-cat-rotulo">Filtrar</span>
        </button>
      </div>

      {produtoDestaque && (
        <section className="cat-hero">
          <div className="cat-hero-texto">
            <span className="cat-hero-selo">{produtoDestaque.destaqueEspecial ? 'Destaque' : 'Novidade'}</span>
            <h1 className="cat-hero-titulo">{produtoDestaque.nome}</h1>
            {produtoDestaque.descricao && <p className="cat-hero-desc">{produtoDestaque.descricao}</p>}
            <button type="button" className="cat-hero-btn" onClick={() => setDetalhe(produtoDestaque)}>Ver detalhes →</button>
            {produtosDestaque.length > 1 && (
              <div className="cat-hero-dots">
                {produtosDestaque.map((p, i) => (
                  <button
                    key={p.id} type="button" aria-label={`Ver ${p.nome}`}
                    className={i === heroIdx ? 'ativo' : ''} onClick={() => setHeroIdx(i)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="cat-hero-foto-wrap">
            <button type="button" className="cat-hero-foto" onClick={() => setDetalhe(produtoDestaque)}>
              {produtoDestaque.fotos?.[0]
                ? <img key={produtoDestaque.id} src={produtoDestaque.fotos[0]} alt={produtoDestaque.nome} />
                : <div className="cat-foto-vazia">{produtoDestaque.nome}</div>}
            </button>
            <div className="cat-hero-acoes-flut">
              <button
                type="button" className={`cat-hero-acao-flut${favoritos.has(produtoDestaque.id) ? ' ativo' : ''}`}
                aria-label="Favoritar" onClick={(e) => alternarFavorito(produtoDestaque.id, e)}
              >
                <Heart size={18} fill={favoritos.has(produtoDestaque.id) ? 'currentColor' : 'none'} />
              </button>
              <button type="button" className="cat-hero-acao-flut" aria-label="Compartilhar" onClick={() => compartilharProduto(produtoDestaque)}>
                <Share2 size={18} />
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="cat-selos">
        <div className="cat-selo"><ShieldCheck size={18} /><span>Compre com<br />segurança</span></div>
        <div className="cat-selo"><CalendarClock size={18} /><span>Atualizações<br />diárias</span></div>
        <div className="cat-selo"><Gem size={18} /><span>Peças exclusivas<br />e limitadas</span></div>
        <div className="cat-selo"><Headphones size={18} /><span>Atendimento<br />humano</span></div>
      </div>

      {produtosTodos.length === 0 && <div className="cat-vazio">Em breve, novidades por aqui. ✨</div>}
      {produtosTodos.length > 0 && produtosFiltrados.length === 0 && (
        <div className="cat-vazio">
          {busca ? `Nenhum produto encontrado para "${busca}".`
            : categoriaAtiva === FAVORITOS ? 'Você ainda não favoritou nenhuma peça. ♡'
            : 'Nenhum produto nessa categoria ainda.'}
        </div>
      )}

      {produtosFiltrados.length > 0 && (
        <section className="cat-secao">
          <div className="cat-secao-cabec">
            <h2 className="cat-secao-titulo">Destaques para você</h2>
            {(busca || categoriaAtiva) && (
              <button type="button" className="cat-secao-link" onClick={() => { setBusca(''); setCategoriaAtiva(null) }}>
                Ver todos →
              </button>
            )}
          </div>
          <div className="cat-grid">
            {produtosFiltrados.map((p) => {
              // No card só dá pra respeitar o valor mínimo (1 peça) — mínimo de peças da compra
              // é condição do PEDIDO inteiro, cabe mostrar no carrinho/detalhe, não aqui.
              const parcela = cat.marca.parcelasMinPecas <= 1 && p.preco >= cat.marca.parcelasMinValor
                ? textoParcela(p.preco, cat.marca.parcelasMax)
                : null
              return (
                <button key={p.id} className="cat-card" onClick={() => setDetalhe(p)}>
                  <div className="cat-foto">
                    {p.fotos?.[0]
                      ? <img src={p.fotos[0]} alt={p.nome} loading="lazy" />
                      : <div className="cat-foto-vazia">{p.nome}</div>}
                    {p.destaque && <span className="cat-destaque-badge">Destaque</span>}
                    {p.videos?.length > 0 && <span className="cat-video-badge">▶ vídeo</span>}
                    {!p.disponivel && <span className="cat-esgotado">esgotado</span>}
                    {p.descontoPct ? <span className="cat-desconto">−{p.descontoPct}%</span> : null}
                    <span
                      role="button" tabIndex={0} aria-label={favoritos.has(p.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      className={`cat-favorito${favoritos.has(p.id) ? ' ativo' : ''}`}
                      onClick={(e) => alternarFavorito(p.id, e)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternarFavorito(p.id, e) } }}
                    >
                      <Heart size={16} fill={favoritos.has(p.id) ? 'currentColor' : 'none'} />
                    </span>
                  </div>
                  <div className="cat-info">
                    <div className="cat-nome">{p.nome}</div>
                    <div className="cat-preco">
                      {p.precoOriginal ? <span className="cat-preco-antigo">{real(p.precoOriginal)}</span> : null}
                      <span className={p.descontoPct ? 'cat-preco-promo' : ''}>{real(p.preco)}</span>
                    </div>
                    {parcela && <div className="cat-parcela">{parcela}</div>}
                    <div className="cat-card-rodape">
                      {p.tamanhos.length > 0 && (
                        <div className="cat-tam-chips">
                          {p.tamanhos.slice(0, 4).map((t) => <span key={t}>{t}</span>)}
                        </div>
                      )}
                      {p.disponivel && (
                        <span
                          role="button" tabIndex={0} aria-label={`Adicionar ${p.nome} ao carrinho`}
                          className="cat-add-rapido" onClick={(e) => adicionarRapido(p, e)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); adicionarRapido(p, e) } }}
                        >
                          <Plus size={16} />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Vitrine de peças com foto — "Monte seu look" precisa de pelo menos 3 pra fazer sentido */}
      {produtosTodos.filter((p) => p.fotos?.[0]).length >= 3 && (
        <div className="cat-look-banner">
          <div className="cat-look-texto">
            <strong>Monte seu look<br />e ganhe desconto!</strong>
            <p>Compre 3 ou mais peças e ganhe até 20% OFF</p>
            <button type="button" className="cat-look-btn" onClick={() => avisar('Montador de looks chegando em breve. ✨')}>
              <CalendarClock size={16} /> Montar look
            </button>
          </div>
          <div className="cat-look-fotos">
            {produtosTodos.filter((p) => p.fotos?.[0]).slice(0, 3).map((p, i) => (
              <span key={p.id} className="cat-look-foto-item">
                <img src={p.fotos[0]} alt={p.nome} />
                {i < 2 && <span className="cat-look-mais">+</span>}
              </span>
            ))}
            <span className="cat-look-desconto">20%<br />OFF</span>
          </div>
        </div>
      )}

      <div className="cat-selos cat-selos-compactos">
        <div className="cat-selo"><Wallet size={18} /><span><strong>PIX</strong><br />Aprovação na hora</span></div>
        <div className="cat-selo"><ShieldCheck size={18} /><span><strong>Compra segura</strong><br />Seus dados protegidos</span></div>
        <div className="cat-selo"><MessageCircle size={18} /><span><strong>Atendimento</strong><br />Fale pelo WhatsApp</span></div>
        <div className="cat-selo"><Sparkles size={18} /><span><strong>Novidades</strong><br />Peças novas toda semana</span></div>
      </div>

      {/* CTA "Falar com a vendedora" — no fluxo da página, entre a grade e o rodapé (não flutua mais) */}
      <div className="cat-fala-wrap">
        <button type="button" className="cat-fala-cta" onClick={() => setAgente({})}>💬 Falar com {cat.vendedora.primeiroNome}</button>
      </div>

      {detalhe && <DetalheProduto produto={detalhe} regras={cat.marca} onFechar={() => setDetalhe(null)} onAdicionar={adicionar} />}

      {/* Carrinho flutuante */}
      {carrinho.length > 0 && !verCarrinho && (
        <button className="cat-cart-fab" onClick={() => setVerCarrinho(true)}>
          🛒 {totais.pecas} · {real(totais.subtotal)}
        </button>
      )}
      {verCarrinho && (
        <Carrinho itens={carrinho} totais={totais} corPrimaria={primaria} vendedora={cat.vendedora.primeiroNome}
          onMudarQtd={mudarQtd} onRemover={remover} onFechar={() => setVerCarrinho(false)} onFinalizar={finalizar} />
      )}

      {agente && (
        <AgenteLoja
          redeSlug={redeSlug!} vendSlug={vendSlug!}
          marcaNome={cat.marca.nome} vendedora={cat.vendedora.primeiroNome}
          pedidoMinimoAtacado={cat.pedidoMinimoAtacado}
          produtoId={agente.produtoId} produtoNome={agente.produtoNome} resumoInicial={agente.resumo}
          itensCarrinho={agente.itens}
          onClose={() => setAgente(null)}
        />
      )}

      <footer className="cat-rodape">{cat.marca.nome} · powered by ZAIEZE</footer>

      {/* Mesmo rodapé de navegação da PerfilVendedora.tsx — "Perfil" é sempre o item em destaque
          (bolinha brilhante), em qualquer página, não é um indicador de "página atual". */}
      <nav className="cat-bottom-nav">
        {NAV_ITENS.map(({ id, rotulo, Icone }) => (
          <button key={id} type="button" className={`cat-nav-item${id === 'perfil' ? ' ativo' : ''}`} onClick={() => irPara(id)}>
            <span className="cat-nav-icone">
              {id === 'perfil' ? (
                <>
                  <User size={18} fill="#fff" />
                  <span className="cat-nav-icone-rotulo">{rotulo}</span>
                </>
              ) : (
                <Icone size={20} />
              )}
            </span>
            {id !== 'perfil' && rotulo}
          </button>
        ))}
      </nav>

      {meusPedidosAberto && (
        <MeusPedidos
          redeSlug={redeSlug!} vendSlug={vendSlug!} abaInicial={meusPedidosAberto} acento={primaria}
          onClose={() => setMeusPedidosAberto(null)} aoVerificar={sincronizarFavoritos}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Detalhe da peça (galeria + zoom + compra) ───────────────────────────
function DetalheProduto({ produto, regras, onFechar, onAdicionar }: {
  produto: Produto; regras: RegrasNegocio; onFechar: () => void; onAdicionar: (i: ItemCarrinho) => void
}) {
  const [fotoIdx, setFotoIdx] = useState(0)
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  const [cor, setCor] = useState(produto.cores[0] ?? '')
  const estampasDaCor = useMemo(
    () => [...new Set(produto.variacoes.filter((v) => v.cor === cor && v.estampa).map((v) => v.estampa))],
    [produto.variacoes, cor])
  const [estampa, setEstampa] = useState(estampasDaCor[0] ?? '')
  const [tamanho, setTamanho] = useState('')
  const [modo, setModo] = useState<Modo>(produto.precoAtacado != null ? 'ATACADO' : 'VAREJO')
  const [qtd, setQtd] = useState(produto.precoAtacado != null ? produto.loteMinimo : 1)

  useEffect(() => { setEstampa(estampasDaCor[0] ?? ''); setTamanho(''); setFotoIdx(0) }, [cor, estampasDaCor])
  useEffect(() => { setQtd(modo === 'ATACADO' ? produto.loteMinimo : 1) }, [modo, produto.loteMinimo])

  // Tamanhos disponíveis para a cor/estampa escolhida, com estoque.
  const tamanhos = useMemo(() => produto.variacoes
    .filter((v) => v.cor === cor && v.estampa === estampa)
    .map((v) => ({ tamanho: v.tamanho, estoque: v.estoque })), [produto.variacoes, cor, estampa])
  const variacaoSel = tamanhos.find((t) => t.tamanho === tamanho)
  const estoqueSel = variacaoSel?.estoque ?? 0

  const passo = modo === 'ATACADO' ? produto.loteMinimo : 1
  const precoUnit = modo === 'ATACADO' ? (produto.precoAtacado ?? produto.precoVarejo) : produto.precoVarejo
  const economiaUnit = modo === 'ATACADO'
    ? Math.max(0, produto.precoVarejo - (produto.precoAtacado ?? produto.precoVarejo))
    : (produto.precoOriginal ? Math.max(0, produto.precoOriginal - produto.precoVarejo) : 0)

  function mais() { setQtd((q) => Math.min(estoqueSel - (estoqueSel % passo), q + passo)) }
  function menos() { setQtd((q) => Math.max(passo, q - passo)) }

  const podeAdicionar = !!tamanho && estoqueSel >= passo && qtd >= passo
  function addItem() {
    if (!podeAdicionar) return
    onAdicionar({
      chave: `${produto.id}|${cor}|${estampa}|${tamanho}|${modo}`,
      produtoId: produto.id, nome: produto.nome, cor, estampa, tamanho, modo,
      precoUnit, economiaUnit, qtd, loteMinimo: produto.loteMinimo,
      pesoGramas: produto.pesoGramas || PESO_PADRAO, estoque: estoqueSel, foto: produto.fotos?.[0],
    })
  }

  // Galeria por cor: mostra as fotos gerais (sem cor) + as marcadas para a cor atual.
  // Só estreita a galeria quando a cor tem um conjunto PRÓPRIO (2+ fotos); senão mostra a
  // galeria completa — assim as miniaturas nunca somem na abertura, mesmo quando a 1ª cor
  // tem só 1 foto e todas as fotos foram marcadas por cor (nenhuma "geral").
  const fotos = useMemo(() => {
    const porCor = produto.fotosPorCor ?? {}
    const deOutrasCores = new Set(Object.entries(porCor).filter(([c]) => c !== cor).flatMap(([, arr]) => arr))
    const lista = (produto.fotos ?? []).filter((f) => !deOutrasCores.has(f))
    return lista.length > 1 ? lista : (produto.fotos ?? [])
  }, [produto.fotos, produto.fotosPorCor, cor])

  return (
    <div className="cat-modal-fundo" onClick={onFechar}>
      <div className="cat-det" onClick={(e) => e.stopPropagation()}>
        <button className="cat-det-x" onClick={onFechar}>✕</button>
        <div className="cat-det-grid">
          {/* Galeria + zoom */}
          <div className="cat-det-galeria">
            <div className="cat-det-foto"
              onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }) }}
              onMouseLeave={() => setZoom(null)}>
              {fotos[fotoIdx]
                ? <img src={fotos[fotoIdx]} alt={produto.nome}
                    style={zoom ? { transform: 'scale(2.2)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
                : <div className="cat-foto-vazia">{produto.nome}</div>}
              {fotos.length > 0 && <span className="cat-zoom-dica">🔍 passe o mouse p/ ampliar</span>}
            </div>
            {fotos.length > 1 && (
              <div className="cat-det-thumbs">
                {fotos.map((f, i) => (
                  <button key={i} className={`cat-thumb ${i === fotoIdx ? 'ativo' : ''}`} onClick={() => setFotoIdx(i)}>
                    <img src={f} alt="" />
                  </button>
                ))}
              </div>
            )}
            {produto.videos?.length > 0 && (
              <video className="cat-det-video" src={produto.videos[0]} controls preload="metadata" />
            )}
          </div>

          {/* Compra */}
          <div className="cat-det-info">
            <h3>{produto.nome}</h3>
            <div className="cat-det-meta">
              {produto.referencia && <span>Ref. {produto.referencia}</span>}
              {produto.categoria && <span>· {produto.categoria}</span>}
            </div>
            {produto.descricao && <p className="cat-det-desc">{produto.descricao}</p>}

            {/* Modo de compra */}
            <div className="cat-modo">
              <button className={modo === 'ATACADO' ? 'on' : ''} disabled={produto.precoAtacado == null}
                onClick={() => setModo('ATACADO')}>ATACADO</button>
              <button className={modo === 'VAREJO' ? 'on' : ''} onClick={() => setModo('VAREJO')}>VAREJO</button>
            </div>
            <div className="cat-det-preco">
              {real(precoUnit)} <small>/ peça</small>
              {modo === 'ATACADO' && <span className="cat-lote">lote mín. {produto.loteMinimo} (múltiplos)</span>}
              {modo === 'VAREJO' && economiaUnit > 0 && <span className="cat-preco-antigo">{real(produto.precoOriginal!)}</span>}
            </div>

            {/* Cor */}
            {produto.cores.length > 0 && (
              <div className="cat-opcs">
                <label>Cor</label>
                <div className="cat-chips">
                  {produto.cores.map((cc) => (
                    <button key={cc} className={cc === cor ? 'on' : ''} onClick={() => setCor(cc)}>{cc}</button>
                  ))}
                </div>
              </div>
            )}
            {/* Estampa (só se houver) */}
            {estampasDaCor.length > 0 && (
              <div className="cat-opcs">
                <label>Estampa</label>
                <div className="cat-chips">
                  {estampasDaCor.map((ee) => (
                    <button key={ee} className={ee === estampa ? 'on' : ''} onClick={() => setEstampa(ee)}>{ee}</button>
                  ))}
                </div>
              </div>
            )}
            {/* Tamanho + estoque */}
            <div className="cat-opcs">
              <label>Tamanho <small>(disponibilidade)</small></label>
              <div className="cat-chips">
                {tamanhos.map((t) => {
                  const semLote = modo === 'ATACADO' && t.estoque < produto.loteMinimo
                  const ind = t.estoque === 0 || semLote
                  return (
                    <button key={t.tamanho} disabled={ind} className={t.tamanho === tamanho ? 'on' : ''}
                      onClick={() => setTamanho(t.tamanho)} title={`${t.estoque} em estoque`}>
                      {t.tamanho} <small>· {t.estoque}</small>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Quantidade */}
            <div className="cat-qtd">
              <button onClick={menos} disabled={qtd <= passo}>−</button>
              <span>{qtd} {qtd === 1 ? 'peça' : 'peças'}</span>
              <button onClick={mais} disabled={!tamanho || qtd + passo > estoqueSel}>+</button>
            </div>
            {tamanho && estoqueSel > 0 && estoqueSel <= 8 && (
              <div className="cat-urgencia">⚠️ Restam apenas {estoqueSel} unidades.</div>
            )}

            {/* Parcelamento/entrega/devolução — tudo informativo (a compra fecha pelo WhatsApp
                com a vendedora). O parcelamento aqui já considera a quantidade escolhida acima. */}
            {(() => {
              const subtotal = precoUnit * qtd
              const parcelaOk = regras.parcelasMax > 1 && qtd >= regras.parcelasMinPecas && subtotal >= regras.parcelasMinValor
              const parcela = parcelaOk ? textoParcela(subtotal, regras.parcelasMax) : null
              const freteGratisOk = regras.entregaFreteGratisValor != null && subtotal >= regras.entregaFreteGratisValor
              const temEntrega = regras.entregaPrazoTexto || freteGratisOk
              if (!parcela && !temEntrega && !regras.devolucaoPrazoDias) return null
              return (
                <div className="cat-det-regras">
                  {parcela && (
                    <div className="cat-det-regra">
                      <CreditCard size={15} />
                      <span>{parcela} sem juros{regras.parcelasFormaPagamento ? ` no ${regras.parcelasFormaPagamento}` : ''}</span>
                    </div>
                  )}
                  {temEntrega && (
                    <div className="cat-det-regra">
                      <Truck size={15} />
                      <span>{regras.entregaPrazoTexto || 'Consulte o prazo de entrega'}{freteGratisOk ? ' · Frete grátis' : ''}</span>
                    </div>
                  )}
                  {regras.devolucaoPrazoDias > 0 && (
                    <div className="cat-det-regra">
                      <RotateCcw size={15} />
                      <span>Troca ou devolução em até {regras.devolucaoPrazoDias} dias</span>
                    </div>
                  )}
                  {(regras.entregaTexto || regras.devolucaoTexto) && (
                    <p className="cat-det-regras-obs">{[regras.entregaTexto, regras.devolucaoTexto].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
              )
            })()}

            <button className="cat-add" onClick={addItem} disabled={!podeAdicionar}>
              {tamanho ? `Adicionar ${qtd} • ${real(precoUnit * qtd)}` : 'Escolha o tamanho'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── Carrinho ───────────────────────────
function Carrinho({ itens, totais, corPrimaria, vendedora, onMudarQtd, onRemover, onFechar, onFinalizar }: {
  itens: ItemCarrinho[]
  totais: { pecas: number; subtotal: number; economia: number; pesoKg: number; volumeL: number }
  corPrimaria: string
  vendedora: string
  onMudarQtd: (chave: string, delta: number) => void
  onRemover: (chave: string) => void
  onFechar: () => void
  onFinalizar: () => void
}) {
  return (
    <div className="cat-modal-fundo" onClick={onFechar}>
      <div className="cat-cart" onClick={(e) => e.stopPropagation()} style={{ '--cat-primaria': corPrimaria } as CSSProperties}>
        <div className="cat-cart-top">
          <strong>Seu pedido</strong>
          <button className="cat-det-x" onClick={onFechar}>✕</button>
        </div>
        <div className="cat-cart-itens">
          {itens.map((x) => (
            <div key={x.chave} className="cat-cart-item">
              {x.foto ? <img src={x.foto} alt="" /> : <div className="cat-cart-semfoto" />}
              <div className="cat-cart-meta">
                <div className="cat-cart-nome">{x.nome}</div>
                <div className="cat-cart-var">{[x.cor, x.estampa, x.tamanho].filter(Boolean).join(' / ')} · {x.modo === 'ATACADO' ? 'Atacado' : 'Varejo'}</div>
                <div className="cat-cart-preco">{real(x.precoUnit)} × {x.qtd} = <strong>{real(x.precoUnit * x.qtd)}</strong></div>
              </div>
              <div className="cat-cart-acoes">
                <div className="cat-qtd peq">
                  <button onClick={() => onMudarQtd(x.chave, -1)}>−</button>
                  <span>{x.qtd}</span>
                  <button onClick={() => onMudarQtd(x.chave, +1)}>+</button>
                </div>
                <button className="cat-cart-rem" onClick={() => onRemover(x.chave)}>remover</button>
              </div>
            </div>
          ))}
        </div>
        <div className="cat-cart-resumo">
          <div><span>Peças</span><span>{totais.pecas}</span></div>
          <div><span>Subtotal</span><span>{real(totais.subtotal)}</span></div>
          {totais.economia > 0 && <div className="eco"><span>Economia</span><span>{real(totais.economia)}</span></div>}
          <div className="muted"><span>Peso estimado</span><span>{totais.pesoKg.toFixed(2)} kg</span></div>
          <div className="muted"><span>Volume estimado</span><span>~{totais.volumeL.toFixed(1)} L</span></div>
          <div className="total"><span>Total</span><span>{real(totais.subtotal)}</span></div>
        </div>
        <button className="cat-add" onClick={onFinalizar}>Enviar pedido para a {vendedora}</button>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#888', margin: '-4px 18px 14px' }}>
          A {vendedora} confirma os itens e fecha o pedido com você. 💛
        </div>
      </div>
    </div>
  )
}

/** Estética inspirada no emmacloth: claro, minimalista, foto em destaque, sans-serif. */
export function CatalogoEstilos() {
  return (
    <style>{`
      .cat-root { min-height: 100vh; background: var(--cat-fundo); color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; padding-bottom: 128px; }
      .cat-vazio { min-height: 70vh; display: flex; align-items: center; justify-content: center; color: #777; font-family: sans-serif; padding: 40px; text-align: center; }
      /* Cabeçalho: marca (cor da própria marca) + busca (filtra a grade toda, sem ir ao backend) + atalhos */
      .cat-topo { background: var(--cat-primaria, #111); color: #fff; display: flex; align-items: center; gap: 20px; padding: 16px 24px; flex-wrap: nowrap; }
      .cat-topo-marca { display: flex; flex-direction: column; gap: 1px; flex-shrink: 0; }
      .cat-topo-marca img { max-height: 30px; max-width: 150px; object-fit: contain; }
      .cat-topo-marca-nome { font-size: 19px; font-weight: 800; letter-spacing: .5px; line-height: 1; }
      .cat-topo-marca-sub { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--cat-fundo, #fff); opacity: .65; }
      .cat-busca { display: flex; align-items: center; gap: 8px; flex: 1 1 auto; min-width: 0; max-width: 460px; background: #fff; border-radius: 99px; padding: 11px 18px; color: #888; }
      .cat-busca input { flex: 1; min-width: 0; border: none; background: none; outline: none; font-size: 14px; color: #222; font-family: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cat-busca input::placeholder { color: #999; }
      .cat-busca input[type="search"]::-webkit-search-cancel-button { cursor: pointer; }
      .cat-topo-acoes { display: flex; gap: 18px; flex-shrink: 0; margin-left: auto; }
      .cat-topo-icone { position: relative; display: flex; background: none; border: none; color: #fff; cursor: pointer; opacity: .92; padding: 4px; }
      .cat-topo-icone:hover { opacity: 1; }
      .cat-topo-icone.ativo { color: #ff6b6b; opacity: 1; }
      .cat-topo-selo {
        position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 99px;
        background: #ff6b6b; color: #fff; font-size: 10px; font-weight: 800; line-height: 16px; text-align: center;
      }
      @media (max-width: 720px) {
        .cat-topo { padding: 8px 12px; gap: 8px; }
        .cat-topo-marca img { max-height: 18px; max-width: 84px; }
        .cat-topo-marca-nome { font-size: 13px; }
        .cat-topo-marca-sub { font-size: 7.5px; }
        .cat-busca { padding: 6px 10px; gap: 5px; }
        .cat-busca input { font-size: 11px; }
        .cat-busca svg { width: 13px; height: 13px; }
        .cat-topo-acoes { gap: 8px; }
        .cat-topo-icone svg { width: 15px; height: 15px; }
      }

      /* Redução proporcional de todas as seções no mobile — mesma densidade da referência
         (cabeçalho compacto, ícones/textos/paddings menores em toda a página, não só na busca). */
      @media (max-width: 720px) {
        .cat-categorias { padding: 10px 10px 4px; gap: 9px; }
        .cat-cat-item { width: 44px; gap: 3px; }
        .cat-cat-icone { width: 38px; height: 38px; }
        .cat-cat-rotulo { font-size: 8px; max-width: 44px; }

        .cat-hero-acoes-flut { top: 8px; right: 8px; gap: 5px; }
        .cat-hero-acao-flut { width: 26px; height: 26px; }
        .cat-destaque-badge { font-size: 8px; padding: 2px 7px; }

        .cat-selos { gap: 6px; padding: 0 10px; }
        .cat-selo { padding: 6px 8px; gap: 5px; }
        .cat-selo span { font-size: 8.5px; }
        .cat-selos-compactos { margin-top: 12px; }
        .cat-selos-compactos .cat-selo { padding: 8px 3px; }

        .cat-look-banner { margin: 12px auto 0; padding: 0 10px; gap: 8px; }
        .cat-look-texto { padding: 9px 11px; }
        .cat-look-texto strong { font-size: 11px; margin-bottom: 3px; }
        .cat-look-texto p { font-size: 9.5px; margin: 0 0 8px; }
        .cat-look-btn { padding: 6px 10px; font-size: 9.5px; }
        .cat-look-foto-item { width: 42px; height: 42px; }
        .cat-look-desconto { width: 42px; height: 42px; font-size: 9.5px; }

        .cat-secao { padding: 14px 10px 4px; }
        .cat-secao-titulo { font-size: 11.5px; }
        .cat-secao-link { font-size: 10px; }
        .cat-info { padding: 5px 6px 6px; }
        .cat-nome { font-size: 8.5px; line-height: 1.2; }
        .cat-preco { font-size: 9.5px; gap: 3px; }
        .cat-preco-antigo { font-size: 8px; }
        .cat-parcela { font-size: 7px; }
        .cat-card-rodape { align-items: center; gap: 3px; margin-top: 5px; }
        .cat-tam-chips { gap: 2px; flex-wrap: nowrap; overflow: hidden; min-width: 0; }
        .cat-tam-chips span { font-size: 6px; padding: 0px 2px; flex-shrink: 0; }
        .cat-add-rapido { width: 16px; height: 16px; flex-shrink: 0; }
        .cat-add-rapido svg { width: 10px; height: 10px; }
        .cat-favorito { width: 18px; height: 18px; }
        .cat-favorito svg { width: 11px; height: 11px; }
        .cat-esgotado, .cat-desconto, .cat-video-badge { font-size: 8px; padding: 1px 6px; }

        .cat-bottom-nav { padding: 4px 4px calc(4px + env(safe-area-inset-bottom, 0)); }
        .cat-nav-item { font-size: 9px; padding: 3px 2px; }
        .cat-nav-item.ativo .cat-nav-icone { width: 44px; height: 44px; margin-top: -24px; }
      }

      /* Trilho de categorias em ícone circular — vem antes do hero */
      .cat-categorias { max-width: 1100px; margin: 0 auto; padding: 18px 14px 4px; display: flex; gap: 18px; overflow-x: auto; scrollbar-width: none; }
      .cat-categorias::-webkit-scrollbar { display: none; }
      .cat-cat-item { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; background: none; border: none; cursor: pointer; width: 64px; }
      .cat-cat-icone {
        width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        border: 2px solid #00000014; color: #444; transition: border-color .15s ease, color .15s ease;
      }
      .cat-cat-item.ativo .cat-cat-icone { border-color: var(--cat-primaria, #111); color: var(--cat-primaria, #111); }
      .cat-cat-rotulo { font-size: 10.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #555; text-align: center; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 64px; }
      .cat-cat-item.ativo .cat-cat-rotulo { color: var(--cat-primaria, #111); position: relative; }
      .cat-cat-item.ativo .cat-cat-rotulo::after { content: ''; display: block; width: 4px; height: 4px; border-radius: 50%; background: var(--cat-primaria, #111); margin: 4px auto 0; }

      /* Hero: produto em destaque no topo da vitrine (substitui o antigo cabeçalho de perfil).
         Texto e foto lado a lado (2 colunas) em qualquer largura, inclusive mobile — igual à
         referência de mockup: no celular a foto fica só um pouco mais estreita, nunca empilhada. */
      .cat-hero { max-width: 1100px; margin: 0 auto; padding: 16px 12px; display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 12px; align-items: center; }
      @media (min-width: 720px) { .cat-hero { grid-template-columns: 1fr 1fr; padding: 24px 24px; gap: 36px; } }
      .cat-hero-texto { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
      .cat-hero-selo { display: inline-block; border: 1px solid var(--cat-primaria, #111); color: var(--cat-primaria, #111); font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; padding: 3px 9px; border-radius: 99px; }
      .cat-hero-titulo { margin: 3px 0 0; font-size: clamp(16px, 4.6vw, 42px); font-weight: 800; line-height: 1.1; }
      .cat-hero-desc { margin: 0; font-size: 11px; line-height: 1.4; color: #555; max-width: 440px; }
      .cat-hero-btn { margin-top: 6px; background: var(--cat-primaria, #111); color: #fff; border: none; padding: 8px 14px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; }
      .cat-hero-btn:hover { filter: brightness(1.1); }
      @media (min-width: 720px) {
        .cat-hero-selo { font-size: 11px; padding: 4px 12px; }
        .cat-hero-desc { font-size: 14px; line-height: 1.6; }
        .cat-hero-btn { padding: 13px 22px; font-size: 14px; margin-top: 10px; }
      }
      /* Pontinhos do carrossel do hero — só aparece com 2+ produtos em destaque */
      .cat-hero-dots { display: flex; gap: 8px; margin-top: 10px; }
      .cat-hero-dots button { width: 8px; height: 8px; padding: 0; border: none; border-radius: 99px; background: #00000024; cursor: pointer; }
      .cat-hero-dots button.ativo { background: var(--cat-primaria, #111); width: 22px; transition: width .2s ease; }
      /* Filtros por categoria (+ "Lançamentos") — puramente client-side, soma com a busca */
      /* Foto do hero "dissolve" nas bordas esquerda/direita em vez de terminar num corte reto */
      .cat-hero-foto-wrap { position: relative; }
      .cat-hero-foto {
        position: relative; aspect-ratio: 4/5; background: #f2f2f2; overflow: hidden; border-radius: 12px; border: none; padding: 0; cursor: pointer; display: block; width: 100%;
        mask-image: linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%);
        -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 14%, #000 86%, transparent 100%);
      }
      @media (min-width: 720px) { .cat-hero-foto { aspect-ratio: 8/5; } } /* metade da altura do 4/5 na mesma largura */
      /* "contain" em vez de "cover": a peça costuma ter texto/logo desenhado na própria arte
         (ex.: "ELEGÂNCIA EM CADA PASSO") — cortar a imagem cortava esse texto. Sem crop nenhum,
         só pode sobrar uma tarja da cor de fundo do box nas laterais/topo-baixo. */
      .cat-hero-foto img { width: 100%; height: 100%; object-fit: contain; display: block; }
      /* Coração/compartilhar flutuando na lateral direita da foto do hero */
      .cat-hero-acoes-flut { position: absolute; top: 16px; right: 16px; display: flex; flex-direction: column; gap: 10px; }
      .cat-hero-acao-flut {
        width: 38px; height: 38px; border-radius: 50%; background: rgba(20,20,20,0.55); backdrop-filter: blur(2px);
        border: none; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer;
      }
      .cat-hero-acao-flut:hover { background: rgba(20,20,20,0.75); }
      .cat-hero-acao-flut.ativo { color: #ff6b6b; }
      .cat-destaque-badge { position: absolute; top: 8px; left: 8px; background: var(--cat-primaria, #111); color: #fff; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 99px; letter-spacing: .3px; text-transform: uppercase; }

      /* Faixas de selos de confiança (a mais robusta, logo abaixo do hero; a compacta, mais pro fim) */
      .cat-selos { max-width: 1100px; margin: 8px auto 0; padding: 0 14px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
      @media (min-width: 720px) { .cat-selos { grid-template-columns: repeat(4, 1fr); } }
      .cat-selo { display: flex; align-items: center; gap: 8px; border: 1px solid #00000014; border-radius: 10px; padding: 10px 12px; color: var(--cat-primaria, #111); }
      .cat-selo span { font-size: 11px; font-weight: 700; color: #333; line-height: 1.3; }
      .cat-selos-compactos { margin-top: 22px; }
      .cat-selos-compactos .cat-selo { border: none; border-top: 1px solid #00000014; border-bottom: 1px solid #00000014; border-radius: 0; padding: 14px 4px; }
      .cat-selos-compactos .cat-selo span { font-weight: 500; }
      .cat-selos-compactos .cat-selo span strong { display: block; font-weight: 800; color: #222; }

      /* Banner "Monte seu look" — visual por enquanto (botão avisa "em breve") */
      .cat-look-banner { max-width: 1100px; margin: 22px auto 0; padding: 0 14px; display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
      .cat-look-texto { flex: 1 1 200px; border: 1px solid var(--cat-primaria, #111); border-radius: 14px; padding: 16px 18px; }
      .cat-look-texto strong { display: block; font-size: 15px; line-height: 1.3; margin-bottom: 6px; }
      .cat-look-texto p { margin: 0 0 12px; font-size: 12px; color: #666; }
      .cat-look-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--cat-primaria, #111); color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; }
      .cat-look-fotos { flex: 1 1 220px; display: flex; align-items: center; gap: 8px; }
      .cat-look-foto-item { position: relative; width: 64px; height: 64px; border-radius: 10px; overflow: hidden; flex-shrink: 0; }
      .cat-look-foto-item img { width: 100%; height: 100%; object-fit: cover; }
      .cat-look-mais { position: absolute; top: 50%; right: -14px; transform: translateY(-50%); font-size: 18px; font-weight: 800; color: #999; }
      .cat-look-desconto {
        flex-shrink: 0; width: 64px; height: 64px; border-radius: 50%; border: 2px solid var(--cat-primaria, #111);
        display: flex; align-items: center; justify-content: center; text-align: center; font-size: 13px; font-weight: 800;
        color: var(--cat-primaria, #111); line-height: 1.1;
      }

      .cat-secao { max-width: 1100px; margin: 0 auto; padding: 26px 14px 6px; }
      .cat-secao-cabec { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
      .cat-secao-titulo { font-size: 15px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; margin: 0; }
      .cat-secao-link { background: none; border: none; color: var(--cat-primaria, #111); font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
      /* 4 colunas mesmo no mobile — igual à referência (Destaques para você) */
      .cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      @media (min-width: 640px) { .cat-grid { gap: 18px; } }
      .cat-card { border: 1px solid rgba(0,0,0,0.08); background: #fff; border-radius: 10px; padding: 0; cursor: pointer; text-align: left; overflow: hidden; transition: box-shadow .2s ease, border-color .2s ease; }
      .cat-card:hover { border-color: rgba(0,0,0,0.14); box-shadow: 0 6px 18px rgba(0,0,0,0.07); }
      .cat-foto { position: relative; aspect-ratio: 3/4; background: #f2f2f2; overflow: hidden; }
      .cat-foto img { width: 100%; height: 100%; object-fit: cover; transition: transform .35s ease; }
      .cat-card:hover .cat-foto img { transform: scale(1.04); }
      .cat-foto-vazia { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 13px; padding: 8px; text-align: center; }
      .cat-esgotado { position: absolute; top: 8px; left: 8px; background: #00000099; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: .5px; }
      /* Vídeo fica embaixo à direita — o topo direito agora é do coração de favoritar */
      .cat-video-badge { position: absolute; bottom: 8px; right: 8px; background: #000000aa; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 99px; letter-spacing: .3px; }
      .cat-favorito {
        position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border-radius: 50%;
        background: #ffffffe0; color: #333; display: flex; align-items: center; justify-content: center;
        cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.15); transition: transform .15s ease, color .15s ease;
      }
      .cat-favorito:hover { transform: scale(1.1); }
      .cat-favorito.ativo { color: #d12c2c; }
      .cat-info { padding: 10px 12px 12px; }
      .cat-nome { font-size: 13px; color: #222; line-height: 1.3; }
      .cat-preco { font-size: 14px; font-weight: 700; margin-top: 4px; display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
      .cat-preco-antigo { color: #999; font-weight: 500; text-decoration: line-through; font-size: 12px; }
      .cat-preco-promo { color: #d12c2c; }
      .cat-desconto { position: absolute; bottom: 8px; left: 8px; background: #d12c2c; color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; letter-spacing: .3px; }
      .cat-parcela { font-size: 11px; color: #888; margin-top: 2px; }
      .cat-card-rodape { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 8px; }
      .cat-tam-chips { display: flex; gap: 4px; flex-wrap: wrap; }
      .cat-tam-chips span { font-size: 10px; font-weight: 700; color: #666; border: 1px solid #00000018; border-radius: 5px; padding: 1px 5px; }
      .cat-add-rapido {
        flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; background: var(--cat-primaria, #111); color: #fff;
        display: flex; align-items: center; justify-content: center; cursor: pointer; margin-left: auto;
      }
      .cat-add-rapido:hover { filter: brightness(1.15); }

      /* Carrinho flutuante — fica acima do rodapé de navegação fixo (não sobrepõe) */
      .cat-cart-fab { position: fixed; bottom: calc(72px + env(safe-area-inset-bottom, 0)); left: 50%; transform: translateX(-50%); background: var(--cat-primaria); color: #fff; border: none; padding: 14px 26px; border-radius: 99px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px #00000033; z-index: 20; }

      /* CTA "Falar com a vendedora" — no fluxo da página, entre a grade de produtos e o rodapé */
      .cat-fala-wrap { max-width: 1100px; margin: 0 auto; padding: 26px 14px 6px; text-align: center; }
      .cat-fala-cta { background: var(--cat-primaria); color: #fff; border: none; padding: 14px 26px; border-radius: 99px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px #00000022; }
      .cat-fala-cta:hover { filter: brightness(1.1); }

      /* Menu "Mais" (mesmo padrão da PerfilVendedora.tsx) */
      .cat-drawer-fundo { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 60; display: flex; justify-content: flex-end; }
      .cat-drawer { width: 260px; background: #fff; height: 100%; padding: 20px; display: flex; flex-direction: column; gap: 4px; }
      .cat-drawer-fechar { align-self: flex-end; background: none; border: none; color: #888; cursor: pointer; margin-bottom: 12px; }
      .cat-drawer-item { display: flex; align-items: center; gap: 12px; background: none; border: none; color: #222; text-align: left; padding: 12px 8px; border-radius: 8px; font-size: 15px; cursor: pointer; }
      .cat-drawer-item:hover { background: #00000008; }

      /* Rodapé de navegação (mesmo padrão da PerfilVendedora.tsx) — "Catálogo" fica sempre ativo aqui */
      .cat-bottom-nav { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 45; background: color-mix(in srgb, var(--cat-fundo) 92%, black 8%); border-top: 1px solid #00000014; padding: 8px 4px calc(8px + env(safe-area-inset-bottom, 0)); }
      .cat-nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; color: #777; font-size: 11px; padding: 6px 2px; cursor: pointer; }
      .cat-nav-item.ativo { color: var(--cat-primaria); font-weight: 700; }
      .cat-nav-icone { display: flex; }
      .cat-nav-item.ativo .cat-nav-icone {
        width: 50px; height: 50px; margin-top: -27px; border-radius: 50%; flex-direction: column; gap: 1px;
        align-items: center; justify-content: center; background: var(--cat-primaria); color: #fff;
        border: 1px solid #00000014; box-shadow: 0 0 26px 8px color-mix(in srgb, var(--cat-primaria) 45%, transparent), 0 6px 16px rgba(0,0,0,0.4);
      }
      .cat-nav-icone-rotulo { color: #fff; font-size: 8px; font-weight: 700; line-height: 1; }

      /* Modal base */
      .cat-modal-fundo { position: fixed; inset: 0; background: #00000077; display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
      @media (min-width: 720px) { .cat-modal-fundo { align-items: center; } }

      /* Detalhe da peça */
      .cat-det { background: #fff; width: min(960px, 100%); max-height: 94vh; overflow: auto; border-radius: 16px 16px 0 0; position: relative; }
      @media (min-width: 720px) { .cat-det { border-radius: 16px; } }
      .cat-det-x, .cat-cart .cat-det-x { position: sticky; float: right; top: 10px; right: 10px; margin: 8px; background: #00000088; color: #fff; border: none; width: 32px; height: 32px; border-radius: 99px; cursor: pointer; z-index: 2; }
      .cat-det-grid { display: grid; grid-template-columns: 1fr; gap: 0; }
      @media (min-width: 720px) { .cat-det-grid { grid-template-columns: 1.1fr 1fr; } }
      .cat-det-galeria { padding: 12px; }
      .cat-det-foto { position: relative; aspect-ratio: 3/4; background: #f2f2f2; overflow: hidden; border-radius: 10px; cursor: zoom-in; }
      .cat-det-foto img { width: 100%; height: 100%; object-fit: cover; transition: transform .08s ease-out; }
      .cat-zoom-dica { position: absolute; bottom: 8px; left: 8px; background: #00000088; color: #fff; font-size: 11px; padding: 3px 8px; border-radius: 99px; pointer-events: none; }
      /* Em telas de toque (sem mouse) o zoom por hover não existe — esconde a dica. */
      @media (hover: none) { .cat-zoom-dica { display: none; } .cat-det-foto { cursor: default; } }
      .cat-det-thumbs { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
      .cat-thumb { width: 54px; height: 70px; border: 2px solid transparent; border-radius: 6px; overflow: hidden; padding: 0; cursor: pointer; background: #eee; }
      .cat-thumb.ativo { border-color: var(--cat-primaria, #111); }
      .cat-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .cat-det-video { width: 100%; margin-top: 10px; border-radius: 10px; background: #000; }
      .cat-det-info { padding: 16px 18px 22px; }
      .cat-det-info h3 { margin: 0 0 4px; font-size: 20px; }
      .cat-det-meta { font-size: 12px; color: #888; display: flex; gap: 6px; flex-wrap: wrap; }
      .cat-det-desc { font-size: 13px; color: #555; margin: 10px 0; }
      .cat-modo { display: flex; gap: 8px; margin: 14px 0 8px; }
      .cat-modo button { flex: 1; padding: 11px; border: 1.5px solid #ddd; background: #fff; border-radius: 10px; font-weight: 700; letter-spacing: .5px; cursor: pointer; color: #333; }
      .cat-modo button.on { border-color: var(--cat-primaria, #111); background: var(--cat-primaria, #111); color: #fff; }
      .cat-modo button:disabled { opacity: .4; cursor: not-allowed; }
      .cat-det-preco { font-size: 22px; font-weight: 800; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .cat-det-preco small { font-size: 12px; color: #888; font-weight: 500; }
      .cat-lote { font-size: 11px; font-weight: 600; color: #b26a00; background: #f59e0b22; padding: 2px 8px; border-radius: 99px; }
      .cat-opcs { margin-top: 14px; }
      .cat-opcs label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #666; }
      .cat-opcs label small { font-weight: 500; text-transform: none; color: #aaa; }
      .cat-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
      .cat-chips button { padding: 7px 12px; border: 1.5px solid #ddd; background: #fff; border-radius: 8px; cursor: pointer; font-size: 13px; color: #333; }
      .cat-chips button small { color: #999; }
      .cat-chips button.on { border-color: var(--cat-primaria, #111); background: #1110; box-shadow: inset 0 0 0 1px var(--cat-primaria, #111); font-weight: 700; }
      .cat-chips button:disabled { opacity: .35; text-decoration: line-through; cursor: not-allowed; }
      .cat-qtd { display: flex; align-items: center; gap: 14px; margin: 16px 0 6px; }
      .cat-qtd button { width: 40px; height: 40px; border-radius: 99px; border: 1.5px solid #ccc; background: #fff; font-size: 20px; cursor: pointer; }
      .cat-qtd button:disabled { opacity: .4; cursor: not-allowed; }
      .cat-qtd.peq button { width: 28px; height: 28px; font-size: 16px; }
      .cat-qtd.peq { gap: 8px; }
      .cat-urgencia { font-size: 12px; color: #d12c2c; font-weight: 700; margin-bottom: 8px; }
      .cat-det-regras { display: flex; flex-direction: column; gap: 6px; margin: 14px 0; padding: 12px 14px; background: #00000006; border-radius: 10px; }
      .cat-det-regra { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #333; }
      .cat-det-regra svg { flex-shrink: 0; color: var(--cat-primaria, #111); }
      .cat-det-regras-obs { margin: 2px 0 0 23px; font-size: 11px; color: #888; }
      .cat-add { width: 100%; margin-top: 14px; background: var(--cat-primaria, #111); color: #fff; border: none; padding: 15px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
      .cat-add:disabled { opacity: .5; cursor: not-allowed; }

      /* Carrinho */
      .cat-cart { background: #fff; width: min(480px, 100%); max-height: 92vh; display: flex; flex-direction: column; border-radius: 16px 16px 0 0; }
      @media (min-width: 720px) { .cat-cart { border-radius: 16px; } }
      .cat-cart-top { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-bottom: 1px solid #eee; }
      .cat-cart-top .cat-det-x { position: static; float: none; margin: 0; }
      .cat-cart-itens { overflow: auto; padding: 8px 14px; flex: 1; }
      .cat-cart-item { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
      .cat-cart-item img, .cat-cart-semfoto { width: 56px; height: 72px; object-fit: cover; border-radius: 6px; background: #eee; flex-shrink: 0; }
      .cat-cart-meta { flex: 1; min-width: 0; }
      .cat-cart-nome { font-size: 14px; font-weight: 600; }
      .cat-cart-var { font-size: 12px; color: #777; margin: 2px 0; }
      .cat-cart-preco { font-size: 13px; }
      .cat-cart-acoes { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
      .cat-cart-rem { background: none; border: none; color: #c62828; font-size: 12px; cursor: pointer; }
      .cat-cart-resumo { padding: 12px 18px; border-top: 1px solid #eee; font-size: 14px; }
      .cat-cart-resumo > div { display: flex; justify-content: space-between; padding: 3px 0; }
      .cat-cart-resumo .muted { color: #888; font-size: 12px; }
      .cat-cart-resumo .eco { color: #2e7d32; font-weight: 700; }
      .cat-cart-resumo .total { font-size: 18px; font-weight: 800; border-top: 1px solid #eee; margin-top: 6px; padding-top: 8px; }
      .cat-cart .cat-add { margin: 0 18px 18px; width: calc(100% - 36px); }

      .cat-rodape { text-align: center; color: #aaa; font-size: 12px; padding: 30px 0 16px; }
    `}</style>
  )
}

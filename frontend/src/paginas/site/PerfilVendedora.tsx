import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Share2, Menu, X, Phone, ShoppingBag, ShoppingCart, Sparkles, Package, Star, Gift, Megaphone, Truck, Headphones, Home, UserRound, FileText, MoreHorizontal, User } from 'lucide-react'
import { siWhatsapp } from 'simple-icons'
import { api, formataReal } from '../../api'
import { HOST } from '../../host'
import { useToast } from '../../componentes/Toast'
import { useMetaTags } from '../../lib/useMetaTags'
import MeusPedidos from './MeusPedidos'
import BotaoInstalarApp from '../../componentes/BotaoInstalarApp'

function IconeWhatsApp({ size = 20 }: { size?: number }) {
  return (
    <svg role="img" aria-label={siWhatsapp.title} viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d={siWhatsapp.path} />
    </svg>
  )
}

interface Produto { id: string; fotos: string[] }
interface Colecao { id: string; nome: string; descricao?: string | null; outlet?: boolean; produtos: Produto[] }
interface Depoimento { nota: number; comentario: string | null; nomeCliente: string | null; createdAt: string }
interface Perfil {
  marca: { nome: string; logoUrl: string | null; corPrimaria: string; corSecundaria: string }
  loja: { nome: string }
  vendedora: {
    nome: string; primeiroNome: string; fotoUrl: string | null; bio: string | null; temWhatsapp: boolean
    stats: { clientesAtivos: number; pedidosEntregues: number; colecoesLancadas: number }
    statAvaliacao: number | null; totalAvaliacoes: number; depoimentos: Depoimento[]
  }
  colecoes: Colecao[]
}

/** Arte abstrata determinística p/ coleção sem foto de produto (mesma técnica da vitrine da
 *  assessora — sempre a mesma coleção cai na mesma arte, em vez de cinza plano). */
const ARTE_ABSTRATA = [
  'linear-gradient(135deg, #2a2a2a 0%, #161616 45%, #2f2a26 100%)',
  'linear-gradient(120deg, #d8cdb8 0%, #efe8d8 35%, #cabb9d 70%, #e4dac4 100%)',
  'linear-gradient(125deg, #2b2b2f 0%, #1a1a1d 30%, #3a3a40 55%, #17171a 100%)',
  'linear-gradient(160deg, #4a4a4a 0%, #2e2e2e 50%, #55534f 100%)',
  'radial-gradient(120% 120% at 30% 20%, #5a2430 0%, #2c1116 60%, #1a0a0d 100%)',
  'linear-gradient(135deg, #d9cdb8 0%, #c3b394 50%, #ddd2bc 100%)',
]
function arteAbstrata(nome: string): string {
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0
  return ARTE_ABSTRATA[hash % ARTE_ABSTRATA.length]
}

function hexParaRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function luminanciaRel([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
/** Razão de contraste WCAG entre duas luminâncias relativas (1 a 21). */
function contraste(l1: number, l2: number): number {
  const [claro, escuro] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (claro + 0.05) / (escuro + 0.05)
}

interface Paleta { fundo: string; texto: string; textoSuave: string; borda: string; mistura: string; acento: string; acentoTexto: string }

/** Paleta do perfil derivada das DUAS cores da marca (corPrimaria/corSecundaria) — fiel à
 *  identidade dela, não um canvas escuro fixo com só um toque de cor emprestado. corSecundaria
 *  vira o fundo real da página (a mesma lógica do Catalogo.tsx/"cat-fundo"); o texto e as
 *  superfícies (cards, modais, inputs) se adaptam pra continuar legíveis nela, seja clara ou
 *  escura. corPrimaria vira o acento — só cai pro dourado padrão se o contraste dela contra ESSE
 *  fundo for baixo demais pra enxergar (ex.: corPrimaria muito parecida com corSecundaria). */
function montarPaleta(corPrimaria: string, corSecundaria: string): Paleta {
  const rgbFundo = hexParaRgb(corSecundaria) ?? [255, 255, 255]
  const fundo = `rgb(${rgbFundo.join(',')})`
  const lumFundo = luminanciaRel(rgbFundo)
  const escuro = lumFundo < 0.5
  const texto = escuro ? '#f2efe9' : '#1c1a17'
  const textoSuave = escuro ? '#b8b3ac' : '#6b665e'
  const borda = escuro ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'
  const mistura = escuro ? '#ffffff' : '#000000'

  const rgbPrimaria = hexParaRgb(corPrimaria)
  const lumPrimaria = rgbPrimaria ? luminanciaRel(rgbPrimaria) : null
  const contrasteOk = lumPrimaria != null && contraste(lumPrimaria, lumFundo) >= 2.2
  const acento = contrasteOk ? `#${/^#?([0-9a-f]{6})$/i.exec(corPrimaria.trim())![1]}` : '#c9a25f'
  const lumAcento = contrasteOk ? lumPrimaria! : luminanciaRel(hexParaRgb('#c9a25f')!)
  const acentoTexto = lumAcento > 0.5 ? '#14100a' : '#f7f4ee'

  return { fundo, texto, textoSuave, borda, mistura, acento, acentoTexto }
}

/** "Adicionar à Tela de Início" mostra a MARCA (logo + nome da marca/vendedora), não o ícone/nome
 *  genérico do ZAIEZE — mesma estrutura de usePwaPersonalizado (VitrineAssessora.tsx), mas aqui a
 *  imagem é a logo da marca (não a foto da vendedora): é a vitrine dela, não um perfil pessoal.
 *  O <link rel="manifest"> aponta pro manifest.webmanifest gerado pelo backend (rota pública em
 *  catalogo.routes.ts) — não um Blob URL em memória: o Chrome resolve a instalabilidade/ícone do
 *  app (Android "Adicionar à Tela de Início"/WebAPK) a partir da URL que o <link> tinha no
 *  carregamento da página, então uma troca via JS só funciona se apontar pra uma URL de rede de
 *  verdade (um blob: nunca vira WebAPK — ficava sempre com o ícone genérico do ZAIEZE mesmo com
 *  o título certo, que vem do document.title por outro caminho). Também troca o ícone/título
 *  usados pelo "Adicionar à Tela de Início" do iOS. Restaura tudo ao sair da tela. */
function usePwaPersonalizado(p: Perfil | null, redeSlug: string | null, vendSlug: string | undefined) {
  useEffect(() => {
    if (!p || !p.marca.logoUrl || !redeSlug || !vendSlug) return
    const titulo = `${p.marca.nome}/${p.vendedora.primeiroNome}`

    const linkManifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    const linkAppleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
    const linkFavicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const metaAppleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    const original = {
      manifest: linkManifest?.href ?? null,
      appleIcon: linkAppleIcon?.href ?? null,
      favicon: linkFavicon?.href ?? null,
      appleTitle: metaAppleTitle?.content ?? null,
      titulo: document.title,
    }

    if (linkManifest) linkManifest.href = `/api/catalogo/publico/${redeSlug}/${vendSlug}/manifest.webmanifest`
    if (linkAppleIcon) linkAppleIcon.href = p.marca.logoUrl
    // Chrome/Android usa o favicon como ícone de fallback em alguns fluxos de atalho — sem
    // custo trocar também, mesmo com o manifest de verdade acima cobrindo o caso principal.
    if (linkFavicon) linkFavicon.href = p.marca.logoUrl
    if (metaAppleTitle) metaAppleTitle.content = titulo
    document.title = titulo

    return () => {
      if (linkManifest && original.manifest) linkManifest.href = original.manifest
      if (linkAppleIcon && original.appleIcon) linkAppleIcon.href = original.appleIcon
      if (linkFavicon && original.favicon) linkFavicon.href = original.favicon
      if (metaAppleTitle && original.appleTitle) metaAppleTitle.content = original.appleTitle
      document.title = original.titulo
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, redeSlug, vendSlug])
}

const NAV_ITENS = [
  { id: 'inicio', rotulo: 'Início', Icone: Home },
  { id: 'catalogo', rotulo: 'Catálogo', Icone: ShoppingBag },
  { id: 'perfil', rotulo: 'Perfil', Icone: UserRound },
  { id: 'pedidos', rotulo: 'Pedidos', Icone: FileText },
  { id: 'mais', rotulo: 'Mais', Icone: MoreHorizontal },
] as const

export default function PerfilVendedora() {
  const { vendSlug } = useParams<{ vendSlug: string }>()
  const redeSlug = HOST.slug
  const navigate = useNavigate()
  const [p, setP] = useState<Perfil | null>(null)
  const [erro, setErro] = useState('')
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [avaliacaoAberta, setAvaliacaoAberta] = useState(false)
  const [contatando, setContatando] = useState<'whatsapp' | 'ligar' | null>(null)
  const [meusPedidosAberto, setMeusPedidosAberto] = useState<'abertos' | 'fechados' | null>(null)
  const [depoimentosExpandidos, setDepoimentosExpandidos] = useState(false)
  const [todosDepoimentos, setTodosDepoimentos] = useState<Depoimento[] | null>(null)
  const [carregandoDepoimentos, setCarregandoDepoimentos] = useState(false)
  const avisar = useToast()

  useEffect(() => {
    if (!redeSlug || !vendSlug) { setErro('Página não encontrada.'); return }
    api.get(`/catalogo/publico/${redeSlug}/${vendSlug}`).then(({ data }) => setP(data)).catch(() => setErro('Página não encontrada.'))
  }, [redeSlug, vendSlug])

  const paleta = p ? montarPaleta(p.marca.corPrimaria, p.marca.corSecundaria) : null
  usePwaPersonalizado(p, redeSlug, vendSlug)

  useMetaTags({
    titulo: p ? `${p.vendedora.nome} | ${p.marca.nome}` : 'Perfil',
    descricao: p ? `Vendedora oficial ${p.marca.nome} — moda direto pelo WhatsApp.` : '',
    imagem: p?.vendedora.fotoUrl ?? undefined,
  })

  async function verMaisDepoimentos() {
    if (todosDepoimentos === null) {
      setCarregandoDepoimentos(true)
      try {
        const { data } = await api.get(`/catalogo/publico/${redeSlug}/${vendSlug}/avaliacoes`)
        setTodosDepoimentos(data)
      } catch {
        setTodosDepoimentos(p?.vendedora.depoimentos ?? [])
      } finally {
        setCarregandoDepoimentos(false)
      }
    }
    setDepoimentosExpandidos(true)
  }

  // Falar/Ligar: o telefone da vendedora nunca chega ao cliente (mesma regra do Catalogo.tsx) —
  // o backend resolve o número certo (marca oficial ou fallback pessoal) e cria o lead no Funil.
  async function contatar(via: 'whatsapp' | 'ligar') {
    setContatando(via)
    try {
      const { data } = await api.post(`/catalogo/publico/${redeSlug}/${vendSlug}/lead`, {})
      if (!data.whatsappUrl) { avisar('WhatsApp indisponível no momento.', 'erro'); return }
      if (via === 'whatsapp') {
        window.location.href = data.whatsappUrl
      } else {
        const digits = (data.whatsappUrl.match(/wa\.me\/(\d+)/) ?? [])[1]
        window.location.href = digits ? `tel:${digits}` : data.whatsappUrl
      }
    } catch {
      avisar('Não deu pra abrir o contato agora.', 'erro')
    } finally {
      setContatando(null)
    }
  }

  function compartilhar() {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: p?.vendedora.nome, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url)
      avisar('Link copiado.')
    }
  }

  function irPara(id: (typeof NAV_ITENS)[number]['id']) {
    setDrawerAberto(false)
    if (id === 'inicio') { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    if (id === 'catalogo') { navigate(`/${vendSlug}/catalogo`); return }
    if (id === 'perfil') { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    if (id === 'pedidos') { setMeusPedidosAberto('fechados'); return }
    setDrawerAberto(true)
  }

  if (erro) return <div className="pv-vazio">{erro}</div>
  if (!p) return <div className="pv-vazio">Carregando…</div>

  const paletaAtual = paleta!
  const [primeiroNome, ...resto] = p.vendedora.nome.split(' ')
  const colecoesDestaque = p.colecoes.slice(0, 8)

  return (
    <div className="pv-root" style={{
      '--pv-fundo': paletaAtual.fundo, '--pv-texto': paletaAtual.texto, '--pv-texto-suave': paletaAtual.textoSuave,
      '--pv-borda': paletaAtual.borda, '--pv-mistura': paletaAtual.mistura,
      '--pv-acento': paletaAtual.acento, '--pv-acento-texto': paletaAtual.acentoTexto,
    } as React.CSSProperties}>
      <PerfilVendedoraEstilos />

      <header className="pv-topo">
        <div className="pv-marca-wrap">
          {p.marca.logoUrl ? <img className="pv-marca-logo" src={p.marca.logoUrl} alt={p.marca.nome} /> : <div className="pv-marca-nome">{p.marca.nome}</div>}
        </div>
        <div className="pv-topo-acoes">
          <BotaoInstalarApp className="pv-icone-botao" />
          <button type="button" className="pv-icone-botao" aria-label="Compartilhar" onClick={compartilhar}><Share2 size={18} /></button>
          <button type="button" className="pv-icone-botao" aria-label="Menu" onClick={() => setDrawerAberto(true)}><Menu size={18} /></button>
        </div>
      </header>

      {drawerAberto && (
        <div className="pv-drawer-fundo" onClick={() => setDrawerAberto(false)}>
          <nav className="pv-drawer" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="pv-drawer-fechar" onClick={() => setDrawerAberto(false)} aria-label="Fechar"><X size={18} /></button>
            {NAV_ITENS.map(({ id, rotulo, Icone }) => (
              <button key={id} type="button" className="pv-drawer-item" onClick={() => irPara(id)}>
                <Icone size={18} /> {rotulo}
              </button>
            ))}
          </nav>
        </div>
      )}

      <section className="pv-hero">
        <div className="pv-hero-topo">
          <div className="pv-hero-foto-col">
            <div className="pv-hero-foto">
              {p.vendedora.fotoUrl
                ? <img src={p.vendedora.fotoUrl} alt={p.vendedora.nome} />
                : <div className="pv-hero-fotoVazia">{p.vendedora.nome.slice(0, 1).toUpperCase()}</div>}
              {p.vendedora.temWhatsapp && <span className="pv-disponivel"><span className="pv-disponivel-bolha" /> Disponível</span>}
            </div>
          </div>

          <div className="pv-hero-info">
            <div className="pv-selo">Vendedora Oficial {p.marca.nome}</div>
            <h1 className="pv-nome"><strong>{primeiroNome}</strong>{resto.length > 0 ? ` ${resto.join(' ')}` : ''}</h1>
            {p.vendedora.bio && <p className="pv-bio">{p.vendedora.bio}</p>}

            <div className="pv-stats">
              <div className="pv-stat"><UserRound size={20} /><strong>{p.vendedora.stats.clientesAtivos}+</strong><span>Clientes</span></div>
              <div className="pv-stat"><Package size={20} /><strong>{p.vendedora.stats.pedidosEntregues}+</strong><span>Pedidos</span></div>
              <div className="pv-stat"><Sparkles size={20} /><strong>{p.vendedora.stats.colecoesLancadas}</strong><span>Coleções</span></div>
              {p.vendedora.statAvaliacao != null && <div className="pv-stat"><Star size={20} /><strong>{p.vendedora.statAvaliacao.toFixed(1)}</strong><span>Avaliação</span></div>}
            </div>

            <div className="pv-pilares">
              <span>Atacado e varejo</span>
              <span>Envio rápido</span>
              <span>Suporte dedicado</span>
            </div>
          </div>
        </div>

        {/* Fora da coluna estreita da foto — mesma largura total da lista de ações abaixo.
            "Perfil" (compartilhar) sempre aparece, mesmo sem WhatsApp conectado. */}
        <div className="pv-contato-btns">
          {p.vendedora.temWhatsapp && (
            <button type="button" className="pv-btn-primario" disabled={contatando !== null} onClick={() => contatar('whatsapp')}>
              <IconeWhatsApp size={18} /> {contatando === 'whatsapp' ? 'Abrindo…' : 'Falar no WhatsApp'}
            </button>
          )}
          {p.vendedora.temWhatsapp && (
            <button type="button" className="pv-btn-secundario" disabled={contatando !== null} onClick={() => contatar('ligar')}>
              <Phone size={18} /> {contatando === 'ligar' ? 'Abrindo…' : 'Ligar'}
            </button>
          )}
          <button type="button" className="pv-btn-secundario" onClick={compartilhar}>
            <Share2 size={18} /> Perfil
          </button>
        </div>

        <div className="pv-acoes">
          <button type="button" className="pv-btn-secundario" onClick={() => navigate(`/${vendSlug}/catalogo`)}><ShoppingBag size={18} /> Vitrine Virtual</button>
          <button type="button" className="pv-btn-secundario" onClick={() => setMeusPedidosAberto('fechados')}><Package size={18} /> Pedidos</button>
          <button type="button" className="pv-btn-secundario pv-btn-full" onClick={() => setMeusPedidosAberto('abertos')}><ShoppingCart size={18} /> Carrinho</button>
        </div>
      </section>

      <section className="pv-colecoes-secao">
        <div className="pv-colecoes-cabec">
          <h2>{p.marca.nome} — coleções em destaque</h2>
        </div>
        {colecoesDestaque.length === 0 && <div className="pv-vazio-secao">Nenhuma coleção disponível ainda.</div>}
        <div className="pv-grid">
          {colecoesDestaque.map((c) => {
            const foto = c.produtos[0]?.fotos?.[0]
            return (
              <button
                key={c.id} type="button" className="pv-cardColecao" onClick={() => navigate(`/${vendSlug}/catalogo`)}
                style={foto ? undefined : { background: arteAbstrata(c.nome) }}
              >
                {foto && <img src={foto} alt={c.nome} />}
                <span className="pv-cardColecao-nome">{c.nome}{c.outlet && ' · Outlet'}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="pv-faixa">
        <div className="pv-faixaItem"><Gift size={20} /><div>Novidades<br />Exclusivas</div></div>
        <div className="pv-faixaItem"><Megaphone size={20} /><div>Condições<br />Especiais</div></div>
        <div className="pv-faixaItem"><Truck size={20} /><div>Envio Rápido<br />e Seguro</div></div>
        <div className="pv-faixaItem"><Headphones size={20} /><div>Atendimento<br />Personalizado</div></div>
      </section>

      {p.vendedora.totalAvaliacoes > 0 && (
        <section className="pv-colecoes-secao">
          <div className="pv-colecoes-cabec">
            <h2>Avaliações</h2>
            <button type="button" className="pv-avaliar-link" onClick={() => setAvaliacaoAberta(true)}>Avaliar</button>
          </div>
          <div className="pv-avaliacoes-resumo">
            <strong>{(p.vendedora.statAvaliacao ?? 0).toFixed(1)}</strong>
            <div>
              <div className="pv-estrelas">{'★'.repeat(Math.round(p.vendedora.statAvaliacao ?? 0))}{'☆'.repeat(5 - Math.round(p.vendedora.statAvaliacao ?? 0))}</div>
              <span>Baseado em {p.vendedora.totalAvaliacoes} avaliaç{p.vendedora.totalAvaliacoes === 1 ? 'ão' : 'ões'}</span>
            </div>
          </div>
          <div className="pv-depoimentos">
            {(depoimentosExpandidos ? (todosDepoimentos ?? p.vendedora.depoimentos) : p.vendedora.depoimentos).map((d, i) => (
              <div className="pv-depoimento" key={i}>
                <div className="pv-estrelas">{'★'.repeat(d.nota)}{'☆'.repeat(5 - d.nota)}</div>
                {d.comentario && <p>&ldquo;{d.comentario}&rdquo;</p>}
                <span>{d.nomeCliente || 'Cliente'}</span>
              </div>
            ))}
          </div>
          {!depoimentosExpandidos && p.vendedora.totalAvaliacoes > p.vendedora.depoimentos.length && (
            <button type="button" className="pv-avaliar-link" style={{ marginTop: 10 }} disabled={carregandoDepoimentos} onClick={verMaisDepoimentos}>
              {carregandoDepoimentos ? 'Carregando…' : `Ver mais avaliações (${p.vendedora.totalAvaliacoes})`}
            </button>
          )}
          {depoimentosExpandidos && (
            <button type="button" className="pv-avaliar-link" style={{ marginTop: 10 }} onClick={() => setDepoimentosExpandidos(false)}>Recolher</button>
          )}
        </section>
      )}
      {p.vendedora.totalAvaliacoes === 0 && (
        <div className="pv-cta-avaliar">
          <button type="button" className="pv-btn-secundario" onClick={() => setAvaliacaoAberta(true)}><Star size={18} /> Avaliar atendimento</button>
        </div>
      )}

      <nav className="pv-bottom-nav">
        {NAV_ITENS.map(({ id, rotulo, Icone }) => (
          <button key={id} type="button" className={`pv-nav-item${id === 'perfil' ? ' ativo' : ''}`} onClick={() => irPara(id)}>
            <span className="pv-nav-icone">
              {id === 'perfil' ? (
                <>
                  <User size={18} fill={paletaAtual.acentoTexto} />
                  <span className="pv-nav-icone-rotulo">{rotulo}</span>
                </>
              ) : (
                <Icone size={20} />
              )}
            </span>
            {id !== 'perfil' && rotulo}
          </button>
        ))}
      </nav>

      {avaliacaoAberta && <ModalAvaliacao redeSlug={redeSlug!} vendSlug={vendSlug!} onClose={() => setAvaliacaoAberta(false)} />}
      {meusPedidosAberto && (
        <MeusPedidos redeSlug={redeSlug!} vendSlug={vendSlug!} abaInicial={meusPedidosAberto} acento={paletaAtual.acento} onClose={() => setMeusPedidosAberto(null)} />
      )}

      <footer className="pv-rodape">{p.marca.nome} · powered by ZAIEZE</footer>
    </div>
  )
}

/** Formulário público (sem login) pra cliente avaliar o atendimento — nota 1-5 + comentário curto
 *  + WhatsApp opcional (só pra casar com o cadastro dela no Funil; nunca aparece no depoimento). */
function ModalAvaliacao({ redeSlug, vendSlug, onClose }: { redeSlug: string; vendSlug: string; onClose: () => void }) {
  const [nota, setNota] = useState(0)
  const [notaHover, setNotaHover] = useState(0)
  const [comentario, setComentario] = useState('')
  const [nomeCliente, setNomeCliente] = useState('')
  const [telefone, setTelefone] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar() {
    if (nota === 0) { setErro('Escolha de 1 a 5 estrelas.'); return }
    setErro(''); setEnviando(true)
    try {
      await api.post(`/catalogo/publico/${redeSlug}/${vendSlug}/avaliacao`, {
        nota, comentario: comentario.trim() || undefined, nomeCliente: nomeCliente.trim() || undefined, telefone: telefone.trim() || undefined,
      })
      setEnviado(true)
    } catch {
      setErro('Não deu pra enviar agora. Tente de novo em alguns minutos.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pv-modal-fundo" onClick={onClose}>
      <div className="pv-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="pv-modal-fechar" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        {enviado ? (
          <>
            <h3 className="pv-modal-nome">Obrigado!</h3>
            <p className="pv-modal-vazio">Sua avaliação foi enviada e vai aparecer aqui assim que for aprovada.</p>
          </>
        ) : (
          <>
            <h3 className="pv-modal-nome">Avalie o atendimento</h3>
            <div className="pv-estrelas-input">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
                  onClick={() => setNota(n)} onMouseEnter={() => setNotaHover(n)} onMouseLeave={() => setNotaHover(0)}>
                  {(notaHover || nota) >= n ? '★' : '☆'}
                </button>
              ))}
            </div>
            <textarea className="pv-avaliacao-textarea" placeholder="Conte rapidinho como foi o atendimento (opcional)"
              maxLength={400} rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
            <input className="pv-avaliacao-input" placeholder="Seu nome (opcional)" maxLength={80}
              value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)} />
            <input className="pv-avaliacao-input" placeholder="Seu WhatsApp (opcional)" maxLength={20}
              value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            <small className="pv-avaliacao-dica">Se você já é cliente, informar o WhatsApp deixa sua avaliação visível também pra ela no atendimento.</small>
            {erro && <p className="pv-modal-vazio" style={{ color: '#e5484d' }}>{erro}</p>}
            <button type="button" className="pv-modal-enviar" disabled={enviando} onClick={enviar}>
              {enviando ? 'Enviando…' : 'Enviar avaliação'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function PerfilVendedoraEstilos() {
  return (
    <style>{`
      .pv-root {
        background: var(--pv-fundo); min-height: 100vh; color: var(--pv-texto);
        font-family: var(--leitura); letter-spacing: 0.01em; padding-bottom: 64px;
      }
      .pv-root h1, .pv-root h2, .pv-root h3 { font-family: var(--leitura); font-weight: 600; letter-spacing: 0.02em; }
      .pv-vazio { max-width: 700px; margin: 80px auto; text-align: center; color: var(--pv-texto-suave, #999); padding: 0 16px; }

      .pv-topo {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 24px; border-bottom: 1px solid var(--pv-borda);
        position: sticky; top: 0; background: color-mix(in srgb, var(--pv-fundo) 90%, transparent); backdrop-filter: blur(6px); z-index: 20;
      }
      .pv-marca-logo { height: 32px; max-width: 160px; object-fit: contain; }
      .pv-marca-nome { font-family: var(--marca); font-size: 20px; letter-spacing: 0.04em; color: var(--pv-texto); }
      .pv-topo-acoes { display: flex; gap: 8px; }
      .pv-icone-botao {
        width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: transparent; border: 1px solid var(--pv-borda); color: var(--pv-texto); cursor: pointer;
      }
      .pv-icone-botao:hover { background: color-mix(in srgb, var(--pv-fundo) 94%, var(--pv-mistura) 6%); }

      .pv-drawer-fundo { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 60; display: flex; justify-content: flex-end; }
      .pv-drawer { width: 260px; background: color-mix(in srgb, var(--pv-fundo) 92%, var(--pv-mistura) 8%); height: 100%; padding: 20px; display: flex; flex-direction: column; gap: 4px; border-left: 1px solid var(--pv-borda); }
      .pv-drawer-fechar { align-self: flex-end; background: none; border: none; color: var(--pv-texto-suave); cursor: pointer; margin-bottom: 12px; }
      .pv-drawer-item { display: flex; align-items: center; gap: 12px; background: none; border: none; color: var(--pv-texto); text-align: left; padding: 12px 8px; border-radius: 8px; font-size: 15px; cursor: pointer; }
      .pv-drawer-item:hover { background: color-mix(in srgb, var(--pv-fundo) 94%, var(--pv-mistura) 6%); }

      .pv-hero { max-width: 1100px; margin: 0 auto; padding: 32px 24px 8px; }
      .pv-hero-topo { display: grid; grid-template-columns: 340px 1fr; gap: 40px; }
      .pv-hero-foto-col { display: flex; flex-direction: column; gap: 12px; }
      .pv-hero-foto { position: relative; border-radius: 16px; overflow: hidden; aspect-ratio: 9/16; background: color-mix(in srgb, var(--pv-fundo) 90%, var(--pv-mistura) 10%); border: 1px solid var(--pv-borda); }
      /* Contato (WhatsApp/Ligar/Perfil) fora da coluna da foto, largura total do hero, 3 colunas iguais */
      .pv-contato-btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 28px; }
      .pv-contato-btns .pv-btn-primario, .pv-contato-btns .pv-btn-secundario { justify-content: center; padding-left: 8px; padding-right: 8px; white-space: normal; text-align: center; }
      .pv-hero-foto img { width: 100%; height: 100%; object-fit: cover; object-position: center 25%; display: block; }
      .pv-hero-fotoVazia { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 64px; font-weight: 800; color: var(--pv-texto-suave); }
      .pv-disponivel { position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 6px; background: rgba(10,10,10,0.72); padding: 6px 12px; border-radius: 999px; font-size: 12px; color: #eee; }
      .pv-disponivel-bolha { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }

      .pv-hero-info { display: flex; flex-direction: column; justify-content: center; }
      .pv-selo { color: var(--pv-acento, #c9a25f); font-size: 12px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
      .pv-nome { font-size: 40px; margin: 8px 0 0; line-height: 1.1; font-weight: 300; }
      .pv-nome strong { font-weight: 800; }
      .pv-bio { color: var(--pv-texto-suave); font-size: 13px; line-height: 1.6; margin: 18px 0 0; max-width: 480px; }

      .pv-stats { display: flex; gap: 36px; margin-top: 26px; flex-wrap: wrap; }
      .pv-stat { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; color: var(--pv-acento, #c9a25f); }
      .pv-stat strong { font-size: 22px; color: var(--pv-texto); font-weight: 800; }
      .pv-stat span { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--pv-texto-suave); }

      .pv-pilares { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
      .pv-pilares span { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--pv-borda); color: var(--pv-texto-suave); }

      /* Grade uniforme (2 colunas de largura igual) — antes era flex-wrap, que deixava as larguras
         desiguais conforme o tamanho do texto de cada botão. */
      .pv-acoes { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
      .pv-btn-full { grid-column: 1 / -1; }
      .pv-btn-primario, .pv-btn-secundario { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 22px; border-radius: 6px; font-size: 14px; font-weight: 700; letter-spacing: 0.03em; text-decoration: none; cursor: pointer; border: none; }
      .pv-btn-primario { background: var(--pv-acento, #c9a25f); color: var(--pv-acento-texto, #14100a); }
      .pv-btn-secundario { background: transparent; border: 1px solid var(--pv-borda); color: var(--pv-texto); }
      .pv-btn-secundario:hover { background: color-mix(in srgb, var(--pv-fundo) 94%, var(--pv-mistura) 6%); }

      .pv-colecoes-secao { max-width: 1100px; margin: 44px auto 0; padding: 0 24px; }
      .pv-colecoes-cabec { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .pv-colecoes-cabec h2 { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; margin: 0; }
      .pv-vazio-secao { color: var(--pv-texto-suave); font-size: 14px; padding: 12px 0 24px; }
      .pv-avaliar-link { background: none; border: none; color: var(--pv-acento, #c9a25f); font-size: 12px; font-weight: 700; cursor: pointer; padding: 0; }

      .pv-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
      .pv-cardColecao { position: relative; aspect-ratio: 4/2.7; border-radius: 3px; overflow: hidden; background: color-mix(in srgb, var(--pv-fundo) 90%, var(--pv-mistura) 10%); cursor: pointer; padding: 0; display: block; border: none; box-shadow: none; }
      .pv-cardColecao img { width: 100%; height: 100%; object-fit: cover; display: block; filter: brightness(0.72); }
      .pv-cardColecao::after { content: ''; position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0.6) 100%); }
      .pv-cardColecao-nome { position: absolute; z-index: 2; inset: 0; padding: 10px; display: flex; align-items: center; justify-content: center; text-align: center; font-family: var(--fonte-editorial); font-size: 15px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: #f5f1e8; line-height: 1.3; }

      .pv-faixa { max-width: 1100px; margin: 40px auto 0; padding: 22px 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; border-top: 1px solid var(--pv-borda); border-bottom: 1px solid var(--pv-borda); }
      .pv-faixaItem { display: flex; align-items: center; gap: 10px; color: var(--pv-acento, #c9a25f); font-size: 12px; font-weight: 700; line-height: 1.3; }
      .pv-faixaItem div { color: var(--pv-texto-suave); }

      .pv-avaliacoes-resumo { display: flex; align-items: center; gap: 16px; padding: 16px; background: color-mix(in srgb, var(--pv-fundo) 90%, var(--pv-mistura) 10%); border: 1px solid var(--pv-borda); border-radius: 12px; margin-bottom: 14px; }
      .pv-avaliacoes-resumo > strong { font-size: 34px; font-family: var(--leitura); }
      .pv-avaliacoes-resumo span { display: block; font-size: 12px; color: var(--pv-texto-suave); margin-top: 2px; }
      .pv-estrelas { color: var(--pv-acento, #c9a25f); font-size: 15px; letter-spacing: 1px; }
      .pv-depoimentos { display: flex; flex-direction: column; gap: 10px; }
      .pv-depoimento { padding: 12px 14px; background: color-mix(in srgb, var(--pv-fundo) 90%, var(--pv-mistura) 10%); border: 1px solid var(--pv-borda); border-radius: 10px; }
      .pv-depoimento p { margin: 6px 0; font-size: 14px; color: var(--pv-texto-suave); line-height: 1.5; }
      .pv-depoimento span { font-size: 12px; color: var(--pv-texto-suave); font-weight: 600; }

      .pv-cta-avaliar { max-width: 1100px; margin: 30px auto 0; padding: 0 24px; }

      .pv-modal-fundo { position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 70; padding: 16px; }
      .pv-modal { background: color-mix(in srgb, var(--pv-fundo) 88%, var(--pv-mistura) 12%); border: 1px solid var(--pv-borda); border-radius: 16px; padding: 28px; width: min(400px, 100%); max-height: 88vh; overflow-y: auto; position: relative; text-align: center; color: var(--pv-texto); }
      .pv-modal-fechar { position: absolute; top: 14px; right: 14px; background: none; border: none; color: var(--pv-texto-suave); cursor: pointer; }
      .pv-modal-nome { margin: 0 0 18px; font-size: 18px; }
      .pv-modal-vazio { color: var(--pv-texto-suave); font-size: 13px; }
      .pv-estrelas-input { display: flex; gap: 6px; justify-content: center; margin: 4px 0 16px; }
      .pv-estrelas-input button { background: none; border: none; color: var(--pv-acento, #c9a25f); font-size: 32px; line-height: 1; cursor: pointer; padding: 2px; }
      .pv-avaliacao-textarea, .pv-avaliacao-input { width: 100%; background: var(--pv-fundo); border: 1px solid var(--pv-borda); border-radius: 8px; color: var(--pv-texto); padding: 10px 12px; font-size: 14px; font-family: inherit; margin-bottom: 10px; resize: vertical; }
      .pv-avaliacao-dica { display: block; color: var(--pv-texto-suave); font-size: 11px; margin: -4px 0 12px; text-align: left; }
      .pv-modal-enviar { width: 100%; border: none; padding: 12px 14px; border-radius: 10px; background: var(--pv-acento, #c9a25f); color: var(--pv-acento-texto, #14100a); font-size: 14px; font-weight: 700; cursor: pointer; }

      .pv-tab { flex: 1; background: none; border: 1px solid var(--pv-borda); border-radius: 8px; padding: 8px; color: var(--pv-texto-suave); font-size: 12px; font-weight: 700; cursor: pointer; }
      .pv-tab.ativa { background: color-mix(in srgb, var(--pv-fundo) 94%, var(--pv-mistura) 6%); }
      .pv-pedidoItem { background: color-mix(in srgb, var(--pv-fundo) 94%, var(--pv-mistura) 6%); border: 1px solid var(--pv-borda); border-radius: 10px; padding: 12px 14px; color: var(--pv-texto); }

      .pv-rodape { text-align: center; font-size: 12px; color: var(--pv-texto-suave); padding: 32px 16px 16px; }

      .pv-bottom-nav { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 45; background: color-mix(in srgb, var(--pv-fundo) 92%, var(--pv-mistura) 8%); border-top: 1px solid var(--pv-borda); padding: 8px 4px calc(8px + env(safe-area-inset-bottom, 0)); }
      .pv-nav-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; color: var(--pv-texto-suave); font-size: 11px; padding: 6px 2px; cursor: pointer; }
      .pv-nav-item.ativo { color: var(--pv-acento, #c9a25f); font-weight: 700; }
      .pv-nav-icone { display: flex; }
      .pv-nav-item.ativo .pv-nav-icone {
        width: 50px; height: 50px; margin-top: -27px; border-radius: 50%; flex-direction: column; gap: 1px;
        align-items: center; justify-content: center; background: var(--pv-acento, #c9a25f); color: var(--pv-acento-texto, #fff);
        border: 1px solid var(--pv-borda); box-shadow: 0 0 26px 8px color-mix(in srgb, var(--pv-acento, #c9a25f) 45%, transparent), 0 6px 16px rgba(0,0,0,0.4);
      }
      .pv-nav-icone-rotulo { color: var(--pv-acento-texto, #000); font-size: 8px; font-weight: 700; line-height: 1; }

      @media (max-width: 860px) {
        .pv-hero { padding: 20px 16px 8px; }
        .pv-hero-topo { grid-template-columns: 34% 1fr; gap: 14px; align-items: start; }
        .pv-hero-foto { aspect-ratio: 9/16; border-radius: 12px; }
        .pv-hero-fotoVazia { font-size: 36px; }
        .pv-disponivel { left: 6px; bottom: 6px; padding: 4px 8px; gap: 4px; font-size: 10px; }
        .pv-selo { font-size: 10px; }
        .pv-nome { font-size: 19px; margin-top: 4px; }
        .pv-bio { font-size: 11px; line-height: 1.5; margin-top: 10px; }
        .pv-stats { gap: 10px 18px; margin-top: 12px; }
        .pv-stat strong { font-size: 15px; }
        .pv-stat span { font-size: 8.5px; }
        .pv-pilares { margin-top: 10px; gap: 6px; }
        .pv-pilares span { font-size: 9.5px; padding: 4px 8px; }
        .pv-hero-foto-col { gap: 8px; }
        .pv-contato-btns { gap: 6px; }
        .pv-acoes { gap: 6px; margin-top: 10px; }
        .pv-btn-primario, .pv-btn-secundario { padding: 10px 8px; font-size: 11px; gap: 5px; white-space: nowrap; }
        .pv-grid { grid-template-columns: repeat(2, 1fr); gap: 7px; }
        .pv-cardColecao-nome { padding: 6px; font-size: 10px; letter-spacing: 0.06em; line-height: 1.25; }
        .pv-faixa { grid-template-columns: repeat(2, 1fr); }
        .pv-colecoes-secao { margin-top: 28px; padding: 0 16px; }
        .pv-topo { padding: 12px 16px; }
      }
    `}</style>
  )
}

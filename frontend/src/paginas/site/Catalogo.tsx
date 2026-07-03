import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api'
import { HOST } from '../../host'
import AgenteLoja from './AgenteLoja'

interface Variacao { cor: string; estampa: string; tamanho: string; estoque: number }
interface Produto {
  id: string; nome: string; descricao?: string | null; referencia?: string | null
  genero: string; pesoGramas?: number | null; loteMinimo: number
  preco: number; precoVarejo: number; precoAtacado: number | null
  outlet?: boolean; descontoPct?: number | null; precoOriginal?: number | null
  fotos: string[]; fotosPorCor?: Record<string, string[]>; videos: string[]; categoria: string | null
  cores: string[]; estampas: string[]; tamanhos: string[]; variacoes: Variacao[]; disponivel: boolean
}
interface Colecao { id: string; nome: string; descricao?: string | null; outlet?: boolean; produtos: Produto[] }
interface Catalogo {
  marca: { nome: string; logoUrl: string | null; bannerUrl: string | null; corPrimaria: string; corSecundaria: string }
  loja: { nome: string }
  vendedora: { nome: string; primeiroNome: string; fotoUrl: string | null; bio: string | null; temWhatsapp: boolean }
  pedidoMinimoAtacado?: number
  colecoes: Colecao[]
}

type Modo = 'ATACADO' | 'VAREJO'
interface ItemCarrinho {
  chave: string; produtoId: string; nome: string; cor: string; estampa: string; tamanho: string
  modo: Modo; precoUnit: number; economiaUnit: number; qtd: number; loteMinimo: number
  pesoGramas: number; estoque: number; foto?: string
}

const real = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
/** Iniciais (até 2) para o avatar da vendedora quando não há foto. */
const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
const PESO_PADRAO = 300 // g por peça quando o produto não tem peso cadastrado
const VOLUME_PECA_L = 0.8 // litros estimados por peça dobrada

export default function Catalogo() {
  const { vendSlug } = useParams<{ vendSlug: string }>()
  const redeSlug = HOST.slug
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [erro, setErro] = useState('')
  const [detalhe, setDetalhe] = useState<Produto | null>(null)
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [verCarrinho, setVerCarrinho] = useState(false)
  const [agente, setAgente] = useState<{ produtoId?: string; produtoNome?: string; resumo?: string } | null>(null)
  const produtosRef = useRef<HTMLDivElement>(null)
  const irProdutos = () => produtosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  useEffect(() => {
    if (!redeSlug || !vendSlug) { setErro('Catálogo não encontrado.'); return }
    api.get(`/catalogo/publico/${redeSlug}/${vendSlug}`)
      .then(({ data }) => setCat(data))
      .catch(() => setErro('Este catálogo não está disponível.'))
  }, [redeSlug, vendSlug])

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
    setVerCarrinho(false)
    setAgente({ resumo })
  }

  if (erro) return <div className="cat-vazio">{erro}</div>
  if (!cat) return <div className="cat-vazio">Carregando…</div>

  const primaria = cat.marca.corPrimaria || '#111111'
  const fundo = cat.marca.corSecundaria || '#ffffff'

  return (
    <div className="cat-root" style={{ '--cat-primaria': primaria, '--cat-fundo': fundo } as CSSProperties}>
      <CatalogoEstilos />

      <header className="cat-perfil">
        {/* Capa (banner da marca; sem banner, mostra a logo/nome sobre a cor da marca) */}
        <div className="cat-capa">
          {cat.marca.bannerUrl
            ? <img src={cat.marca.bannerUrl} alt="" />
            : <div className="cat-capa-marca">
                {cat.marca.logoUrl ? <img src={cat.marca.logoUrl} alt={cat.marca.nome} /> : <span>{cat.marca.nome}</span>}
              </div>}
        </div>

        {/* Foto da vendedora, redonda e sobreposta */}
        <div className="cat-avatar-perfil">
          {cat.vendedora.fotoUrl
            ? <img src={cat.vendedora.fotoUrl} alt={cat.vendedora.primeiroNome} />
            : <span>{iniciais(cat.vendedora.nome)}</span>}
        </div>

        {/* Cartão de perfil: nome + bio + atalhos */}
        <div className="cat-cartao">
          <h1 className="cat-nome-perfil">{cat.vendedora.nome} <span className="cat-sep">|</span> {cat.marca.nome}</h1>
          {cat.vendedora.bio && <p className="cat-bio">{cat.vendedora.bio}</p>}
          <div className="cat-atalhos">
            <button type="button" className="cat-atalho" onClick={irProdutos}>✨ Novidades</button>
            <button type="button" className="cat-atalho" onClick={irProdutos}>👗 Coleções</button>
            <button type="button" className="cat-atalho cat-atalho-full" onClick={() => setAgente({})}>💬 Falar com {cat.vendedora.primeiroNome}</button>
          </div>
        </div>
      </header>

      <div ref={produtosRef} />
      {cat.colecoes.length === 0 && <div className="cat-vazio">Em breve, novidades por aqui. ✨</div>}

      {cat.colecoes.map((c) => (
        <section key={c.id} className="cat-secao">
          <h2 className="cat-secao-titulo">{c.nome}{c.outlet && <span className="cat-outlet-tag">Outlet</span>}</h2>
          {c.descricao && <p className="cat-secao-desc">{c.descricao}</p>}
          <div className="cat-grid">
            {c.produtos.map((p) => (
              <button key={p.id} className="cat-card" onClick={() => setDetalhe(p)}>
                <div className="cat-foto">
                  {p.fotos?.[0]
                    ? <img src={p.fotos[0]} alt={p.nome} loading="lazy" />
                    : <div className="cat-foto-vazia">{p.nome}</div>}
                  {p.videos?.length > 0 && <span className="cat-video-badge">▶ vídeo</span>}
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

      {detalhe && <DetalheProduto produto={detalhe} onFechar={() => setDetalhe(null)} onAdicionar={adicionar} />}

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

      {/* CTA fixo — abre a Vendedora Online (Agente 2) */}
      {carrinho.length === 0 && !verCarrinho && (
        <button className="cat-cta-fixo" onClick={() => setAgente({})}>💬 Falar com {cat.vendedora.primeiroNome}</button>
      )}

      {agente && (
        <AgenteLoja
          redeSlug={redeSlug!} vendSlug={vendSlug!}
          marcaNome={cat.marca.nome} vendedora={cat.vendedora.primeiroNome}
          pedidoMinimoAtacado={cat.pedidoMinimoAtacado}
          produtoId={agente.produtoId} produtoNome={agente.produtoNome} resumoInicial={agente.resumo}
          onClose={() => setAgente(null)}
        />
      )}

      <footer className="cat-rodape">{cat.marca.nome} · powered by ZAIEZE</footer>
    </div>
  )
}

// ─────────────────────────── Detalhe da peça (galeria + zoom + compra) ───────────────────────────
function DetalheProduto({ produto, onFechar, onAdicionar }: { produto: Produto; onFechar: () => void; onAdicionar: (i: ItemCarrinho) => void }) {
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
      .cat-root { --cat-creme: #f5f0e6; min-height: 100vh; background: var(--cat-fundo); color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; padding-bottom: 96px; }
      .cat-vazio { min-height: 70vh; display: flex; align-items: center; justify-content: center; color: #777; font-family: sans-serif; padding: 40px; text-align: center; }
      /* Cabeçalho estilo perfil: capa (banner) + foto redonda sobreposta + cartão */
      .cat-perfil { max-width: 680px; margin: 0 auto; }
      .cat-capa { position: relative; width: 100%; aspect-ratio: 16 / 7; overflow: hidden; background: var(--cat-primaria, #111); }
      .cat-capa > img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .cat-capa-marca { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
      .cat-capa-marca img { max-height: 70%; max-width: 80%; object-fit: contain; }
      .cat-capa-marca span { color: #fff; font-size: clamp(22px, 7vw, 40px); font-weight: 800; letter-spacing: 2px; text-transform: uppercase; }
      .cat-avatar-perfil { width: 108px; height: 108px; border-radius: 50%; overflow: hidden; margin: -54px auto 0; position: relative; z-index: 2; border: 4px solid var(--cat-fundo, #fff); background: var(--cat-creme); box-shadow: 0 4px 14px #0000002e; display: flex; align-items: center; justify-content: center; }
      .cat-avatar-perfil img { width: 100%; height: 100%; object-fit: cover; }
      .cat-avatar-perfil span { font-size: 36px; font-weight: 800; color: #b6a98e; }
      .cat-cartao { background: var(--cat-fundo, #fff); margin: 10px 14px 0; border-radius: 16px; padding: 14px 18px 18px; text-align: center; box-shadow: 0 6px 20px #0000000f; }
      .cat-nome-perfil { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: .3px; }
      .cat-sep { color: var(--cat-primaria, #111); font-weight: 400; opacity: .55; margin: 0 2px; }
      .cat-bio { margin: 8px auto 0; max-width: 460px; font-size: 13.5px; line-height: 1.5; color: #555; white-space: pre-line; }
      .cat-atalhos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
      .cat-atalho { padding: 11px 12px; border: 1px solid #00000014; background: #00000006; border-radius: 10px; font-size: 13px; font-weight: 600; color: #222; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; }
      .cat-atalho:hover { background: #0000000d; }
      .cat-atalho-full { grid-column: 1 / -1; background: var(--cat-primaria, #111); color: #fff; border-color: transparent; }
      .cat-atalho-full:hover { filter: brightness(1.08); }
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

      /* CTA / carrinho flutuante */
      .cat-cta-fixo, .cat-cart-fab { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--cat-primaria); color: #fff; border: none; padding: 14px 26px; border-radius: 99px; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 24px #00000033; z-index: 20; }

      /* Modal base */
      .cat-modal-fundo { position: fixed; inset: 0; background: #00000077; display: flex; align-items: flex-end; justify-content: center; z-index: 30; }
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

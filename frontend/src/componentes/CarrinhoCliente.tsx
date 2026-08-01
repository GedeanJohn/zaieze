import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { api, formataReal, mensagemDeErro } from '../api'
import { useLojaAtiva } from './SeletorLoja'
import { useToast } from './Toast'
import { useIdioma } from '../lib/i18n'

type StatusOrc = 'RASCUNHO' | 'AGUARDANDO_APROVACAO_DESCONTO' | 'ENVIADO' | 'ALTERACAO_SOLICITADA' | 'CONVERTIDO' | 'CANCELADO'
const EDITAVEL: StatusOrc[] = ['RASCUNHO', 'AGUARDANDO_APROVACAO_DESCONTO', 'ALTERACAO_SOLICITADA']

interface VariacaoP { id: string; cor: string; estampa: string; tamanho: string; estoque: number; estoqueVarejo: number }
interface ProdutoP { id: string; nome: string; precoVarejo: string; precoAtacado?: string | null; fotos: string[]; variacoes: VariacaoP[] }
interface ItemOrcResp {
  variacaoId: string; quantidade: number; precoUnitario: string
  variacao: { produtoId: string; cor: string; estampa: string; tamanho: string; produto: { nome: string; fotos: string[] } }
}
interface OrcamentoResp { id: string; status: StatusOrc; itens: ItemOrcResp[] }

interface LinhaCarrinho {
  variacaoId: string; produtoId: string; nome: string; foto?: string
  cor: string; estampa: string; tamanho: string; quantidade: number; precoUnitario: number
}

interface Props { clienteId: string; atacado?: boolean; onFechar: () => void }

const ZONA_SOLTAR = 'cz-cart-drop'

/** Estoque disponível pra essa variação no modo de venda atual (a reserva de varejo, ver
 * VariacaoProduto no schema: o atacado só pode usar o restante além do que está reservado). */
function disponivel(v: VariacaoP, atacado: boolean): number {
  return atacado ? v.estoque - v.estoqueVarejo : v.estoqueVarejo
}

/** Usada pelo arrastar-e-soltar: primeira variação com estoque, na ordem em que já vem do backend
 * (cor/tamanho crescente) — atalho rápido; pra escolher uma variação específica, ainda dá pra
 * tocar no produto e abrir a ficha normalmente. */
function primeiraVariacaoDisponivel(produto: ProdutoP, atacado: boolean): VariacaoP | null {
  return produto.variacoes.find((v) => disponivel(v, atacado) > 0) ?? null
}

/** Carrinho do cliente aberto de dentro do Chat Zaieze — edita o mesmo `Orcamento` que a
 * vendedora usaria em Orçamentos/PDV, só que com grade de fotos em vez do formulário de
 * dropdowns (ver Orcamentos.tsx para a lógica de negócio original que isto espelha). */
export default function CarrinhoCliente({ clienteId, atacado, onFechar }: Props) {
  const { t } = useIdioma()
  const avisar = useToast()
  const escopo = useLojaAtiva()

  const [produtos, setProdutos] = useState<ProdutoP[]>([])
  const [busca, setBusca] = useState('')
  const [carregandoProdutos, setCarregandoProdutos] = useState(true)
  const [orcamentoId, setOrcamentoId] = useState<string | null>(null)
  const [orcamentoStatus, setOrcamentoStatus] = useState<StatusOrc | null>(null)
  const [itens, setItens] = useState<LinhaCarrinho[]>([])
  const [produtoAberto, setProdutoAberto] = useState<ProdutoP | null>(null)
  const [salvando, setSalvando] = useState<'idle' | 'salvando' | 'erro'>('idle')
  const [erroSync, setErroSync] = useState('')
  const [arrastando, setArrastando] = useState<ProdutoP | null>(null)

  // Mesma configuração de sensores do Funil de vendas (Pipeline.tsx) — MouseSensor (não
  // PointerSensor) com uma distância mínima antes de ativar, e TouchSensor com delay, pra não
  // brigar com o toque normal de abrir a ficha do produto.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
  const { setNodeRef: setZonaSoltarRef, isOver } = useDroppable({ id: ZONA_SOLTAR })

  const timerBusca = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerSync = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncEmVoo = useRef(false)

  // Hidrata o orçamento editável já existente do cliente (se houver) — não cria nada ainda.
  useEffect(() => {
    if (!escopo.pronto) return
    api.get('/orcamentos', { params: { ...escopo.params, clienteId } })
      .then(({ data }: { data: OrcamentoResp[] }) => {
        const editavel = data.find((o) => EDITAVEL.includes(o.status))
        if (editavel) {
          setOrcamentoId(editavel.id)
          setOrcamentoStatus(editavel.status)
          setItens(editavel.itens.map((i) => ({
            variacaoId: i.variacaoId, produtoId: i.variacao.produtoId, nome: i.variacao.produto.nome,
            foto: i.variacao.produto.fotos?.[0], cor: i.variacao.cor, estampa: i.variacao.estampa, tamanho: i.variacao.tamanho,
            quantidade: i.quantidade, precoUnitario: Number(i.precoUnitario),
          })))
        } else {
          setOrcamentoId(null); setOrcamentoStatus(null); setItens([])
        }
      })
      .catch((err) => avisar(mensagemDeErro(err), 'erro'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, escopo.pronto])

  // Busca de produtos (grade), com debounce.
  useEffect(() => {
    if (!escopo.pronto) return
    if (timerBusca.current) clearTimeout(timerBusca.current)
    setCarregandoProdutos(true)
    timerBusca.current = setTimeout(() => {
      api.get('/produtos', { params: { ...escopo.params, busca, ativo: 'true' } })
        .then(({ data }) => setProdutos(data))
        .catch((err) => avisar(mensagemDeErro(err), 'erro'))
        .finally(() => setCarregandoProdutos(false))
    }, 350)
    return () => { if (timerBusca.current) clearTimeout(timerBusca.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, escopo.pronto])

  const total = useMemo(() => itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0), [itens])

  // Sincroniza a lista inteira (POST se ainda não existe orçamento, PATCH se já existe). Se uma
  // sincronização anterior ainda estiver em voo quando o debounce disparar, reagenda em vez de
  // disparar uma segunda requisição em paralelo — evita criar dois Orcamento duplicados quando o
  // round-trip demora mais que o debounce (rede lenta + duas edições seguidas).
  const sincronizar = useCallback((novaLista: LinhaCarrinho[]) => {
    if (timerSync.current) clearTimeout(timerSync.current)
    const agendar = () => {
      timerSync.current = setTimeout(executar, 600)
    }
    const executar = async () => {
      if (novaLista.length === 0) return // esvaziar é tratado por cancelarOrcamento(), não por aqui
      if (syncEmVoo.current) { agendar(); return }
      syncEmVoo.current = true
      setSalvando('salvando'); setErroSync('')
      const corpo = {
        clienteId, atacado: !!atacado, descontoPct: 0,
        itens: novaLista.map((i) => ({ variacaoId: i.variacaoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario })),
      }
      try {
        if (orcamentoId) {
          const { data } = await api.patch(`/orcamentos/${orcamentoId}`, corpo, { params: escopo.params })
          setOrcamentoStatus(data.status)
        } else {
          const { data } = await api.post('/orcamentos', corpo, { params: escopo.params })
          setOrcamentoId(data.id); setOrcamentoStatus(data.status)
        }
        setSalvando('idle')
      } catch (err) {
        setSalvando('erro'); setErroSync(mensagemDeErro(err))
      } finally {
        syncEmVoo.current = false
      }
    }
    agendar()
  }, [clienteId, atacado, orcamentoId, escopo.params])

  function adicionarItem(produto: ProdutoP, variacao: VariacaoP, quantidade: number) {
    setItens((atual) => {
      const idx = atual.findIndex((i) => i.variacaoId === variacao.id)
      const novo = idx >= 0
        ? atual.map((i, ix) => (ix === idx ? { ...i, quantidade: i.quantidade + quantidade } : i))
        : [...atual, {
            variacaoId: variacao.id, produtoId: produto.id, nome: produto.nome, foto: produto.fotos?.[0],
            cor: variacao.cor, estampa: variacao.estampa, tamanho: variacao.tamanho, quantidade,
            precoUnitario: atacado && produto.precoAtacado ? Number(produto.precoAtacado) : Number(produto.precoVarejo),
          }]
      sincronizar(novo)
      return novo
    })
    setProdutoAberto(null)
  }

  function aoIniciarArrasto(event: DragStartEvent) {
    setArrastando((event.active.data.current?.produto as ProdutoP | undefined) ?? null)
  }

  function aoSoltar(event: DragEndEvent) {
    setArrastando(null)
    const produto = event.active.data.current?.produto as ProdutoP | undefined
    if (!produto || event.over?.id !== ZONA_SOLTAR) return
    const variacao = primeiraVariacaoDisponivel(produto, !!atacado)
    if (!variacao) { avisar(t('caixa.semEstoqueArrastar'), 'erro'); return }
    adicionarItem(produto, variacao, 1)
  }

  function mudarQuantidade(variacaoId: string, delta: number) {
    setItens((atual) => {
      const linha = atual.find((i) => i.variacaoId === variacaoId)
      if (!linha) return atual
      const novaQtd = linha.quantidade + delta
      if (novaQtd < 1) return atual // não zera pelo stepper — a última linha usa "cancelar orçamento"
      const novo = atual.map((i) => (i.variacaoId === variacaoId ? { ...i, quantidade: novaQtd } : i))
      sincronizar(novo)
      return novo
    })
  }

  function removerItem(variacaoId: string) {
    setItens((atual) => {
      if (atual.length <= 1) return atual
      const novo = atual.filter((i) => i.variacaoId !== variacaoId)
      sincronizar(novo)
      return novo
    })
  }

  async function cancelarOrcamento() {
    if (!window.confirm(t('orc.confirmarCancelar'))) return
    if (timerSync.current) clearTimeout(timerSync.current)
    if (orcamentoId) {
      try {
        await api.post(`/orcamentos/${orcamentoId}/cancelar`, {}, { params: escopo.params })
      } catch (err) {
        avisar(mensagemDeErro(err), 'erro')
        return
      }
    }
    setItens([]); setOrcamentoId(null); setOrcamentoStatus(null); setSalvando('idle'); setErroSync('')
  }

  const bloqueado = orcamentoStatus != null && !EDITAVEL.includes(orcamentoStatus)

  return (
    <DndContext sensors={sensors} onDragStart={aoIniciarArrasto} onDragEnd={aoSoltar}>
    <div className="cz-carrinho">
      <div className="cz-cart-topo">
        {produtoAberto ? (
          <button type="button" className="cz-cart-voltar" onClick={() => setProdutoAberto(null)}>{t('caixa.voltarGrade')}</button>
        ) : (
          <input className="cz-cart-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('caixa.buscarProduto')} />
        )}
        <button type="button" className="cz-cart-fechar" onClick={onFechar} aria-label={t('comum.fechar')}>✕</button>
      </div>

      {bloqueado && <div className="cz-cart-alerta">{t('caixa.orcamentoNaoEditavel')}</div>}

      {!bloqueado && (produtoAberto ? (
        <FichaProduto produto={produtoAberto} atacado={!!atacado} onAdicionar={(v, q) => adicionarItem(produtoAberto, v, q)} />
      ) : (
        <div className="cz-cart-grid">
          {carregandoProdutos && <div className="cz-cart-vazio">{t('caixa.carregandoProdutos')}</div>}
          {!carregandoProdutos && produtos.length === 0 && <div className="cz-cart-vazio">{t('caixa.nadaEncontrado')}</div>}
          {produtos.map((p) => (
            <CardProdutoArrastavel key={p.id} produto={p} atacado={!!atacado} onTocar={() => setProdutoAberto(p)} />
          ))}
        </div>
      ))}

      <div ref={setZonaSoltarRef} className={`cz-cart-rodape${isOver ? ' arrastando-sobre' : ''}`}>
        {itens.length === 0 ? (
          <span className="cz-cart-rodape-vazio">{isOver ? t('caixa.soltarAqui') : t('caixa.carrinhoVazio')}</span>
        ) : (
          <div className="cz-cart-itens">
            {itens.map((i) => (
              <div key={i.variacaoId} className="cz-cart-linha">
                {i.foto ? <img src={i.foto} alt="" /> : <div className="cz-cart-semfoto sm" />}
                <div className="cz-cart-linha-info">
                  <strong>{i.nome}</strong>
                  <span>{i.cor}{i.estampa ? ` · ${i.estampa}` : ''} / {i.tamanho}</span>
                </div>
                <div className="cz-cart-qtd">
                  <button type="button" onClick={() => mudarQuantidade(i.variacaoId, -1)} disabled={i.quantidade === 1 && itens.length === 1}>−</button>
                  <span>{i.quantidade}</span>
                  <button type="button" onClick={() => mudarQuantidade(i.variacaoId, 1)}>+</button>
                </div>
                {itens.length === 1 ? (
                  <button type="button" className="cz-cart-cancelar" onClick={cancelarOrcamento}>{t('caixa.cancelarOrcamento')}</button>
                ) : (
                  <button type="button" className="cz-cart-remover" onClick={() => removerItem(i.variacaoId)} aria-label={t('comum.excluir')}>×</button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="cz-cart-total-linha">
          <span>{t('caixa.itensNoCarrinho', { n: itens.length })} · {formataReal(total)}</span>
          {itens.length > 0 && (
            <span className={`cz-cart-status ${salvando}`}>
              {salvando === 'salvando' ? t('caixa.sincronizando') : salvando === 'erro' ? '⚠' : '✓'}
            </span>
          )}
        </div>
        {salvando === 'erro' && <div className="cz-cart-alerta">{erroSync || t('caixa.erroSincronizar')}</div>}
      </div>
    </div>
    {createPortal(
      // Porta pro <body> — o overlay do dnd-kit não se move sozinho pra fora da árvore, e ficando
      // dentro de .cz-conversa (que tem backdrop-filter pro efeito de vidro) o "position: fixed"
      // dele passa a ser relativo a esse ancestral em vez da janela, descolando do cursor ao
      // arrastar. O contexto do React continua funcionando normal através do portal.
      <DragOverlay>
        {arrastando && (
          <div className="cz-cart-card cz-cart-card-fantasma">
            {arrastando.fotos?.[0] ? <img src={arrastando.fotos[0]} alt="" /> : <div className="cz-cart-semfoto" />}
            <span className="cz-cart-card-nome">{arrastando.nome}</span>
          </div>
        )}
      </DragOverlay>,
      document.body,
    )}
    </DndContext>
  )
}

/** Card da grade, arrastável pro carrinho (adiciona a 1ª variação com estoque) — tocar/clicar
 * (sem arrastar) continua abrindo a ficha pra escolher cor/tamanho específicos. */
function CardProdutoArrastavel({ produto, atacado, onTocar }: { produto: ProdutoP; atacado: boolean; onTocar: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `cz-cart-produto-${produto.id}`, data: { produto } })
  return (
    <button
      ref={setNodeRef} {...listeners} {...attributes}
      type="button" className={`cz-cart-card${isDragging ? ' arrastando' : ''}`} onClick={onTocar}
    >
      {produto.fotos?.[0] ? <img src={produto.fotos[0]} alt={produto.nome} /> : <div className="cz-cart-semfoto" />}
      <span className="cz-cart-card-nome">{produto.nome}</span>
      <span className="cz-cart-card-preco">{formataReal(atacado && produto.precoAtacado ? Number(produto.precoAtacado) : Number(produto.precoVarejo))}</span>
    </button>
  )
}

/** Ficha rápida do produto: cor → estampa (se houver) → tamanho, com estoque de varejo/atacado
 * já considerando a reserva (`estoqueVarejo`, ver VariacaoProduto no schema). */
function FichaProduto({ produto, atacado, onAdicionar }: { produto: ProdutoP; atacado: boolean; onAdicionar: (v: VariacaoP, qtd: number) => void }) {
  const { t } = useIdioma()
  const cores = useMemo(() => [...new Set(produto.variacoes.map((v) => v.cor))], [produto.variacoes])
  const [cor, setCor] = useState(cores[0] ?? '')
  const estampas = useMemo(
    () => [...new Set(produto.variacoes.filter((v) => v.cor === cor && v.estampa).map((v) => v.estampa))],
    [produto.variacoes, cor])
  const [estampa, setEstampa] = useState('')
  useEffect(() => { setEstampa(estampas[0] ?? '') }, [cor, estampas])
  const opcoesTamanho = useMemo(
    () => produto.variacoes.filter((v) => v.cor === cor && v.estampa === estampa),
    [produto.variacoes, cor, estampa])
  const [tamanho, setTamanho] = useState('')
  useEffect(() => { setTamanho('') }, [cor, estampa])
  const [qtd, setQtd] = useState(1)
  useEffect(() => { setQtd(1) }, [tamanho])

  const variacaoSel = opcoesTamanho.find((v) => v.tamanho === tamanho)
  const estoqueSel = variacaoSel ? disponivel(variacaoSel, atacado) : 0
  const podeAdicionar = !!variacaoSel && estoqueSel >= qtd

  return (
    <div className="cz-cart-ficha">
      {produto.fotos?.[0] ? <img src={produto.fotos[0]} alt={produto.nome} className="cz-cart-ficha-foto" /> : <div className="cz-cart-semfoto lg" />}
      <strong className="cz-cart-ficha-nome">{produto.nome}</strong>

      {cores.length > 0 && (
        <div className="cz-cart-opcs">
          <span>{t('caixa.cor')}</span>
          <div className="cz-chips">
            {cores.map((c) => <button key={c} type="button" className={c === cor ? 'on' : ''} onClick={() => setCor(c)}>{c}</button>)}
          </div>
        </div>
      )}
      {estampas.length > 0 && (
        <div className="cz-cart-opcs">
          <span>{t('caixa.estampa')}</span>
          <div className="cz-chips">
            {estampas.map((e) => <button key={e} type="button" className={e === estampa ? 'on' : ''} onClick={() => setEstampa(e)}>{e}</button>)}
          </div>
        </div>
      )}
      {opcoesTamanho.length > 0 && (
        <div className="cz-cart-opcs">
          <span>{t('caixa.tamanho')}</span>
          <div className="cz-chips">
            {opcoesTamanho.map((v) => {
              const disp = disponivel(v, atacado)
              return (
                <button key={v.tamanho} type="button" className={v.tamanho === tamanho ? 'on' : ''} disabled={disp <= 0} onClick={() => setTamanho(v.tamanho)}>
                  {v.tamanho}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {variacaoSel && (
        <div className="cz-cart-qtd cz-cart-qtd-ficha">
          <button type="button" onClick={() => setQtd((q) => Math.max(1, q - 1))}>−</button>
          <span>{qtd}</span>
          <button type="button" onClick={() => setQtd((q) => Math.min(estoqueSel, q + 1))} disabled={qtd >= estoqueSel}>+</button>
          <span className="cz-cart-estoque">{t('caixa.emEstoque', { n: estoqueSel })}</span>
        </div>
      )}

      <button
        type="button" className="btn cz-cart-adicionar" disabled={!podeAdicionar}
        onClick={() => variacaoSel && onAdicionar(variacaoSel, qtd)}
      >{t('caixa.adicionar')}</button>
    </div>
  )
}

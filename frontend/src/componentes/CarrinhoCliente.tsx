import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Link2 } from 'lucide-react'
import { api, formataReal, mensagemDeErro } from '../api'
import { useLojaAtiva } from './SeletorLoja'
import { useToast } from './Toast'
import { useIdioma } from '../lib/i18n'

type StatusOrc = 'RASCUNHO' | 'AGUARDANDO_APROVACAO_DESCONTO' | 'ENVIADO' | 'ALTERACAO_SOLICITADA' | 'CONVERTIDO' | 'CANCELADO'
const EDITAVEL: StatusOrc[] = ['RASCUNHO', 'AGUARDANDO_APROVACAO_DESCONTO', 'ALTERACAO_SOLICITADA']
// Status em que o cliente ainda pode estar editando do lado dele (ver EDITAVEL_CLIENTE no
// backend) — enquanto algum desses vale a pena manter o polling ligado pra puxar o que ele mexeu.
const VIVO: StatusOrc[] = ['RASCUNHO', 'AGUARDANDO_APROVACAO_DESCONTO', 'ENVIADO', 'ALTERACAO_SOLICITADA']

export interface VariacaoP { id: string; cor: string; estampa: string; tamanho: string; estoque: number; estoqueVarejo: number }
export interface ProdutoP { id: string; nome: string; precoVarejo: string; precoAtacado?: string | null; fotos: string[]; variacoes: VariacaoP[] }
interface ItemOrcResp {
  variacaoId: string; quantidade: number; precoUnitario: string
  variacao: { produtoId: string; cor: string; estampa: string; tamanho: string; produto: { nome: string; fotos: string[] } }
}
interface OrcamentoResp { id: string; status: StatusOrc; tokenPublico: string; updatedAt: string; itens: ItemOrcResp[] }

interface LinhaCarrinho {
  variacaoId: string; produtoId: string; nome: string; foto?: string
  cor: string; estampa: string; tamanho: string; quantidade: number; precoUnitario: number
}

/** Item que chegou arrastado da conversa (mensagem tipo 'PRODUTO') — só sabemos produto/variação,
 * ainda falta buscar o objeto completo (foto/preço/nome) pra virar uma LinhaCarrinho de verdade. */
export interface ItemPendente { produtoId: string; variacaoId: string }

interface Props {
  clienteId: string; atacado?: boolean; onFechar: () => void
  itemPendente?: ItemPendente | null; onItemPendenteConsumido?: () => void
  /** A mensagem-produto criada pelo envio — o pai (CaixaEntrada) precisa dela pra aparecer na
   * conversa na hora, sem esperar um refetch/polling do thread. */
  onProdutoEnviado?: (mensagem: unknown) => void
}

/** Exposto pro pai (CaixaEntrada) chamar quando um card da grade é solto no rodapé do painel —
 * o `DndContext` mora lá em cima agora (precisa cobrir o botão "Carrinho" do cabeçalho também). */
export interface CarrinhoClienteHandle { adicionarProdutoRapido: (produto: ProdutoP) => void }

export const ZONA_SOLTAR = 'cz-cart-drop'

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
const CarrinhoCliente = forwardRef<CarrinhoClienteHandle, Props>(function CarrinhoCliente(
  { clienteId, atacado, onFechar, itemPendente, onItemPendenteConsumido, onProdutoEnviado }, ref,
) {
  const { t } = useIdioma()
  const avisar = useToast()
  const escopo = useLojaAtiva()

  const [produtos, setProdutos] = useState<ProdutoP[]>([])
  const [busca, setBusca] = useState('')
  const [carregandoProdutos, setCarregandoProdutos] = useState(true)
  const [orcamentoId, setOrcamentoId] = useState<string | null>(null)
  const [orcamentoStatus, setOrcamentoStatus] = useState<StatusOrc | null>(null)
  const [tokenPublico, setTokenPublico] = useState<string | null>(null)
  const [orcamentoUpdatedAt, setOrcamentoUpdatedAt] = useState<string | null>(null)
  const [itens, setItens] = useState<LinhaCarrinho[]>([])
  const [produtoAberto, setProdutoAberto] = useState<ProdutoP | null>(null)
  const [salvando, setSalvando] = useState<'idle' | 'salvando' | 'erro'>('idle')
  const [erroSync, setErroSync] = useState('')
  const [hidratado, setHidratado] = useState(false)

  // O DndContext (sensores + overlay) mora em CaixaEntrada.tsx agora — precisa cobrir o botão
  // "Carrinho" do cabeçalho também, que fica fora deste componente. Aqui só ficam os hooks de
  // useDraggable/useDroppable, que funcionam em qualquer profundidade dentro do contexto do pai.
  const { setNodeRef: setZonaSoltarRef, isOver } = useDroppable({ id: ZONA_SOLTAR })

  const timerBusca = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerSync = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncEmVoo = useRef(false)

  // Hidrata o orçamento editável já existente do cliente (se houver) — não cria nada ainda.
  useEffect(() => {
    if (!escopo.pronto) return
    setHidratado(false)
    api.get('/orcamentos', { params: { ...escopo.params, clienteId } })
      .then(({ data }: { data: OrcamentoResp[] }) => {
        const editavel = data.find((o) => EDITAVEL.includes(o.status))
        if (editavel) {
          setOrcamentoId(editavel.id)
          setOrcamentoStatus(editavel.status)
          setTokenPublico(editavel.tokenPublico)
          setOrcamentoUpdatedAt(editavel.updatedAt)
          setItens(editavel.itens.map((i) => ({
            variacaoId: i.variacaoId, produtoId: i.variacao.produtoId, nome: i.variacao.produto.nome,
            foto: i.variacao.produto.fotos?.[0], cor: i.variacao.cor, estampa: i.variacao.estampa, tamanho: i.variacao.tamanho,
            quantidade: i.quantidade, precoUnitario: Number(i.precoUnitario),
          })))
        } else {
          setOrcamentoId(null); setOrcamentoStatus(null); setTokenPublico(null); setOrcamentoUpdatedAt(null); setItens([])
        }
      })
      .catch((err) => avisar(mensagemDeErro(err), 'erro'))
      .finally(() => setHidratado(true))
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

  // Puxa o que o cliente mexeu do lado dele (link público, ver OrcamentoPublico.tsx) — mesmo
  // padrão de polling condicional já usado em LookProvador.tsx (setInterval + status "vivo").
  // Pula o merge se houver uma sincronização local em voo ou agendada, pra não sobrescrever o que
  // a vendedora acabou de digitar.
  useEffect(() => {
    if (!hidratado || !orcamentoId || !orcamentoStatus || !VIVO.includes(orcamentoStatus)) return
    const intervalo = setInterval(() => {
      if (syncEmVoo.current || timerSync.current) return
      api.get(`/orcamentos/${orcamentoId}`, { params: escopo.params })
        .then(({ data }: { data: OrcamentoResp }) => {
          if (data.updatedAt === orcamentoUpdatedAt) return
          setOrcamentoStatus(data.status); setOrcamentoUpdatedAt(data.updatedAt); setTokenPublico(data.tokenPublico)
          setItens(data.itens.map((i) => ({
            variacaoId: i.variacaoId, produtoId: i.variacao.produtoId, nome: i.variacao.produto.nome,
            foto: i.variacao.produto.fotos?.[0], cor: i.variacao.cor, estampa: i.variacao.estampa, tamanho: i.variacao.tamanho,
            quantidade: i.quantidade, precoUnitario: Number(i.precoUnitario),
          })))
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(intervalo)
  }, [hidratado, orcamentoId, orcamentoStatus, orcamentoUpdatedAt, escopo.params])

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
        expectedUpdatedAt: orcamentoId ? orcamentoUpdatedAt ?? undefined : undefined,
      }
      try {
        if (orcamentoId) {
          const { data } = await api.patch(`/orcamentos/${orcamentoId}`, corpo, { params: escopo.params })
          setOrcamentoStatus(data.status); setOrcamentoUpdatedAt(data.updatedAt); setTokenPublico(data.tokenPublico)
        } else {
          const { data } = await api.post('/orcamentos', corpo, { params: escopo.params })
          setOrcamentoId(data.id); setOrcamentoStatus(data.status); setOrcamentoUpdatedAt(data.updatedAt); setTokenPublico(data.tokenPublico)
        }
        setSalvando('idle')
      } catch (err: unknown) {
        const resp = (err as { response?: { status?: number; data?: { orcamento?: OrcamentoResp } } }).response
        if (resp?.status === 409 && resp.data?.orcamento) {
          const fresco = resp.data.orcamento
          setOrcamentoStatus(fresco.status); setOrcamentoUpdatedAt(fresco.updatedAt); setTokenPublico(fresco.tokenPublico)
          setItens(fresco.itens.map((i) => ({
            variacaoId: i.variacaoId, produtoId: i.variacao.produtoId, nome: i.variacao.produto.nome,
            foto: i.variacao.produto.fotos?.[0], cor: i.variacao.cor, estampa: i.variacao.estampa, tamanho: i.variacao.tamanho,
            quantidade: i.quantidade, precoUnitario: Number(i.precoUnitario),
          })))
          setSalvando('idle')
          avisar(t('caixa.clienteAlterouOrcamento'), 'erro')
        } else {
          setSalvando('erro'); setErroSync(mensagemDeErro(err))
        }
      } finally {
        syncEmVoo.current = false
      }
    }
    agendar()
  }, [clienteId, atacado, orcamentoId, orcamentoUpdatedAt, escopo.params, avisar, t])

  const [enviandoChat, setEnviandoChat] = useState(false)

  // Manda a foto do produto pro WhatsApp de verdade do cliente (fora do Orçamento) — ele valida
  // respondendo, e a vendedora arrasta o card dessa mensagem até o Carrinho depois (ver BolhaMensagem
  // em CaixaEntrada.tsx). Fecha a ficha só quando o envio dá certo, pra poder tentar de novo no erro.
  async function enviarProdutoNoChat(produto: ProdutoP, variacao: VariacaoP) {
    setEnviandoChat(true)
    try {
      const { data } = await api.post(`/whatsapp/conversas/${clienteId}/produto`, { produtoId: produto.id, variacaoId: variacao.id }, { params: escopo.params })
      onProdutoEnviado?.(data)
      avisar(t('caixa.produtoEnviado'), 'sucesso')
      setProdutoAberto(null)
    } catch (err) {
      avisar(mensagemDeErro(err) || t('caixa.erroEnviarProduto'), 'erro')
    } finally {
      setEnviandoChat(false)
    }
  }

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

  // Chamado pelo pai quando um card da grade é solto no rodapé do painel (ZONA_SOLTAR) — pega a
  // 1ª variação com estoque, mesmo atalho de sempre (escolher variação específica ainda passa
  // pela ficha normal).
  function adicionarProdutoRapido(produto: ProdutoP) {
    const variacao = primeiraVariacaoDisponivel(produto, !!atacado)
    if (!variacao) { avisar(t('caixa.semEstoqueArrastar'), 'erro'); return }
    adicionarItem(produto, variacao, 1)
  }

  useImperativeHandle(ref, () => ({ adicionarProdutoRapido }))

  // Item que chegou arrastado de uma mensagem da conversa (produtoId/variacaoId só) — busca o
  // produto completo (preço/foto/estoque) e adiciona, só depois que o orçamento existente já
  // tiver sido hidratado (senão a hidratação sobrescreve o item recém-adicionado).
  useEffect(() => {
    if (!hidratado || !itemPendente) return
    let cancelado = false
    api.get(`/produtos/${itemPendente.produtoId}`, { params: escopo.params })
      .then(({ data }: { data: ProdutoP }) => {
        if (cancelado) return
        const variacao = data.variacoes.find((v) => v.id === itemPendente.variacaoId)
        if (variacao) adicionarItem(data, variacao, 1)
        else avisar(t('caixa.erroAdicionarProduto'), 'erro')
      })
      .catch((err) => { if (!cancelado) avisar(mensagemDeErro(err), 'erro') })
      .finally(() => { if (!cancelado) onItemPendenteConsumido?.() })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemPendente, hidratado])

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
    setItens([]); setOrcamentoId(null); setOrcamentoStatus(null); setTokenPublico(null); setOrcamentoUpdatedAt(null); setSalvando('idle'); setErroSync('')
  }

  const bloqueado = orcamentoStatus != null && !EDITAVEL.includes(orcamentoStatus)

  function copiarLink() {
    if (!tokenPublico) return
    const link = `${window.location.origin}/orcamento/publico/${tokenPublico}`
    navigator.clipboard.writeText(link).then(
      () => avisar(t('caixa.linkCopiado'), 'sucesso'),
      () => avisar(t('caixa.erroCopiarLink'), 'erro'),
    )
  }

  return (
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
        <FichaProduto
          produto={produtoAberto} atacado={!!atacado}
          onAdicionar={(v, q) => adicionarItem(produtoAberto, v, q)}
          onEnviarChat={(v) => enviarProdutoNoChat(produtoAberto, v)}
          enviandoChat={enviandoChat}
        />
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
          <span className="cz-cart-total-acoes">
            {tokenPublico && (
              <button type="button" className="cz-cart-link" onClick={copiarLink} title={t('caixa.copiarLinkCliente')}>
                <Link2 size={14} strokeWidth={1.8} />
              </button>
            )}
            {itens.length > 0 && (
              <span className={`cz-cart-status ${salvando}`}>
                {salvando === 'salvando' ? t('caixa.sincronizando') : salvando === 'erro' ? '⚠' : '✓'}
              </span>
            )}
          </span>
        </div>
        {salvando === 'erro' && <div className="cz-cart-alerta">{erroSync || t('caixa.erroSincronizar')}</div>}
      </div>
    </div>
  )
})

export default CarrinhoCliente

/** Card da grade, arrastável pro carrinho (adiciona a 1ª variação com estoque) — tocar/clicar
 * (sem arrastar) continua abrindo a ficha pra escolher cor/tamanho específicos. */
function CardProdutoArrastavel({ produto, atacado, onTocar }: { produto: ProdutoP; atacado: boolean; onTocar: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `cz-cart-produto-${produto.id}`, data: { tipo: 'grid-produto', produto } })
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
function FichaProduto({ produto, atacado, onAdicionar, onEnviarChat, enviandoChat }: {
  produto: ProdutoP; atacado: boolean; onAdicionar: (v: VariacaoP, qtd: number) => void
  onEnviarChat: (v: VariacaoP) => void; enviandoChat: boolean
}) {
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

      <div className="cz-cart-ficha-acoes">
        <button
          type="button" className="btn cz-cart-adicionar" disabled={!podeAdicionar}
          onClick={() => variacaoSel && onAdicionar(variacaoSel, qtd)}
        >{t('caixa.adicionar')}</button>
        <button
          type="button" className="btn secundario cz-cart-enviar-chat" disabled={!variacaoSel || enviandoChat}
          onClick={() => variacaoSel && onEnviarChat(variacaoSel)}
        >{enviandoChat ? t('caixa.enviando') : t('caixa.enviarNoChat')}</button>
      </div>
    </div>
  )
}

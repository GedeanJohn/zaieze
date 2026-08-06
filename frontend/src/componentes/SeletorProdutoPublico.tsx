import { useEffect, useMemo, useRef, useState } from 'react'
import { api, formataReal } from '../api'
import { useIdioma } from '../lib/i18n'
import type { ProdutoP, VariacaoP } from './CarrinhoCliente'

/** Estoque disponível pra essa variação no modo de venda do orçamento — mesma regra de
 * CarrinhoCliente.tsx (a reserva de varejo: o atacado só usa o que sobra além dela). */
function disponivel(v: VariacaoP, atacado: boolean): number {
  return atacado ? v.estoque - v.estoqueVarejo : v.estoqueVarejo
}

interface Props {
  token: string
  atacado: boolean
  onAdicionar: (produto: ProdutoP, variacao: VariacaoP, quantidade: number) => void
  onFechar: () => void
}

/** Seletor de produto pro cliente (sem login) adicionar peça direto no próprio orçamento — mesmo
 * padrão de grade→ficha de FichaProduto em CarrinhoCliente.tsx, só que buscando no catálogo
 * público escopado pelo token (GET /orcamentos/publico/:token/produtos) em vez do /produtos
 * autenticado da vendedora. */
export default function SeletorProdutoPublico({ token, atacado, onAdicionar, onFechar }: Props) {
  const { t } = useIdioma()
  const [produtos, setProdutos] = useState<ProdutoP[]>([])
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [produtoAberto, setProdutoAberto] = useState<ProdutoP | null>(null)
  const timerBusca = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerBusca.current) clearTimeout(timerBusca.current)
    setCarregando(true)
    timerBusca.current = setTimeout(() => {
      api.get(`/orcamentos/publico/${token}/produtos`, { params: { busca } })
        .then(({ data }) => setProdutos(data))
        .catch(() => setProdutos([]))
        .finally(() => setCarregando(false))
    }, 350)
    return () => { if (timerBusca.current) clearTimeout(timerBusca.current) }
  }, [token, busca])

  return (
    <div className="orc-seletor">
      <div className="orc-seletor-topo">
        {produtoAberto ? (
          <button type="button" className="orc-seletor-voltar" onClick={() => setProdutoAberto(null)}>← {t('caixa.voltarGrade')}</button>
        ) : (
          <input className="orc-seletor-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('caixa.buscarProduto')} autoFocus />
        )}
        <button type="button" className="orc-seletor-fechar" onClick={onFechar} aria-label={t('comum.fechar')}>✕</button>
      </div>

      {produtoAberto ? (
        <FichaProdutoPublico produto={produtoAberto} atacado={atacado} onAdicionar={(v, q) => { onAdicionar(produtoAberto, v, q); setProdutoAberto(null) }} />
      ) : (
        <div className="orc-seletor-grid">
          {carregando && <div className="orc-seletor-vazio">{t('caixa.carregandoProdutos')}</div>}
          {!carregando && produtos.length === 0 && <div className="orc-seletor-vazio">{t('caixa.nadaEncontrado')}</div>}
          {produtos.map((p) => (
            <button key={p.id} type="button" className="orc-seletor-card" onClick={() => setProdutoAberto(p)}>
              {p.fotos?.[0] ? <img src={p.fotos[0]} alt={p.nome} /> : <div className="orc-seletor-semfoto" />}
              <span className="orc-seletor-nome">{p.nome}</span>
              <span className="orc-seletor-preco">{formataReal(atacado && p.precoAtacado ? Number(p.precoAtacado) : Number(p.precoVarejo))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function FichaProdutoPublico({ produto, atacado, onAdicionar }: {
  produto: ProdutoP; atacado: boolean; onAdicionar: (v: VariacaoP, qtd: number) => void
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
    <div className="orc-seletor-ficha">
      {produto.fotos?.[0] ? <img src={produto.fotos[0]} alt={produto.nome} className="orc-seletor-ficha-foto" /> : <div className="orc-seletor-semfoto lg" />}
      <strong className="orc-seletor-ficha-nome">{produto.nome}</strong>

      {cores.length > 0 && (
        <div className="orc-seletor-opcs">
          <span>{t('caixa.cor')}</span>
          <div className="orc-seletor-chips">
            {cores.map((c) => <button key={c} type="button" className={c === cor ? 'on' : ''} onClick={() => setCor(c)}>{c}</button>)}
          </div>
        </div>
      )}
      {estampas.length > 0 && (
        <div className="orc-seletor-opcs">
          <span>{t('caixa.estampa')}</span>
          <div className="orc-seletor-chips">
            {estampas.map((e) => <button key={e} type="button" className={e === estampa ? 'on' : ''} onClick={() => setEstampa(e)}>{e}</button>)}
          </div>
        </div>
      )}
      {opcoesTamanho.length > 0 && (
        <div className="orc-seletor-opcs">
          <span>{t('caixa.tamanho')}</span>
          <div className="orc-seletor-chips">
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
        <div className="orc-seletor-qtd">
          <button type="button" onClick={() => setQtd((q) => Math.max(1, q - 1))}>−</button>
          <span>{qtd}</span>
          <button type="button" onClick={() => setQtd((q) => Math.min(estoqueSel, q + 1))} disabled={qtd >= estoqueSel}>+</button>
          <span className="orc-seletor-estoque">{t('caixa.emEstoque', { n: estoqueSel })}</span>
        </div>
      )}

      <button type="button" className="orc-btn" disabled={!podeAdicionar} onClick={() => variacaoSel && onAdicionar(variacaoSel, qtd)}>
        {t('caixa.adicionar')}
      </button>
    </div>
  )
}

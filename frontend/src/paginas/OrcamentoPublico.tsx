import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, formataReal, mensagemDeErro } from '../api'
import SeletorIdioma from '../componentes/SeletorIdioma'
import SeletorProdutoPublico from '../componentes/SeletorProdutoPublico'
import type { ProdutoP, VariacaoP } from '../componentes/CarrinhoCliente'
import { useIdioma } from '../lib/i18n'

interface ItemPub {
  variacaoId: string
  quantidade: number
  precoUnitario: string
  variacao: { cor: string; estampa: string; tamanho: string; produto: { nome: string; referencia: string | null; fotos: string[] } }
}
interface OrcPublico {
  id: string
  status: string
  atacado: boolean
  descontoPct: string
  total: string
  updatedAt: string
  observacao?: string | null
  cliente: { nome: string }
  vendedora: { nome: string }
  loja: { nome: string; rede: { nome: string; logoUrl: string | null } }
  itens: ItemPub[]
}
interface LinhaEditavel {
  variacaoId: string; nome: string; foto?: string; cor: string; estampa: string; tamanho: string
  quantidade: number; precoUnitario: number
}

const real = (v: number | string) => formataReal(Number(v))
// O cliente edita em qualquer status "vivo" — igual ao EDITAVEL_CLIENTE do backend
// (orcamentos.routes.ts). AGUARDANDO_APROVACAO_DESCONTO fica de fora (estado interno da
// aprovação de desconto, não diz respeito ao cliente).
const EDITAVEL_CLIENTE = ['RASCUNHO', 'ENVIADO', 'ALTERACAO_SOLICITADA']

function paraLinhas(itens: ItemPub[]): LinhaEditavel[] {
  return itens.map((i) => ({
    variacaoId: i.variacaoId, nome: i.variacao.produto.nome, foto: i.variacao.produto.fotos?.[0],
    cor: i.variacao.cor, estampa: i.variacao.estampa, tamanho: i.variacao.tamanho,
    quantidade: i.quantidade, precoUnitario: Number(i.precoUnitario),
  }))
}

export default function OrcamentoPublico() {
  const { token } = useParams<{ token: string }>()
  const { t } = useIdioma()
  const [o, setO] = useState<OrcPublico | null>(null)
  const [itens, setItens] = useState<LinhaEditavel[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [avisoConflito, setAvisoConflito] = useState('')
  const [resultado, setResultado] = useState<'aprovado' | 'alteracao' | null>(null)
  const [vendaLink, setVendaLink] = useState('')
  const [mostrarAlteracao, setMostrarAlteracao] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [mostrarSeletor, setMostrarSeletor] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [salvando, setSalvando] = useState<'idle' | 'salvando' | 'erro'>('idle')

  const timerSync = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncEmVoo = useRef(false)

  useEffect(() => {
    api.get(`/orcamentos/publico/${token}`)
      .then(({ data }) => { setO(data); setItens(paraLinhas(data.itens)) })
      .catch(() => setErro(t('orcPub.naoEncontrado')))
      .finally(() => setCarregando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const editavel = !!o && EDITAVEL_CLIENTE.includes(o.status)

  // Puxa o que a vendedora mexeu do lado dela (Modo Foco de Vendas / Chat Zaieze) — mesmo padrão
  // de polling condicional de LookProvador.tsx. Pula o merge se houver uma edição local em voo
  // ou agendada, pra não sobrescrever o que o próprio cliente acabou de digitar.
  useEffect(() => {
    if (!editavel) return
    const intervalo = setInterval(() => {
      if (syncEmVoo.current || timerSync.current) return
      api.get(`/orcamentos/publico/${token}`)
        .then(({ data }: { data: OrcPublico }) => {
          if (data.updatedAt === o?.updatedAt) return
          setO(data); setItens(paraLinhas(data.itens))
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(intervalo)
  }, [editavel, token, o?.updatedAt])

  // Mesmo padrão de debounce+guarda-em-voo de sincronizar() em CarrinhoCliente.tsx.
  const sincronizar = useCallback((novaLista: LinhaEditavel[]) => {
    if (timerSync.current) clearTimeout(timerSync.current)
    const agendar = () => { timerSync.current = setTimeout(executar, 600) }
    const executar = async () => {
      if (novaLista.length === 0) return
      if (syncEmVoo.current) { agendar(); return }
      syncEmVoo.current = true
      setSalvando('salvando')
      try {
        const { data } = await api.post(`/orcamentos/publico/${token}/itens`, {
          itens: novaLista.map((i) => ({ variacaoId: i.variacaoId, quantidade: i.quantidade })),
          expectedUpdatedAt: o?.updatedAt,
        })
        setO(data); setItens(paraLinhas(data.itens)); setSalvando('idle')
      } catch (err: unknown) {
        const resp = (err as { response?: { status?: number; data?: { orcamento?: OrcPublico } } }).response
        if (resp?.status === 409 && resp.data?.orcamento) {
          setO(resp.data.orcamento); setItens(paraLinhas(resp.data.orcamento.itens))
          setAvisoConflito(t('orcPub.conflito'))
          setSalvando('idle')
        } else {
          setSalvando('erro'); setErro(mensagemDeErro(err))
        }
      } finally {
        syncEmVoo.current = false
      }
    }
    agendar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, o?.updatedAt])

  function mudarQuantidade(variacaoId: string, delta: number) {
    setAvisoConflito('')
    setItens((atual) => {
      const linha = atual.find((i) => i.variacaoId === variacaoId)
      if (!linha) return atual
      const novaQtd = linha.quantidade + delta
      if (novaQtd < 1) return atual
      const novo = atual.map((i) => (i.variacaoId === variacaoId ? { ...i, quantidade: novaQtd } : i))
      sincronizar(novo)
      return novo
    })
  }

  function removerItem(variacaoId: string) {
    setAvisoConflito('')
    setItens((atual) => {
      if (atual.length <= 1) return atual
      const novo = atual.filter((i) => i.variacaoId !== variacaoId)
      sincronizar(novo)
      return novo
    })
  }

  function adicionarProduto(produto: ProdutoP, variacao: VariacaoP, quantidade: number) {
    setAvisoConflito('')
    setItens((atual) => {
      const idx = atual.findIndex((i) => i.variacaoId === variacao.id)
      const novo = idx >= 0
        ? atual.map((i, ix) => (ix === idx ? { ...i, quantidade: i.quantidade + quantidade } : i))
        : [...atual, {
            variacaoId: variacao.id, nome: produto.nome, foto: produto.fotos?.[0],
            cor: variacao.cor, estampa: variacao.estampa, tamanho: variacao.tamanho, quantidade,
            precoUnitario: o?.atacado && produto.precoAtacado ? Number(produto.precoAtacado) : Number(produto.precoVarejo),
          }]
      sincronizar(novo)
      return novo
    })
    setMostrarSeletor(false)
  }

  const bruto = itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0)
  const totalEditavel = o ? Math.max(0, bruto - bruto * (Number(o.descontoPct) / 100)) : 0

  async function aprovar() {
    setEnviando(true); setErro('')
    try {
      const { data } = await api.post(`/orcamentos/publico/${token}/aprovar`, {})
      if (data.venda?.tokenPublico) setVendaLink(`${window.location.origin}/pedido/publico/${data.venda.tokenPublico}`)
      setResultado('aprovado')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }

  async function enviarAlteracao(e: React.FormEvent) {
    e.preventDefault()
    if (!mensagem.trim()) return
    setEnviando(true); setErro('')
    try {
      await api.post(`/orcamentos/publico/${token}/solicitar-alteracao`, { mensagem: mensagem.trim() })
      setResultado('alteracao')
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="orc-root">
      <OrcamentoEstilos />
      <div className="orc-acoes orc-noprint"><SeletorIdioma /></div>

      {carregando && <div className="orc-vazio">{t('orcPub.carregando')}</div>}
      {!carregando && erro && !o && <div className="orc-vazio">{erro}</div>}

      {o && (
        <div className="orc-folha">
          <header className="orc-cab">
            <div>
              {o.loja.rede.logoUrl
                ? <img className="orc-logo" src={o.loja.rede.logoUrl} alt={o.loja.rede.nome} />
                : <div className="orc-marca">{o.loja.rede.nome}</div>}
              <div className="orc-loja">{o.loja.nome}</div>
            </div>
            <div className="orc-num">
              <div><strong>{t('orcPub.orcamentoLabel')}</strong></div>
              <span className={`orc-tag ${o.atacado ? 'ata' : ''}`}>{o.atacado ? t('ped.atacado') : t('ped.varejo')}</span>
            </div>
          </header>

          <section className="orc-partes">
            <div>
              <div className="orc-rot">{t('ped.clienteLabel')}</div>
              <div>{o.cliente.nome}</div>
            </div>
            <div>
              <div className="orc-rot">{t('ped.vendedoraLabel')}</div>
              <div>{o.vendedora.nome}</div>
            </div>
          </section>

          {editavel ? (
            <>
              {avisoConflito && <div className="orc-alerta orc-alerta-info">{avisoConflito}</div>}
              <div className="orc-itens-edit">
                {itens.map((i) => (
                  <div key={i.variacaoId} className="orc-item-edit">
                    {i.foto ? <img className="orc-mini" src={i.foto} alt="" /> : <div className="orc-mini vazio" />}
                    <div className="orc-item-edit-info">
                      <strong>{i.nome}</strong>
                      <span>{[i.cor, i.estampa].filter(Boolean).join(' / ')} {i.tamanho ? `· ${i.tamanho}` : ''}</span>
                      <span className="orc-item-edit-preco">{real(i.precoUnitario)}</span>
                    </div>
                    <div className="orc-item-edit-qtd">
                      <button type="button" onClick={() => mudarQuantidade(i.variacaoId, -1)} disabled={i.quantidade === 1 && itens.length === 1}>−</button>
                      <span>{i.quantidade}</span>
                      <button type="button" onClick={() => mudarQuantidade(i.variacaoId, 1)}>+</button>
                    </div>
                    {itens.length > 1 && (
                      <button type="button" className="orc-item-edit-remover" onClick={() => removerItem(i.variacaoId)} aria-label={t('comum.excluir')}>×</button>
                    )}
                  </div>
                ))}
                {itens.length === 0 && <div className="orc-vazio">{t('orcPub.semItens')}</div>}
              </div>
              <button type="button" className="orc-btn cinza orc-btn-adicionar" onClick={() => setMostrarSeletor(true)}>
                + {t('orcPub.adicionarProduto')}
              </button>
              <span className={`orc-status-sync ${salvando}`}>
                {salvando === 'salvando' ? t('caixa.sincronizando') : salvando === 'erro' ? '⚠' : ''}
              </span>
            </>
          ) : (
            <table className="orc-tab">
              <thead>
                <tr><th></th><th>{t('ped.colProduto')}</th><th>{t('ped.colVariacao')}</th><th className="r">{t('ped.colQtd')}</th><th className="r">{t('ped.colPreco')}</th><th className="r">{t('ped.colSubtotal')}</th></tr>
              </thead>
              <tbody>
                {o.itens.map((i, idx) => (
                  <tr key={idx}>
                    <td>{i.variacao.produto.fotos?.[0] ? <img className="orc-mini" src={i.variacao.produto.fotos[0]} alt="" /> : <div className="orc-mini vazio" />}</td>
                    <td>{i.variacao.produto.nome}</td>
                    <td>{[i.variacao.cor, i.variacao.estampa, i.variacao.tamanho].filter(Boolean).join(' / ')}</td>
                    <td className="r">{i.quantidade}</td>
                    <td className="r">{real(i.precoUnitario)}</td>
                    <td className="r">{real(Number(i.precoUnitario) * i.quantidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="orc-totais">
            {Number(o.descontoPct) > 0 && <div className="d"><span>{t('ped.descontoLabel', { pct: o.descontoPct })}</span></div>}
            <div className="t"><span>{t('ped.totalLabel')}</span><span>{real(editavel ? totalEditavel : o.total)}</span></div>
          </div>
          {o.observacao && <div className="orc-obs"><strong>{t('ped.observacoesLabel')}</strong> {o.observacao}</div>}

          {o.status === 'AGUARDANDO_APROVACAO_DESCONTO' ? (
            <div className="orc-status-fechado">👁 {t('orcPub.previaAindaNaoEnviado')}</div>
          ) : o.status === 'RASCUNHO' ? (
            <div className="orc-status-fechado">{t('orcPub.rascunhoEditavel')}</div>
          ) : o.status === 'CONVERTIDO' ? (
            <div className="orc-status-fechado">✅ {t('orcPub.jaAprovado')}</div>
          ) : o.status === 'ALTERACAO_SOLICITADA' && resultado !== 'alteracao' ? (
            <div className="orc-status-fechado">{t('orcPub.aguardandoVendedora')}</div>
          ) : o.status === 'ENVIADO' ? (
            resultado === 'aprovado' ? (
              <div className="orc-confirmado">
                <div className="orc-confirmado-icone">✅</div>
                <strong>{t('orcPub.aprovadoTitulo')}</strong>
                <p>{t('orcPub.aprovadoTexto')}</p>
                {vendaLink && <a className="orc-btn" href={vendaLink} target="_blank" rel="noreferrer">{t('orcPub.verPedido')}</a>}
              </div>
            ) : resultado === 'alteracao' ? (
              <div className="orc-confirmado">
                <div className="orc-confirmado-icone">💬</div>
                <strong>{t('orcPub.alteracaoTitulo')}</strong>
                <p>{t('orcPub.alteracaoTexto')}</p>
              </div>
            ) : mostrarAlteracao ? (
              <form className="orc-form-alteracao" onSubmit={enviarAlteracao}>
                {erro && <div className="orc-alerta">{erro}</div>}
                <label>{t('orcPub.oQueMudar')}</label>
                <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} autoFocus required />
                <div className="orc-acoes-form">
                  <button type="button" className="orc-btn cinza" onClick={() => setMostrarAlteracao(false)}>{t('comum.cancelar')}</button>
                  <button className="orc-btn" disabled={enviando || !mensagem.trim()}>{enviando ? '…' : t('orcPub.enviarPedido')}</button>
                </div>
              </form>
            ) : (
              <>
                {erro && <div className="orc-alerta">{erro}</div>}
                <div className="orc-acoes-principais">
                  <button className="orc-btn cinza" onClick={() => setMostrarAlteracao(true)} disabled={enviando}>{t('orcPub.solicitarAlteracoes')}</button>
                  <button className="orc-btn verde" onClick={aprovar} disabled={enviando || salvando === 'salvando'}>{enviando ? '…' : t('orcPub.aprovarOrcamento')}</button>
                </div>
              </>
            )
          ) : (
            <div className="orc-status-fechado">{t('orcPub.indisponivel')}</div>
          )}

          <footer className="orc-pe">{o.loja.rede.nome} · {t('ped.poweredBy')}</footer>
        </div>
      )}

      {mostrarSeletor && o && (
        <div className="orc-seletor-overlay">
          <SeletorProdutoPublico token={token!} atacado={o.atacado} onAdicionar={adicionarProduto} onFechar={() => setMostrarSeletor(false)} />
        </div>
      )}
    </div>
  )
}

function OrcamentoEstilos() {
  return (
    <style>{`
      .orc-root { background: #f3f3f3; min-height: 100vh; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; }
      .orc-acoes { max-width: 760px; margin: 0 auto 14px; display: flex; justify-content: flex-end; }
      .orc-vazio { max-width: 760px; margin: 60px auto; text-align: center; color: #777; }
      .orc-folha { max-width: 760px; margin: 0 auto; background: #fff; padding: 34px; border-radius: 8px; box-shadow: 0 4px 20px #00000014; }
      .orc-cab { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 14px; }
      .orc-logo { max-height: 56px; max-width: 200px; object-fit: contain; }
      .orc-marca { font-size: 24px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
      .orc-loja { font-size: 13px; color: #666; margin-top: 4px; }
      .orc-num { text-align: right; font-size: 14px; }
      .orc-tag { font-size: 11px; font-weight: 700; padding: 2px 10px; border-radius: 99px; background: #eee; color: #555; }
      .orc-tag.ata { background: #111; color: #fff; }
      .orc-partes { display: flex; gap: 40px; margin: 18px 0; font-size: 14px; }
      .orc-rot { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #999; margin-bottom: 2px; }
      .orc-tab { width: 100%; border-collapse: collapse; font-size: 13px; }
      .orc-tab th { text-align: left; border-bottom: 1px solid #ddd; padding: 8px 6px; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
      .orc-tab td { padding: 8px 6px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
      .orc-tab .r { text-align: right; }
      .orc-mini { width: 40px; height: 52px; object-fit: cover; border-radius: 4px; }
      .orc-mini.vazio { background: #eee; }
      .orc-itens-edit { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
      .orc-item-edit { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid #f0f0f0; }
      .orc-item-edit-info { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 13px; }
      .orc-item-edit-info span { color: #777; font-size: 12px; }
      .orc-item-edit-preco { color: #333 !important; font-weight: 600; }
      .orc-item-edit-qtd { display: flex; align-items: center; gap: 8px; font-weight: 700; }
      .orc-item-edit-qtd button { width: 26px; height: 26px; border-radius: 50%; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 15px; line-height: 1; }
      .orc-item-edit-remover { border: none; background: none; color: #b3261e; font-size: 20px; cursor: pointer; padding: 0 4px; }
      .orc-btn-adicionar { width: 100%; margin-top: 10px; }
      .orc-status-sync { display: block; text-align: right; font-size: 11px; color: #999; font-weight: 700; margin-top: 4px; min-height: 14px; }
      .orc-status-sync.erro { color: #b3261e; }
      .orc-alerta-info { background: #eef4fd; color: #1a4d8f; }
      .orc-totais { margin-top: 16px; text-align: right; font-size: 14px; }
      .orc-totais .d { color: #c62828; }
      .orc-totais .t { font-size: 22px; font-weight: 800; border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; display: flex; justify-content: space-between; }
      .orc-obs { margin-top: 18px; font-size: 13px; background: #faf7f2; border-radius: 6px; padding: 10px 12px; }
      .orc-status-fechado { margin-top: 26px; text-align: center; color: #777; font-size: 15px; padding: 20px; background: #fafafa; border-radius: 8px; }
      .orc-acoes-principais { display: flex; gap: 12px; margin-top: 26px; }
      .orc-btn { flex: 1; text-align: center; background: #111; color: #fff; border: none; padding: 14px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 15px; text-decoration: none; display: inline-block; }
      .orc-btn.verde { background: #1f9d55; }
      .orc-btn.cinza { background: #e9e9e9; color: #333; }
      .orc-btn:disabled { opacity: .6; cursor: default; }
      .orc-alerta { margin: 12px 0; background: #fdeaea; color: #b3261e; border-radius: 8px; padding: 10px 14px; font-size: 13px; }
      .orc-form-alteracao { margin-top: 24px; display: flex; flex-direction: column; gap: 8px; }
      .orc-form-alteracao label { font-size: 13px; font-weight: 600; color: #444; }
      .orc-form-alteracao textarea { font-family: inherit; font-size: 14px; padding: 10px 12px; border-radius: 8px; border: 1px solid #ddd; resize: vertical; }
      .orc-acoes-form { display: flex; gap: 10px; justify-content: flex-end; }
      .orc-confirmado { margin-top: 26px; text-align: center; padding: 28px 16px; background: #f7faf7; border-radius: 10px; }
      .orc-confirmado-icone { font-size: 40px; margin-bottom: 8px; }
      .orc-confirmado p { color: #666; font-size: 14px; margin: 8px 0 16px; }
      .orc-pe { text-align: center; color: #bbb; font-size: 11px; margin-top: 24px; }
      .orc-seletor-overlay { position: fixed; inset: 0; background: #0008; display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
      .orc-seletor { width: 100%; max-width: 760px; max-height: 82vh; background: #fff; border-radius: 14px 14px 0 0; display: flex; flex-direction: column; overflow: hidden; }
      .orc-seletor-topo { display: flex; align-items: center; gap: 8px; padding: 12px; border-bottom: 1px solid #eee; }
      .orc-seletor-busca { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; font-size: 14px; }
      .orc-seletor-voltar, .orc-seletor-fechar { border: none; background: none; cursor: pointer; font-size: 14px; padding: 6px; }
      .orc-seletor-grid { flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; padding: 12px; }
      .orc-seletor-card { display: flex; flex-direction: column; gap: 4px; border: 1px solid #eee; border-radius: 10px; padding: 6px; background: #fff; cursor: pointer; text-align: left; }
      .orc-seletor-card img { width: 100%; aspect-ratio: 3/4; object-fit: cover; border-radius: 6px; }
      .orc-seletor-semfoto { width: 100%; aspect-ratio: 3/4; background: #eee; border-radius: 6px; }
      .orc-seletor-semfoto.lg { aspect-ratio: 4/5; }
      .orc-seletor-nome { font-size: 12px; font-weight: 600; }
      .orc-seletor-preco { font-size: 12px; color: #666; }
      .orc-seletor-vazio { grid-column: 1 / -1; text-align: center; color: #999; padding: 30px 0; }
      .orc-seletor-ficha { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
      .orc-seletor-ficha-foto { width: 100%; max-height: 280px; object-fit: cover; border-radius: 10px; }
      .orc-seletor-ficha-nome { font-size: 16px; }
      .orc-seletor-opcs { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #777; }
      .orc-seletor-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .orc-seletor-chips button { border: 1px solid #ddd; background: #fff; border-radius: 20px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
      .orc-seletor-chips button.on { background: #111; color: #fff; border-color: #111; }
      .orc-seletor-chips button:disabled { opacity: .35; cursor: default; }
      .orc-seletor-qtd { display: flex; align-items: center; gap: 10px; font-weight: 700; }
      .orc-seletor-qtd button { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 16px; }
      .orc-seletor-estoque { font-size: 11px; color: #999; font-weight: 400; }
      @media (max-width: 640px) {
        .orc-folha { padding: 20px 16px; }
        .orc-acoes-principais { flex-direction: column; }
      }
    `}</style>
  )
}

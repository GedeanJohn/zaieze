import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'

interface Cliente {
  id: string
  nome: string
  telefone: string | null
  email?: string | null
  instagram?: string | null
  cep?: string | null
  cidade?: string | null
  uf?: string | null
  segmento: string
  totalGasto: string
  ultimaCompraEm?: string | null
  consentimentoLgpd: boolean
  vendedora?: { id: string; nome: string } | null
}

interface Locais { cidades: string[]; ufs: string[]; ddds: string[]; regioes: string[] }

interface ItemHist {
  id: string
  quantidade: number
  precoUnitario: string
  variacao: { cor: string; tamanho: string; produto: { nome: string } }
}
interface VendaHist {
  id: string
  total: string
  status: 'CONCLUIDA' | 'CANCELADA'
  atacado: boolean
  createdAt: string
  itens: ItemHist[]
}
interface ClienteDetalhe extends Cliente {
  cpf?: string | null
  observacoes?: string | null
  vendas: VendaHist[]
}

interface Vendedora { id: string; nome: string; role: string }
type Distribuicao = Record<string, number>

const SEGMENTOS = ['NOVO', 'FREQUENTE', 'VIP', 'INATIVO', 'ATACADO']
const FILTRO_SEGMENTOS = ['', ...SEGMENTOS]

function diasDesde(iso?: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function Clientes() {
  const usuario = usuarioLogado()!
  const { t } = useIdioma()
  const gerente = usuario.role !== 'VENDEDORA'
  const escopo = useLojaAtiva()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [distribuicao, setDistribuicao] = useState<Distribuicao>({})
  const [vendedoras, setVendedoras] = useState<Vendedora[]>([])
  const [busca, setBusca] = useState('')
  const [segmento, setSegmento] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [regiao, setRegiao] = useState('')
  const [ddd, setDdd] = useState('')
  const [locais, setLocais] = useState<Locais>({ cidades: [], ufs: [], ddds: [], regioes: [] })
  const [selecao, setSelecao] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [editando, setEditando] = useState<Partial<Cliente> | null>(null)
  const [detalhe, setDetalhe] = useState<ClienteDetalhe | null>(null)
  const [erro, setErro] = useState('')
  const avisar = useToast()
  const [segmentando, setSegmentando] = useState(false)
  const [cepBuscando, setCepBuscando] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const params: Record<string, string> = { ...escopo.params }
    if (busca) params.busca = busca
    if (segmento) params.segmento = segmento
    if (cidade) params.cidade = cidade
    if (uf) params.uf = uf
    else if (regiao) params.regiao = regiao
    if (ddd) params.ddd = ddd
    const [lista, resumo, locs] = await Promise.all([
      api.get('/clientes', { params }),
      api.get('/clientes/resumo/segmentos', { params: escopo.params }),
      api.get('/clientes/resumo/locais', { params: escopo.params }),
    ])
    setClientes(lista.data)
    setDistribuicao(resumo.data.distribuicao)
    setLocais(locs.data)
    setSelecao(new Set()) // limpa seleção a cada novo filtro/recarga
  }, [busca, segmento, cidade, uf, regiao, ddd, escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (gerente && escopo.pronto) {
      api.get('/usuarios', { params: escopo.params }).then(({ data }) =>
        setVendedoras(data.filter((u: Vendedora) => u.role === 'VENDEDORA')),
      )
    }
  }, [gerente, escopo.pronto, escopo.params])

  async function recalcular() {
    setSegmentando(true)
    try {
      const { data } = await api.post('/clientes/segmentar', {}, { params: escopo.params })
      const d = data.distribuicao as Distribuicao
      avisar(
        `${t('cli.segmentacaoRecalculada')} ${data.atualizados} ${t('cli.clientesReclassificados')} ` +
          `${t('segmento.VIP')} ${d.VIP} · ${t('segmento.FREQUENTE')} ${d.FREQUENTE} · ${t('segmento.INATIVO')} ${d.INATIVO} · ${t('segmento.ATACADO')} ${d.ATACADO} · ${t('segmento.NOVO')} ${d.NOVO}.`,
      )
      await carregar()
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    } finally {
      setSegmentando(false)
    }
  }

  async function abrirDetalhe(id: string) {
    try {
      const { data } = await api.get(`/clientes/${id}`, { params: escopo.params })
      setDetalhe(data)
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setErro('')
    const corpo: Record<string, unknown> = {
      nome: editando.nome,
      telefone: editando.telefone || undefined,
      email: editando.email || undefined,
      instagram: editando.instagram || undefined,
      cep: editando.cep || undefined,
      cidade: editando.cidade || undefined,
      uf: editando.uf || undefined,
      consentimentoLgpd: editando.consentimentoLgpd ?? false,
    }
    // Só o gerente/gestor define/transfere a carteira. A vendedora edita os dados do
    // cliente sem mexer na carteira (o backend recusa vendedoraId vindo de vendedora).
    if (gerente) corpo.vendedoraId = (editando as { vendedoraId?: string }).vendedoraId || editando.vendedora?.id || undefined
    try {
      if (editando.id) await api.patch(`/clientes/${editando.id}`, corpo, { params: escopo.params })
      else await api.post('/clientes', corpo, { params: escopo.params })
      setEditando(null)
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  // Autopreenche cidade/UF a partir do CEP (ViaCEP) — padroniza os dados para os filtros.
  async function buscarCep(cepRaw: string) {
    const cepNum = cepRaw.replace(/\D/g, '')
    if (cepNum.length !== 8 || !editando) return
    setCepBuscando(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cepNum}/json/`)
      const d = await r.json()
      if (!d.erro) setEditando((atual) => atual && ({ ...atual, cep: cepNum, cidade: d.localidade ?? atual.cidade, uf: d.uf ?? atual.uf }))
    } catch { /* offline/cep inválido — mantém o que o usuário digitou */ }
    finally { setCepBuscando(false) }
  }

  function alternarSelecao(id: string) {
    setSelecao((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function alternarTodos() {
    setSelecao((s) => s.size === clientes.length ? new Set() : new Set(clientes.map((c) => c.id)))
  }

  async function enviarCatalogo() {
    const ids = [...selecao]
    if (ids.length === 0) return
    if (!confirm(`${t('cli.enviarCatalogoConfirm')} ${ids.length} ${t('cli.clientesSelecionadosPergunta')}`)) return
    setEnviando(true)
    try {
      const { data } = await api.post('/clientes/enviar-catalogo', { clienteIds: ids }, { params: escopo.params })
      const partes = [`${data.enviados} ${t('cli.enviados')}`]
      if (data.simulados) partes.push(`${data.simulados} ${t('cli.simuladosWa')}`)
      if (data.falhas) partes.push(`${data.falhas} ${t('cli.falhas')}`)
      if (data.semConsentimento) partes.push(`${data.semConsentimento} ${t('cli.semConsentimentoQtd')}`)
      if (data.semVendedora) partes.push(`${data.semVendedora} ${t('cli.semVendedoraInstancia')}`)
      avisar(`${t('cli.disparoConcluido')} ${partes.join(' · ')}.`)
      setSelecao(new Set())
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setEnviando(false) }
  }

  const detalheDias = diasDesde(detalhe?.ultimaCompraEm)

  return (
    <>
      <header>
        <h1>{gerente ? t('cli.clientesDaLoja') : t('cli.minhaCarteira')}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          {gerente && (
            <button className="btn secundario" onClick={recalcular} disabled={segmentando || !escopo.pronto}>
              {segmentando ? t('cli.recalculando') : t('cli.recalcularSegmentacao')}
            </button>
          )}
          <button className="btn" onClick={() => setEditando({ consentimentoLgpd: false })}>{t('cli.novoCliente')}</button>
        </div>
      </header>


      {/* Distribuição da carteira por segmento (clicável = filtro) */}
      <div className="cartao" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>{t('cli.carteira')}</strong>
        {SEGMENTOS.map((s) => (
          <button
            key={s}
            onClick={() => setSegmento(segmento === s ? '' : s)}
            title={segmento === s ? t('cli.removerFiltro') : `${t('cli.filtrarPor')} ${t(`segmento.${s}`)}`}
            style={{
              border: segmento === s ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: 'transparent', borderRadius: 999, padding: '4px 4px 4px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, width: 'auto',
            }}
          >
            <span className={`selo ${s}`}>{t(`segmento.${s}`)}</span>
            <strong>{distribuicao[s] ?? 0}</strong>
          </button>
        ))}
      </div>

      <div className="cartao">
        <div className="linha-campos">
          <div className="campo">
            <label>{t('cli.buscarNomeTelefone')}</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Ana" />
          </div>
          <div className="campo">
            <label>{t('cli.classificacao')}</label>
            <select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
              {FILTRO_SEGMENTOS.map((s) => <option key={s} value={s}>{s ? t(`segmento.${s}`) : t('cli.todos')}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>{t('cli.ddd')}</label>
            <select value={ddd} onChange={(e) => setDdd(e.target.value)}>
              <option value="">{t('cli.todos')}</option>
              {locais.ddds.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>{t('cli.cidade')}</label>
            <select value={cidade} onChange={(e) => setCidade(e.target.value)}>
              <option value="">{t('cli.todas')}</option>
              {locais.cidades.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>{t('cli.uf')}</label>
            <select value={uf} onChange={(e) => { setUf(e.target.value); if (e.target.value) setRegiao('') }}>
              <option value="">{t('cli.todas')}</option>
              {locais.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>{t('cli.regiao')}</label>
            <select value={regiao} onChange={(e) => setRegiao(e.target.value)} disabled={!!uf}>
              <option value="">{t('cli.todas')}</option>
              {locais.regioes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* Toolbar de seleção + envio do link do catálogo (R1) */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <button className="btn secundario" type="button" onClick={alternarTodos} disabled={clientes.length === 0}>
            {selecao.size === clientes.length && clientes.length > 0 ? t('cli.limparSelecao') : t('cli.selecionarTodos')}
          </button>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{selecao.size} {t('cli.selecionados')}</span>
          <button className="btn" type="button" onClick={enviarCatalogo} disabled={selecao.size === 0 || enviando}>
            {enviando ? t('cli.enviando') : `${t('cli.enviarLinkCatalogo')}${selecao.size ? ` (${selecao.size})` : ''}`}
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('cli.soVaiParaConsentimento')}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" checked={selecao.size === clientes.length && clientes.length > 0} onChange={alternarTodos} />
              </th>
              <th>{t('cli.nome')}</th><th>{t('cli.whatsapp')}</th><th>{t('cli.local')}</th><th>{t('cli.classificacao')}</th><th>{t('cli.totalGasto')}</th><th>{t('cli.ultimaCompra')}</th>
              {gerente && <th>{t('cli.vendedora')}</th>}
              <th>{t('cli.lgpd')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const dias = diasDesde(c.ultimaCompraEm)
              return (
                <tr key={c.id} style={{ background: selecao.has(c.id) ? 'var(--accent-suave, #ffffff10)' : undefined }}>
                  <td><input type="checkbox" checked={selecao.has(c.id)} onChange={() => alternarSelecao(c.id)} /></td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); abrirDetalhe(c.id) }}>{c.nome}</a></td>
                  <td>{c.telefone || (c.instagram ? `📷 ${c.instagram}` : '—')}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ''}` : '—'}</td>
                  <td><span className={`selo ${c.segmento}`}>{t(`segmento.${c.segmento}`)}</span></td>
                  <td>{formataReal(c.totalGasto)}</td>
                  <td style={{ fontSize: 13, color: dias != null && dias > 90 ? 'var(--danger)' : 'var(--ink-soft)' }}>
                    {dias == null ? '—' : dias === 0 ? t('cli.hoje') : t('cli.haDiasAtras', { n: dias })}
                  </td>
                  {gerente && <td>{c.vendedora?.nome ?? '—'}</td>}
                  <td>{c.consentimentoLgpd ? '✅' : '—'}</td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); setEditando(c) }}>{t('cli.editarLink')}</a></td>
                </tr>
              )
            })}
            {clientes.length === 0 && (
              <tr><td colSpan={gerente ? 10 : 9} style={{ color: 'var(--ink-soft)' }}>{t('cli.nenhumClienteEncontrado')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detalhe + histórico de compras */}
      {detalhe && (
        <div className="modal-fundo" onClick={() => setDetalhe(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>{detalhe.nome}</h2>
                <span className={`selo ${detalhe.segmento}`}>{t(`segmento.${detalhe.segmento}`)}</span>
              </div>
              <button className="btn secundario" onClick={() => setDetalhe(null)}>{t('cli.fechar')}</button>
            </div>

            <div className="grade-cards" style={{ marginTop: 16 }}>
              <div className="cartao kpi"><div className="rotulo">{t('cli.totalGasto')}</div><div className="valor">{formataReal(detalhe.totalGasto)}</div></div>
              <div className="cartao kpi"><div className="rotulo">{t('cli.compras')}</div><div className="valor">{detalhe.vendas.filter((v) => v.status === 'CONCLUIDA').length}</div></div>
              <div className="cartao kpi">
                <div className="rotulo">{t('cli.ultimaCompra')}</div>
                <div className="valor" style={{ fontSize: 18 }}>
                  {detalheDias == null ? '—' : detalheDias === 0 ? t('cli.hoje') : t('cli.haDAtras', { n: detalheDias })}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 16px' }}>
              {detalhe.telefone ? `📱 ${detalhe.telefone}` : ''}{detalhe.instagram ? `${detalhe.telefone ? ' · ' : ''}📷 ${detalhe.instagram}` : ''}
              {detalhe.vendedora ? ` · ${t('cli.carteiraDe', { nome: detalhe.vendedora.nome })}` : ''}
              {detalhe.consentimentoLgpd ? ` · ✅ ${t('cli.aceitaCampanhas')}` : ` · ⚠ ${t('cli.semConsentimentoLgpd')}`}
            </div>

            {detalhe.segmento === 'INATIVO' && (
              <div className="alerta" style={{ background: '#fff3e0', color: 'var(--warn)' }}>
                {t('cli.oportunidadeRecuperacao', { n: detalheDias ?? 0 })}
              </div>
            )}

            <h3 className="painel-titulo">{t('cli.historicoCompras')}</h3>
            <table>
              <thead><tr><th>{t('cli.data')}</th><th>{t('cli.itens')}</th><th>{t('cli.total')}</th><th>{t('cli.status')}</th></tr></thead>
              <tbody>
                {detalhe.vendas.map((venda) => (
                  <tr key={venda.id} style={{ opacity: venda.status === 'CANCELADA' ? 0.5 : 1 }}>
                    <td>{dataCurta(venda.createdAt)}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                      {venda.itens.map((i) => `${i.quantidade}× ${i.variacao.produto.nome} ${i.variacao.cor}/${i.variacao.tamanho}`).join(' · ')}
                      {venda.atacado ? `  🏷️${t('vendas.atacadoTag')}` : ''}
                    </td>
                    <td>{formataReal(venda.total)}</td>
                    <td><span className={`selo ${venda.status === 'CONCLUIDA' ? 'ok' : 'baixo'}`}>{venda.status === 'CONCLUIDA' ? t('cli.ok') : t('cli.cancelada')}</span></td>
                  </tr>
                ))}
                {detalhe.vendas.length === 0 && (
                  <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>{t('cli.semComprasRegistradas')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cadastro / edição */}
      {editando && (
        <div className="modal-fundo" onClick={() => setEditando(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>{editando.id ? t('cli.editarCliente') : t('cli.novoClienteTitulo')}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>{t('cli.nomeObrig')}</label>
                <input value={editando.nome ?? ''} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} required />
              </div>
              <div className="campo">
                <label>{t('cli.whatsappComDdi')}</label>
                <input value={editando.telefone ?? ''} onChange={(e) => setEditando({ ...editando, telefone: e.target.value })} placeholder="5562999998888" />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>{t('cli.email')}</label>
                <input type="email" value={editando.email ?? ''} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              </div>
              <div className="campo">
                <label>{t('cli.instagram')}</label>
                <input value={editando.instagram ?? ''} onChange={(e) => setEditando({ ...editando, instagram: e.target.value })} placeholder="@cliente" />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>{t('cli.cep')} {cepBuscando && <span style={{ color: 'var(--ink-soft)' }}>· {t('cli.buscandoCep')}</span>}</label>
                <input value={editando.cep ?? ''} inputMode="numeric"
                  onChange={(e) => setEditando({ ...editando, cep: e.target.value })}
                  onBlur={(e) => buscarCep(e.target.value)} placeholder="74000-000" />
              </div>
              <div className="campo">
                <label>{t('cli.cidade')}</label>
                <input value={editando.cidade ?? ''} onChange={(e) => setEditando({ ...editando, cidade: e.target.value })} placeholder={t('cli.preenchePeloCep')} />
              </div>
              <div className="campo" style={{ maxWidth: 90 }}>
                <label>{t('cli.uf')}</label>
                <input value={editando.uf ?? ''} maxLength={2}
                  onChange={(e) => setEditando({ ...editando, uf: e.target.value.toUpperCase() })} placeholder="GO" />
              </div>
            </div>
            {gerente && (
              <div className="campo">
                <label>{t('cli.vendedoraCarteira')}</label>
                <select
                  value={(editando as { vendedoraId?: string }).vendedoraId ?? editando.vendedora?.id ?? ''}
                  onChange={(e) => setEditando({ ...editando, vendedoraId: e.target.value } as never)}
                >
                  <option value="">{t('cli.semCarteira')}</option>
                  {vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </div>
            )}
            <div className="campo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox" style={{ width: 'auto' }} id="lgpd"
                checked={editando.consentimentoLgpd ?? false}
                onChange={(e) => setEditando({ ...editando, consentimentoLgpd: e.target.checked })}
              />
              <label htmlFor="lgpd" style={{ margin: 0 }}>{t('cli.clienteConsentiu')}</label>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setEditando(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('comum.salvar')}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

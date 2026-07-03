import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useToast } from '../componentes/Toast'

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
        `Segmentação recalculada — ${data.atualizados} cliente(s) reclassificado(s). ` +
          `VIP ${d.VIP} · Frequente ${d.FREQUENTE} · Inativo ${d.INATIVO} · Atacado ${d.ATACADO} · Novo ${d.NOVO}.`,
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
    if (!confirm(`Enviar o link do catálogo para ${ids.length} cliente(s) selecionado(s)?`)) return
    setEnviando(true)
    try {
      const { data } = await api.post('/clientes/enviar-catalogo', { clienteIds: ids }, { params: escopo.params })
      const partes = [`${data.enviados} enviado(s)`]
      if (data.simulados) partes.push(`${data.simulados} simulado(s) (WhatsApp não conectado)`)
      if (data.falhas) partes.push(`${data.falhas} falha(s)`)
      if (data.semConsentimento) partes.push(`${data.semConsentimento} sem consentimento LGPD`)
      if (data.semVendedora) partes.push(`${data.semVendedora} sem vendedora/instância`)
      avisar(`Disparo concluído: ${partes.join(' · ')}.`)
      setSelecao(new Set())
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setEnviando(false) }
  }

  const detalheDias = diasDesde(detalhe?.ultimaCompraEm)

  return (
    <>
      <header>
        <h1>{gerente ? 'Clientes da loja' : 'Minha carteira'}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          {gerente && (
            <button className="btn secundario" onClick={recalcular} disabled={segmentando || !escopo.pronto}>
              {segmentando ? 'Recalculando…' : '🔄 Recalcular segmentação'}
            </button>
          )}
          <button className="btn" onClick={() => setEditando({ consentimentoLgpd: false })}>+ Novo cliente</button>
        </div>
      </header>


      {/* Distribuição da carteira por segmento (clicável = filtro) */}
      <div className="cartao" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>Carteira:</strong>
        {SEGMENTOS.map((s) => (
          <button
            key={s}
            onClick={() => setSegmento(segmento === s ? '' : s)}
            title={segmento === s ? 'Remover filtro' : `Filtrar por ${s}`}
            style={{
              border: segmento === s ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: 'transparent', borderRadius: 999, padding: '4px 4px 4px 10px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, width: 'auto',
            }}
          >
            <span className={`selo ${s}`}>{s}</span>
            <strong>{distribuicao[s] ?? 0}</strong>
          </button>
        ))}
      </div>

      <div className="cartao">
        <div className="linha-campos">
          <div className="campo">
            <label>Buscar (nome ou telefone)</label>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Ana" />
          </div>
          <div className="campo">
            <label>Classificação</label>
            <select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
              {FILTRO_SEGMENTOS.map((s) => <option key={s} value={s}>{s || 'Todos'}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>DDD</label>
            <select value={ddd} onChange={(e) => setDdd(e.target.value)}>
              <option value="">Todos</option>
              {locais.ddds.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Cidade</label>
            <select value={cidade} onChange={(e) => setCidade(e.target.value)}>
              <option value="">Todas</option>
              {locais.cidades.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>UF</label>
            <select value={uf} onChange={(e) => { setUf(e.target.value); if (e.target.value) setRegiao('') }}>
              <option value="">Todas</option>
              {locais.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Região</label>
            <select value={regiao} onChange={(e) => setRegiao(e.target.value)} disabled={!!uf}>
              <option value="">Todas</option>
              {locais.regioes.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {/* Toolbar de seleção + envio do link do catálogo (R1) */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <button className="btn secundario" type="button" onClick={alternarTodos} disabled={clientes.length === 0}>
            {selecao.size === clientes.length && clientes.length > 0 ? 'Limpar seleção' : 'Selecionar todos'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{selecao.size} selecionado(s)</span>
          <button className="btn" type="button" onClick={enviarCatalogo} disabled={selecao.size === 0 || enviando}>
            {enviando ? 'Enviando…' : `📲 Enviar link do catálogo${selecao.size ? ` (${selecao.size})` : ''}`}
          </button>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Só vai para quem tem consentimento LGPD.</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" checked={selecao.size === clientes.length && clientes.length > 0} onChange={alternarTodos} />
              </th>
              <th>Nome</th><th>WhatsApp</th><th>Local</th><th>Classificação</th><th>Total gasto</th><th>Última compra</th>
              {gerente && <th>Vendedora</th>}
              <th>LGPD</th><th></th>
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
                  <td><span className={`selo ${c.segmento}`}>{c.segmento}</span></td>
                  <td>{formataReal(c.totalGasto)}</td>
                  <td style={{ fontSize: 13, color: dias != null && dias > 90 ? 'var(--danger)' : 'var(--ink-soft)' }}>
                    {dias == null ? '—' : dias === 0 ? 'hoje' : `há ${dias} dias`}
                  </td>
                  {gerente && <td>{c.vendedora?.nome ?? '—'}</td>}
                  <td>{c.consentimentoLgpd ? '✅' : '—'}</td>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); setEditando(c) }}>editar</a></td>
                </tr>
              )
            })}
            {clientes.length === 0 && (
              <tr><td colSpan={gerente ? 10 : 9} style={{ color: 'var(--ink-soft)' }}>Nenhum cliente encontrado.</td></tr>
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
                <span className={`selo ${detalhe.segmento}`}>{detalhe.segmento}</span>
              </div>
              <button className="btn secundario" onClick={() => setDetalhe(null)}>Fechar</button>
            </div>

            <div className="grade-cards" style={{ marginTop: 16 }}>
              <div className="cartao kpi"><div className="rotulo">Total gasto</div><div className="valor">{formataReal(detalhe.totalGasto)}</div></div>
              <div className="cartao kpi"><div className="rotulo">Compras</div><div className="valor">{detalhe.vendas.filter((v) => v.status === 'CONCLUIDA').length}</div></div>
              <div className="cartao kpi">
                <div className="rotulo">Última compra</div>
                <div className="valor" style={{ fontSize: 18 }}>
                  {detalheDias == null ? '—' : detalheDias === 0 ? 'hoje' : `há ${detalheDias}d`}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0 16px' }}>
              {detalhe.telefone ? `📱 ${detalhe.telefone}` : ''}{detalhe.instagram ? `${detalhe.telefone ? ' · ' : ''}📷 ${detalhe.instagram}` : ''}
              {detalhe.vendedora ? ` · carteira de ${detalhe.vendedora.nome}` : ''}
              {detalhe.consentimentoLgpd ? ' · ✅ aceita campanhas' : ' · ⚠ sem consentimento LGPD'}
            </div>

            {detalhe.segmento === 'INATIVO' && (
              <div className="alerta" style={{ background: '#fff3e0', color: 'var(--warn)' }}>
                💡 Oportunidade de recuperação: cliente sem comprar há {detalheDias} dias. Acione na régua de inativos (Fase 4 — WhatsApp).
              </div>
            )}

            <h3 className="painel-titulo">Histórico de compras</h3>
            <table>
              <thead><tr><th>Data</th><th>Itens</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {detalhe.vendas.map((venda) => (
                  <tr key={venda.id} style={{ opacity: venda.status === 'CANCELADA' ? 0.5 : 1 }}>
                    <td>{dataCurta(venda.createdAt)}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                      {venda.itens.map((i) => `${i.quantidade}× ${i.variacao.produto.nome} ${i.variacao.cor}/${i.variacao.tamanho}`).join(' · ')}
                      {venda.atacado ? '  🏷️atacado' : ''}
                    </td>
                    <td>{formataReal(venda.total)}</td>
                    <td><span className={`selo ${venda.status === 'CONCLUIDA' ? 'ok' : 'baixo'}`}>{venda.status === 'CONCLUIDA' ? 'OK' : 'Cancelada'}</span></td>
                  </tr>
                ))}
                {detalhe.vendas.length === 0 && (
                  <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>Sem compras registradas — cliente novo na carteira.</td></tr>
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
            <h2>{editando.id ? 'Editar cliente' : 'Novo cliente'}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>Nome*</label>
                <input value={editando.nome ?? ''} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} required />
              </div>
              <div className="campo">
                <label>WhatsApp (com DDI)</label>
                <input value={editando.telefone ?? ''} onChange={(e) => setEditando({ ...editando, telefone: e.target.value })} placeholder="5562999998888" />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>E-mail</label>
                <input type="email" value={editando.email ?? ''} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              </div>
              <div className="campo">
                <label>Instagram</label>
                <input value={editando.instagram ?? ''} onChange={(e) => setEditando({ ...editando, instagram: e.target.value })} placeholder="@cliente" />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>CEP {cepBuscando && <span style={{ color: 'var(--ink-soft)' }}>· buscando…</span>}</label>
                <input value={editando.cep ?? ''} inputMode="numeric"
                  onChange={(e) => setEditando({ ...editando, cep: e.target.value })}
                  onBlur={(e) => buscarCep(e.target.value)} placeholder="74000-000" />
              </div>
              <div className="campo">
                <label>Cidade</label>
                <input value={editando.cidade ?? ''} onChange={(e) => setEditando({ ...editando, cidade: e.target.value })} placeholder="Preenche pelo CEP" />
              </div>
              <div className="campo" style={{ maxWidth: 90 }}>
                <label>UF</label>
                <input value={editando.uf ?? ''} maxLength={2}
                  onChange={(e) => setEditando({ ...editando, uf: e.target.value.toUpperCase() })} placeholder="GO" />
              </div>
            </div>
            {gerente && (
              <div className="campo">
                <label>Vendedora (carteira)</label>
                <select
                  value={(editando as { vendedoraId?: string }).vendedoraId ?? editando.vendedora?.id ?? ''}
                  onChange={(e) => setEditando({ ...editando, vendedoraId: e.target.value } as never)}
                >
                  <option value="">— Sem carteira —</option>
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
              <label htmlFor="lgpd" style={{ margin: 0 }}>Cliente consentiu receber campanhas (LGPD)</label>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

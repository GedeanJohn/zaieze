import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { useLojaAtiva } from '../componentes/SeletorLoja'

interface Colecao {
  id: string
  nome: string
  descricao?: string | null
  status: 'EM_PREPARACAO' | 'LIBERADA'
  liberadaEm?: string | null
  outlet: boolean
  outletDesde?: string | null
  descontoOutletPct?: number | null
  pecas: number
  lojaIds: string[] // lojas que podem vender a coleção (distribuição)
  midiaExpiraEm?: string | null
  diasParaExpirarMidia?: number | null
  midiaExpiradaEm?: string | null
}

interface FormC { id?: string; nome: string; descricao?: string }

// Peça da coleção, para configurar desconto por peça no Outlet.
interface PecaOutlet { id: string; nome: string; referencia?: string | null; precoVarejo: number; descontoOutletPct: number | null }
type EscopoDesconto = 'NENHUM' | 'COLECAO' | 'PECAS'
interface OutletForm {
  colecao: Colecao
  outlet: boolean
  escopo: EscopoDesconto
  pctColecao: string
  pecas: PecaOutlet[]
}

export default function Colecoes() {
  const escopo = useLojaAtiva()
  const usuario = usuarioLogado()!
  const podeOutlet = usuario.role === 'GESTOR' || usuario.role === 'GERENTE' || usuario.role === 'SUPER_ADMIN'
  const podeDistribuir = escopo.ehGestor || usuario.role === 'SUPER_ADMIN'
  const [lista, setLista] = useState<Colecao[]>([])
  const [form, setForm] = useState<FormC | null>(null)
  const [outlet, setOutlet] = useState<OutletForm | null>(null)
  const [distrib, setDistrib] = useState<{ colecao: Colecao; lojaIds: Set<string> } | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/colecoes', { params: escopo.params })
    setLista(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    try {
      const corpo = { nome: form.nome, descricao: form.descricao || undefined }
      if (form.id) await api.patch(`/colecoes/${form.id}`, corpo, { params: escopo.params })
      else await api.post('/colecoes', corpo, { params: escopo.params })
      setForm(null)
      carregar()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  async function liberar(c: Colecao) {
    if (!confirm(`Liberar a coleção "${c.nome}"? Ela passa a aparecer para TODAS as vendedoras ao mesmo tempo.`)) return
    try { await api.post(`/colecoes/${c.id}/liberar`, {}, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }

  // Chave rápida: liga/desliga o Outlet (o desconto fica na modal 🏷️ outlet, decisão do gestor).
  async function alternarOutlet(c: Colecao) {
    try { await api.post(`/colecoes/${c.id}/outlet`, { outlet: !c.outlet }, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }

  async function excluir(c: Colecao) {
    if (!confirm(`Excluir a coleção "${c.nome}"? As peças dela NÃO são apagadas — apenas ficam sem coleção.`)) return
    try { await api.delete(`/colecoes/${c.id}`, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }

  async function recolher(c: Colecao) {
    if (!confirm(`Recolher "${c.nome}"? Ela some do catálogo e do PDV das vendedoras.`)) return
    try { await api.post(`/colecoes/${c.id}/recolher`, {}, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }

  // Distribuição (estoque central): define em quais lojas a coleção fica disponível para venda.
  function alternarLojaDistrib(id: string) {
    if (!distrib) return
    const novo = new Set(distrib.lojaIds)
    if (novo.has(id)) novo.delete(id); else novo.add(id)
    setDistrib({ ...distrib, lojaIds: novo })
  }

  async function salvarDistribuicao(e: React.FormEvent) {
    e.preventDefault()
    if (!distrib) return
    setErro('')
    try {
      await api.put(`/colecoes/${distrib.colecao.id}/distribuicao`, { lojaIds: [...distrib.lojaIds] }, { params: escopo.params })
      setDistrib(null)
      carregar()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  // Abre a modal de Outlet: carrega as peças da coleção e infere o escopo de desconto atual.
  async function abrirOutlet(c: Colecao) {
    setErro('')
    try {
      const { data } = await api.get('/produtos', { params: { ...escopo.params, colecaoId: c.id } })
      const pecas: PecaOutlet[] = data.map((p: { id: string; nome: string; referencia?: string | null; precoVarejo: string; descontoOutletPct: number | null }) => ({
        id: p.id, nome: p.nome, referencia: p.referencia, precoVarejo: Number(p.precoVarejo), descontoOutletPct: p.descontoOutletPct,
      }))
      const temPctPeca = pecas.some((p) => p.descontoOutletPct != null)
      const escopoAtual: EscopoDesconto = !c.outlet
        ? 'NENHUM'
        : c.descontoOutletPct != null ? 'COLECAO' : temPctPeca ? 'PECAS' : 'NENHUM'
      setOutlet({
        colecao: c,
        outlet: c.outlet,
        escopo: escopoAtual,
        pctColecao: c.descontoOutletPct != null ? String(c.descontoOutletPct) : '',
        pecas,
      })
    } catch (err) { alert(mensagemDeErro(err)) }
  }

  async function salvarOutlet(e: React.FormEvent) {
    e.preventDefault()
    if (!outlet) return
    setErro('')
    const corpo: { outlet: boolean; descontoOutletPct?: number | null; descontosPorPeca?: { produtoId: string; pct: number | null }[] } = {
      outlet: outlet.outlet,
    }
    if (outlet.outlet && outlet.escopo === 'COLECAO') {
      const pct = parseInt(outlet.pctColecao, 10)
      if (!pct || pct < 1 || pct > 90) { setErro('Informe um desconto de coleção entre 1% e 90%.'); return }
      corpo.descontoOutletPct = pct
    } else {
      corpo.descontoOutletPct = null
    }
    if (outlet.outlet && outlet.escopo === 'PECAS') {
      corpo.descontosPorPeca = outlet.pecas.map((p) => ({ produtoId: p.id, pct: p.descontoOutletPct }))
    }
    try {
      await api.post(`/colecoes/${outlet.colecao.id}/outlet`, corpo, { params: escopo.params })
      setOutlet(null)
      carregar()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  function setPctPeca(id: string, valor: string) {
    if (!outlet) return
    const n = valor === '' ? null : Math.max(0, Math.min(90, parseInt(valor, 10) || 0))
    setOutlet({ ...outlet, pecas: outlet.pecas.map((p) => (p.id === id ? { ...p, descontoOutletPct: n } : p)) })
  }

  return (
    <>
      <header>
        <h1>Coleções</h1>
        <button className="btn" onClick={() => setForm({ nome: '' })}>+ Nova coleção</button>
      </header>

      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        O gestor de estoque monta a coleção <strong>em preparação</strong> (cadastrando as peças) e só então <strong>libera</strong> —
        aí ela aparece para todas as vendedoras simultaneamente, garantindo competição justa pelo estoque.
        {podeOutlet && <> Coleções antigas podem virar <strong>Outlet</strong> (selo no catálogo), com desconto opcional na coleção inteira ou em peças específicas.</>}
      </div>

      <div className="cartao">
        <table>
          <thead>
            <tr><th>Coleção</th><th>Status</th><th>Peças</th><th>Lojas</th><th>Liberada em</th><th></th></tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.nome}</strong>
                  {c.outlet && (
                    <span className="selo" style={{ marginLeft: 8, background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b55' }}>
                      🏷️ Outlet{c.descontoOutletPct ? ` −${c.descontoOutletPct}%` : ''}
                    </span>
                  )}
                  {c.descricao && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{c.descricao}</div>}
                  {c.midiaExpiradaEm ? (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>🗑️ mídia removida do catálogo ({new Date(c.midiaExpiradaEm).toLocaleDateString('pt-BR')})</div>
                  ) : c.diasParaExpirarMidia != null && c.diasParaExpirarMidia <= 30 && (
                    <div style={{ fontSize: 12, marginTop: 2, color: c.diasParaExpirarMidia <= 7 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
                      ⚠️ mídia expira em {c.diasParaExpirarMidia <= 0 ? 'breve' : `${c.diasParaExpirarMidia} dia(s)`}
                      {c.midiaExpiraEm ? ` (${new Date(c.midiaExpiraEm).toLocaleDateString('pt-BR')})` : ''} — marque Outlet ou promova as vendas
                    </div>
                  )}
                </td>
                <td>
                  <span className={`selo ${c.status === 'LIBERADA' ? 'ok' : 'baixo'}`}>
                    {c.status === 'LIBERADA' ? 'Liberada' : 'Em preparação'}
                  </span>
                </td>
                <td>{c.pecas}</td>
                <td>
                  {c.lojaIds.length === 0
                    ? <span style={{ color: 'var(--danger)', fontSize: 12 }}>nenhuma</span>
                    : <span style={{ fontSize: 13 }}>{c.lojaIds.length} loja{c.lojaIds.length > 1 ? 's' : ''}</span>}
                  {podeDistribuir && <>
                    {' '}
                    <a href="#" style={{ fontSize: 12 }} onClick={(e) => { e.preventDefault(); setDistrib({ colecao: c, lojaIds: new Set(c.lojaIds) }) }}>distribuir</a>
                  </>}
                </td>
                <td>{c.liberadaEm ? new Date(c.liberadaEm).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                  {c.status === 'EM_PREPARACAO'
                    ? <a href="#" onClick={(e) => { e.preventDefault(); liberar(c) }}>🚀 liberar</a>
                    : <a href="#" onClick={(e) => { e.preventDefault(); recolher(c) }}>recolher</a>}
                  {' · '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setForm({ id: c.id, nome: c.nome, descricao: c.descricao ?? '' }) }}>editar</a>
                  {' · '}
                  <label title="Enviar/retirar do Outlet" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={c.outlet} onChange={() => alternarOutlet(c)} style={{ width: 'auto' }} /> Outlet
                  </label>
                  {podeOutlet && c.outlet && <>
                    {' · '}
                    <a href="#" onClick={(e) => { e.preventDefault(); abrirOutlet(c) }}>desconto</a>
                  </>}
                  {' · '}
                  <a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); excluir(c) }}>excluir</a>
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-soft)' }}>Nenhuma coleção. Crie uma e cadastre as peças em Produtos.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar} style={{ width: 'min(520px, 92vw)' }}>
            <h2>{form.id ? 'Editar coleção' : 'Nova coleção'}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>Nome*</label>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Ex.: Verão 2026" />
            </div>
            <div className="campo">
              <label>Descrição</label>
              <input value={form.descricao ?? ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Opcional" />
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {outlet && (
        <div className="modal-fundo" onClick={() => setOutlet(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarOutlet} style={{ width: 'min(640px, 94vw)' }}>
            <h2>Outlet — {outlet.colecao.nome}</h2>
            {erro && <div className="alerta">{erro}</div>}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
              <input type="checkbox" checked={outlet.outlet} onChange={(e) => setOutlet({ ...outlet, outlet: e.target.checked, escopo: e.target.checked ? outlet.escopo : 'NENHUM' })} />
              <span>Marcar esta coleção como <strong>Outlet</strong> (selo no catálogo)</span>
            </label>

            {outlet.outlet && (
              <>
                <div className="campo">
                  <label>Desconto</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                    <label style={{ display: 'flex', gap: 8 }}>
                      <input type="radio" name="esc" checked={outlet.escopo === 'NENHUM'} onChange={() => setOutlet({ ...outlet, escopo: 'NENHUM' })} />
                      Sem desconto (só o selo de Outlet)
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input type="radio" name="esc" checked={outlet.escopo === 'COLECAO'} onChange={() => setOutlet({ ...outlet, escopo: 'COLECAO' })} />
                      Desconto na coleção inteira:
                      <input type="number" min={1} max={90} value={outlet.pctColecao} disabled={outlet.escopo !== 'COLECAO'}
                        onChange={(e) => setOutlet({ ...outlet, pctColecao: e.target.value })}
                        style={{ width: 80 }} placeholder="%" /> %
                    </label>
                    <label style={{ display: 'flex', gap: 8 }}>
                      <input type="radio" name="esc" checked={outlet.escopo === 'PECAS'} onChange={() => setOutlet({ ...outlet, escopo: 'PECAS' })} />
                      Desconto em peças específicas
                    </label>
                  </div>
                </div>

                {outlet.escopo === 'PECAS' && (
                  <div className="cartao" style={{ maxHeight: 280, overflowY: 'auto', padding: 8 }}>
                    {outlet.pecas.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Coleção sem peças.</div>}
                    {outlet.pecas.map((p) => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #ffffff14' }}>
                        <div style={{ flex: 1, fontSize: 13 }}>
                          {p.nome} <span style={{ color: 'var(--ink-soft)' }}>· R$ {p.precoVarejo.toFixed(2)}</span>
                        </div>
                        <input type="number" min={0} max={90} value={p.descontoOutletPct ?? ''} onChange={(e) => setPctPeca(p.id, e.target.value)}
                          style={{ width: 70 }} placeholder="%" /> <span style={{ fontSize: 13 }}>%</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setOutlet(null)}>Cancelar</button>
              <button className="btn">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {distrib && (
        <div className="modal-fundo" onClick={() => setDistrib(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarDistribuicao} style={{ width: 'min(520px, 92vw)' }}>
            <h2>Distribuir — {distrib.colecao.nome}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>
              Marque as lojas que podem <strong>vender</strong> esta coleção. O estoque é único (da fábrica) — isto é só permissão de venda.
            </div>
            {escopo.lojas.length === 0
              ? <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Nenhuma loja cadastrada na marca.</div>
              : (
                <div className="cartao" style={{ maxHeight: 320, overflowY: 'auto', padding: 8 }}>
                  {escopo.lojas.map((l) => (
                    <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={distrib.lojaIds.has(l.id)} onChange={() => alternarLojaDistrib(l.id)} style={{ width: 'auto' }} />
                      <span>{l.nome}{l.ativo ? '' : ' (inativa)'}</span>
                    </label>
                  ))}
                </div>
              )}
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setDistrib(null)}>Cancelar</button>
              <button className="btn">Salvar distribuição</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { useLojaAtiva } from '../componentes/SeletorLoja'
import { useIdioma } from '../lib/i18n'

interface Colecao {
  id: string
  nome: string
  descricao?: string | null
  status: 'EM_PREPARACAO' | 'LIBERADA'
  liberadaEm?: string | null
  validadeAte?: string | null
  vigenciaExpirada: boolean
  outlet: boolean
  outletDesde?: string | null
  descontoOutletPct?: number | null
  pecas: number
  lojaIds: string[] // lojas que podem vender a coleção (distribuição)
  midiaExpiraEm?: string | null
  diasParaExpirarMidia?: number | null
  midiaExpiradaEm?: string | null
}

interface FormC { id?: string; nome: string; descricao?: string; validadeAte?: string }

// Data pura (sem hora, ex.: "2026-01-01T00:00:00.000Z" vindo de <input type="date">) — formata pelos
// componentes UTC da própria string, sem passar pelo fuso local (evita cair um dia por causa do fuso).
function fmtDataPura(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

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
  const { t } = useIdioma()
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
      const corpo = { nome: form.nome, descricao: form.descricao || undefined, validadeAte: form.validadeAte || null }
      if (form.id) await api.patch(`/colecoes/${form.id}`, corpo, { params: escopo.params })
      else await api.post('/colecoes', corpo, { params: escopo.params })
      setForm(null)
      carregar()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  async function liberar(c: Colecao) {
    if (!confirm(t('col.confirmLiberar', { nome: c.nome }))) return
    try { await api.post(`/colecoes/${c.id}/liberar`, {}, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }

  // Chave rápida: liga/desliga o Outlet (o desconto fica na modal 🏷️ outlet, decisão do gestor).
  async function alternarOutlet(c: Colecao) {
    try { await api.post(`/colecoes/${c.id}/outlet`, { outlet: !c.outlet }, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }

  async function excluir(c: Colecao) {
    if (!confirm(t('col.confirmExcluir', { nome: c.nome }))) return
    try { await api.delete(`/colecoes/${c.id}`, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }

  async function recolher(c: Colecao) {
    if (!confirm(t('col.confirmRecolher', { nome: c.nome }))) return
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
      if (!pct || pct < 1 || pct > 90) { setErro(t('col.erroDescontoColecao')); return }
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
        <h1>{t('col.titulo')}</h1>
        <button className="btn" onClick={() => setForm({ nome: '' })}>{t('col.novaColecao')}</button>
      </header>

      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        {t('col.explicacao1')} <strong>{t('col.emPreparacaoDestaque')}</strong> {t('col.explicacao2')} <strong>{t('col.liberaDestaque')}</strong> —
        {' '}{t('col.explicacao3')}
        {podeOutlet && <> {t('col.outletExplicacao1')} <strong>{t('col.outletDestaque')}</strong> {t('col.outletExplicacao2')}</>}
      </div>

      <div className="cartao">
        <table>
          <thead>
            <tr><th>{t('col.colColecao')}</th><th>{t('col.colStatus')}</th><th>{t('col.colPecas')}</th><th>{t('col.colLojas')}</th><th>{t('col.colLiberadaEm')}</th><th></th></tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.nome}</strong>
                  {c.outlet && (
                    <span className="selo" style={{ marginLeft: 8, background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b55' }}>
                      🏷️ {t('col.outletDestaque')}{c.descontoOutletPct ? ` −${c.descontoOutletPct}%` : ''}
                    </span>
                  )}
                  {c.descricao && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{c.descricao}</div>}
                  {c.validadeAte && (
                    <div style={{ fontSize: 12, marginTop: 2, color: c.vigenciaExpirada ? '#ef4444' : 'var(--ink-soft)', fontWeight: c.vigenciaExpirada ? 600 : 400 }}>
                      {c.vigenciaExpirada
                        ? t('col.vigenciaExpirada', { data: fmtDataPura(c.validadeAte) })
                        : t('col.vigenciaAte', { data: fmtDataPura(c.validadeAte) })}
                    </div>
                  )}
                  {c.midiaExpiradaEm ? (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>{t('col.midiaRemovida', { data: new Date(c.midiaExpiradaEm).toLocaleDateString('pt-BR') })}</div>
                  ) : c.diasParaExpirarMidia != null && c.diasParaExpirarMidia <= 30 && (
                    <div style={{ fontSize: 12, marginTop: 2, color: c.diasParaExpirarMidia <= 7 ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
                      {t('col.midiaExpiraAviso', {
                        tempo: c.diasParaExpirarMidia <= 0 ? t('col.midiaExpiraEmBreve') : t('col.midiaExpiraDias', { n: c.diasParaExpirarMidia }),
                        dataSufixo: c.midiaExpiraEm ? ` (${new Date(c.midiaExpiraEm).toLocaleDateString('pt-BR')})` : '',
                      })}
                    </div>
                  )}
                </td>
                <td>
                  <span className={`selo ${c.status === 'LIBERADA' ? 'ok' : 'baixo'}`}>
                    {c.status === 'LIBERADA' ? t('col.liberada') : t('col.emPreparacao')}
                  </span>
                </td>
                <td>{c.pecas}</td>
                <td>
                  {c.lojaIds.length === 0
                    ? <span style={{ color: 'var(--danger)', fontSize: 12 }}>{t('col.nenhuma')}</span>
                    : <span style={{ fontSize: 13 }}>{t('col.lojasCount', { n: c.lojaIds.length })}</span>}
                  {podeDistribuir && <>
                    {' '}
                    <a href="#" style={{ fontSize: 12 }} onClick={(e) => { e.preventDefault(); setDistrib({ colecao: c, lojaIds: new Set(c.lojaIds) }) }}>{t('col.distribuir')}</a>
                  </>}
                </td>
                <td>{c.liberadaEm ? new Date(c.liberadaEm).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                  {c.status === 'EM_PREPARACAO'
                    ? <a href="#" onClick={(e) => { e.preventDefault(); liberar(c) }}>{t('col.liberar')}</a>
                    : <a href="#" onClick={(e) => { e.preventDefault(); recolher(c) }}>{t('col.recolher')}</a>}
                  {' · '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setForm({ id: c.id, nome: c.nome, descricao: c.descricao ?? '', validadeAte: c.validadeAte ? c.validadeAte.slice(0, 10) : '' }) }}>{t('col.editar')}</a>
                  {' · '}
                  <label title={t('col.outletTitle')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={c.outlet} onChange={() => alternarOutlet(c)} style={{ width: 'auto' }} /> {t('col.outletCheckbox')}
                  </label>
                  {podeOutlet && c.outlet && <>
                    {' · '}
                    <a href="#" onClick={(e) => { e.preventDefault(); abrirOutlet(c) }}>{t('col.desconto')}</a>
                  </>}
                  {' · '}
                  <a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); excluir(c) }}>{t('col.excluir')}</a>
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-soft)' }}>{t('col.nenhumaColecao')}</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar} style={{ width: 'min(520px, 92vw)' }}>
            <h2>{form.id ? t('col.editarColecaoTitulo') : t('col.novaColecaoTitulo')}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>{t('col.nomeLabel')}</label>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder={t('col.nomePlaceholder')} />
            </div>
            <div className="campo">
              <label>{t('col.descricaoLabel')}</label>
              <input value={form.descricao ?? ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder={t('col.descricaoPlaceholder')} />
            </div>
            <div className="campo">
              <label>{t('col.validadeLabel')}</label>
              <input type="date" value={form.validadeAte ?? ''} onChange={(e) => setForm({ ...form, validadeAte: e.target.value })} />
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{t('col.validadeAjuda')}</div>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('comum.salvar')}</button>
            </div>
          </form>
        </div>
      )}

      {outlet && (
        <div className="modal-fundo" onClick={() => setOutlet(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarOutlet} style={{ width: 'min(640px, 94vw)' }}>
            <h2>{t('col.outletModalTitulo', { nome: outlet.colecao.nome })}</h2>
            {erro && <div className="alerta">{erro}</div>}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
              <input type="checkbox" checked={outlet.outlet} onChange={(e) => setOutlet({ ...outlet, outlet: e.target.checked, escopo: e.target.checked ? outlet.escopo : 'NENHUM' })} />
              <span>{t('col.marcarOutletTexto1')} <strong>{t('col.outletDestaque')}</strong> {t('col.marcarOutletTexto2')}</span>
            </label>

            {outlet.outlet && (
              <>
                <div className="campo">
                  <label>{t('col.descontoLabel')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14 }}>
                    <label style={{ display: 'flex', gap: 8 }}>
                      <input type="radio" name="esc" checked={outlet.escopo === 'NENHUM'} onChange={() => setOutlet({ ...outlet, escopo: 'NENHUM' })} />
                      {t('col.semDescontoOpt')}
                    </label>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input type="radio" name="esc" checked={outlet.escopo === 'COLECAO'} onChange={() => setOutlet({ ...outlet, escopo: 'COLECAO' })} />
                      {t('col.descontoColecaoOpt')}
                      <input type="number" min={1} max={90} value={outlet.pctColecao} disabled={outlet.escopo !== 'COLECAO'}
                        onChange={(e) => setOutlet({ ...outlet, pctColecao: e.target.value })}
                        style={{ width: 80 }} placeholder="%" /> %
                    </label>
                    <label style={{ display: 'flex', gap: 8 }}>
                      <input type="radio" name="esc" checked={outlet.escopo === 'PECAS'} onChange={() => setOutlet({ ...outlet, escopo: 'PECAS' })} />
                      {t('col.descontoPecasOpt')}
                    </label>
                  </div>
                </div>

                {outlet.escopo === 'PECAS' && (
                  <div className="cartao" style={{ maxHeight: 280, overflowY: 'auto', padding: 8 }}>
                    {outlet.pecas.length === 0 && <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('col.colecaoSemPecas')}</div>}
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
              <button type="button" className="btn secundario" onClick={() => setOutlet(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('comum.salvar')}</button>
            </div>
          </form>
        </div>
      )}

      {distrib && (
        <div className="modal-fundo" onClick={() => setDistrib(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarDistribuicao} style={{ width: 'min(520px, 92vw)' }}>
            <h2>{t('col.distribuirModalTitulo', { nome: distrib.colecao.nome })}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 10 }}>
              {t('col.distribuirExplicacao1')} <strong>{t('col.venderDestaque')}</strong> {t('col.distribuirExplicacao2')}
            </div>
            {escopo.lojas.length === 0
              ? <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('col.nenhumaLojaCadastradaMarca')}</div>
              : (
                <div className="cartao" style={{ maxHeight: 320, overflowY: 'auto', padding: 8 }}>
                  {escopo.lojas.map((l) => (
                    <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={distrib.lojaIds.has(l.id)} onChange={() => alternarLojaDistrib(l.id)} style={{ width: 'auto' }} />
                      <span>{l.nome}{l.ativo ? '' : ` ${t('equipe.inativaSufixo')}`}</span>
                    </label>
                  ))}
                </div>
              )}
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setDistrib(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('col.salvarDistribuicao')}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

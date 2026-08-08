import { useEffect, useState } from 'react'
import { api, atualizarUsuarioLocal, formataReal, mensagemDeErro, usuarioLogado } from '../api'
import { useIdioma } from '../lib/i18n'
import ConvidarModal from '../componentes/ConvidarModal'

interface AddonCatalogo { tipo: string; nome: string; resumo: string; preco: number }
interface AssinaturaAddon {
  tipo: string
  status: 'PENDENTE' | 'ATIVA' | 'CANCELADA'
  valor: string
  simulada: boolean
  cicloFimEm: string | null
  cancelamentoSolicitadoEm: string | null
}

interface AssentoVendedora {
  id: string
  numeroAssento: number
  status: 'PENDENTE' | 'ATIVA' | 'CANCELADA'
  gratuito: boolean
  cancelamentoAgendado: boolean
  aprovadoEm: string | null
  vendedoraId: string | null
  vendedoraNome: string | null
}

/** Cobrança CONSOLIDADA da marca (uma só, com desconto por volume — não é mais por vendedora). */
interface AssinaturaRede {
  existe: boolean
  status?: 'PENDENTE' | 'ATIVA' | 'CANCELADA'
  valor?: number
  valorProximoCiclo?: number | null
  qtdPaga?: number
  simulada?: boolean
  cicloFimEm?: string | null
  cancelamentoSolicitadoEm?: string | null
}

interface PendenteAprovacao {
  id: string
  createdAt: string
  nome: string | null
  email: string | null
  telefone: string | null
  solicitadoPorNome: string
}

function fmtData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
}

export default function Planos() {
  const { t } = useIdioma()
  const usuario = usuarioLogado()!
  const ehGestor = usuario.role === 'GESTOR' || usuario.role === 'SUPER_ADMIN'
  const [precoAssento, setPrecoAssento] = useState(0)
  const [assinaturaRede, setAssinaturaRede] = useState<AssinaturaRede>({ existe: false })
  const [assentos, setAssentos] = useState<AssentoVendedora[]>([])
  const [pendentes, setPendentes] = useState<PendenteAprovacao[]>([])
  const [addonsCatalogo, setAddonsCatalogo] = useState<AddonCatalogo[]>([])
  const [addonsMinha, setAddonsMinha] = useState<AssinaturaAddon[]>([])
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [lojas, setLojas] = useState<{ id: string; nome: string }[]>([])
  const [convidarAberto, setConvidarAberto] = useState(false)
  const [cupomPorAssento, setCupomPorAssento] = useState<Record<string, string>>({})

  function carregar() {
    api.get('/vendedora-billing/preco').then(({ data }) => setPrecoAssento(data.preco)).catch(() => {})
    api.get('/vendedora-billing/minhas').then(({ data }) => setAssentos(data.assinaturas)).catch(() => setAssentos([]))
    if (ehGestor) {
      api.get('/vendedora-billing/rede').then(({ data }) => setAssinaturaRede(data)).catch(() => setAssinaturaRede({ existe: false }))
      api.get('/vendedora-billing/pendentes-aprovacao').then(({ data }) => setPendentes(data.pendentes)).catch(() => setPendentes([]))
      api.get('/lojas').then(({ data }) => setLojas(data.map((l: { id: string; nome: string }) => ({ id: l.id, nome: l.nome })))).catch(() => setLojas([]))
    }
    api.get('/addons').then(({ data }) => setAddonsCatalogo(data.addons)).catch(() => {})
    api.get('/addons/minha').then(({ data }) => {
      setAddonsMinha(data.addons)
      const ativos = (data.addons as AssinaturaAddon[]).filter((a) => a.status === 'ATIVA').map((a) => a.tipo)
      const u = usuarioLogado()
      if (u?.rede) atualizarUsuarioLocal({ rede: { ...u.rede, addonsAtivos: ativos } })
    }).catch(() => {})
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function aprovar(p: PendenteAprovacao) {
    setErro(''); setMsg(''); setOcupado(true)
    try {
      await api.post(`/vendedora-billing/${p.id}/aprovar`)
      setMsg(`Solicitação de ${p.nome ?? 'vendedora'} aprovada.`)
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  async function recusar(p: PendenteAprovacao) {
    if (!window.confirm(`Recusar a solicitação de ${p.nome ?? 'vendedora'}? Nada foi cobrado ainda.`)) return
    setErro(''); setMsg(''); setOcupado(true)
    try {
      await api.post(`/vendedora-billing/${p.id}/recusar`)
      setMsg('Solicitação recusada.')
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  async function cancelarAssento(a: AssentoVendedora) {
    if (!window.confirm(`Cancelar este assento${a.vendedoraNome ? ` (${a.vendedoraNome})` : ''}? Se for um assento pago, ela mantém o acesso e continua contando na cobrança até o fim do ciclo já pago (não é prorrateado).`)) return
    setErro(''); setMsg(''); setOcupado(true)
    try {
      const { data } = await api.post(`/vendedora-billing/${a.id}/cancelar`)
      setMsg(data.acessoAte ? `Cancelamento agendado — acesso garantido até ${fmtData(data.acessoAte)}.` : 'Assento cancelado.')
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  async function reativarAssento(a: AssentoVendedora) {
    setErro(''); setMsg(''); setOcupado(true)
    try {
      await api.post(`/vendedora-billing/${a.id}/reativar`)
      setMsg('Cancelamento desfeito.')
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  async function aplicarCupom(a: AssentoVendedora) {
    const codigo = (cupomPorAssento[a.id] ?? '').trim()
    if (!codigo) return
    setErro(''); setMsg(''); setOcupado(true)
    try {
      await api.post(`/vendedora-billing/${a.id}/aplicar-cupom`, { codigo })
      setMsg(`Cupom aplicado${a.vendedoraNome ? ` — ${a.vendedoraNome}` : ''} agora é gratuita.`)
      setCupomPorAssento((s) => ({ ...s, [a.id]: '' }))
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  async function assinarAddon(tipo: string) {
    setErro(''); setMsg(''); setOcupado(true)
    try {
      const { data } = await api.post(`/addons/${tipo}/checkout`, {})
      if (data.initPoint) { window.location.href = data.initPoint; return }
      setMsg(t('planosApp.addonAtivadoMsg'))
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  async function cancelarAddon(tipo: string) {
    if (!window.confirm(t('planosApp.confirmCancelarAddon'))) return
    setErro(''); setMsg(''); setOcupado(true)
    try {
      const { data } = await api.post(`/addons/${tipo}/cancelar`, {})
      setMsg(t('planosApp.cancelamentoAgendadoMsg', { data: fmtData(data.acessoAte) }))
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  async function reativarAddon(tipo: string) {
    setErro(''); setMsg(''); setOcupado(true)
    try {
      await api.post(`/addons/${tipo}/reativar`, {})
      setMsg(t('planosApp.assinaturaReativadaMsg'))
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) } finally { setOcupado(false) }
  }

  const assentosAtivos = assentos.filter((a) => a.status !== 'CANCELADA')
  const mudaDeFaixa = assinaturaRede.existe && assinaturaRede.valorProximoCiclo != null && assinaturaRede.valorProximoCiclo !== assinaturaRede.valor

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>💳 Contas de vendedora</h1>
          <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
            Cobrança consolidada por marca, com desconto por volume — a partir de {formataReal(precoAssento)}/mês.
          </div>
        </div>
        {ehGestor && <button className="btn" onClick={() => setConvidarAberto(true)}>+ Nova vendedora</button>}
      </header>
      {convidarAberto && (
        <ConvidarModal
          papeis={[{ valor: 'VENDEDORA', rotulo: 'Vendedora' }]}
          lojas={lojas}
          onClose={() => { setConvidarAberto(false); carregar() }}
        />
      )}

      {erro && <div className="alerta">{erro}</div>}
      {msg && <div className="sucesso">{msg}</div>}

      {ehGestor && (
        <div className="cartao">
          <h2 style={{ marginTop: 0, fontSize: 16 }}>Cobrança consolidada da marca</h2>
          {!assinaturaRede.existe ? (
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0 }}>
              Nenhuma vendedora paga ainda — a cobrança nasce quando a 1ª vendedora sem cupom for aprovada.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Vendedoras pagas</div><div style={{ fontSize: 22, fontWeight: 800 }}>{assinaturaRede.qtdPaga}</div></div>
                <div><div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Valor mensal</div><div style={{ fontSize: 22, fontWeight: 800 }}>{formataReal(assinaturaRede.valor ?? 0)}{assinaturaRede.simulada && <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontWeight: 400 }}> (sim)</span>}</div></div>
                <div><div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Status</div><div style={{ fontSize: 22, fontWeight: 800 }}><span className={`selo ${assinaturaRede.status === 'ATIVA' ? 'ok' : assinaturaRede.status === 'CANCELADA' ? 'baixo' : 'ATACADO'}`}>{assinaturaRede.status}</span></div></div>
              </div>
              {mudaDeFaixa && (
                <div className="alerta" style={{ marginTop: 12 }}>
                  Sua cobrança muda de {formataReal(assinaturaRede.valor ?? 0)} pra {formataReal(assinaturaRede.valorProximoCiclo ?? 0)}
                  {' '}a partir de {fmtData(assinaturaRede.cicloFimEm ?? null)}. Até lá, o valor atual continua valendo — vendedora
                  cancelada nesse meio-tempo mantém acesso e continua contando na faixa até essa data, sem desconto proporcional.
                </div>
              )}
              {assinaturaRede.cancelamentoSolicitadoEm && (
                <div className="alerta" style={{ marginTop: 12 }}>
                  Cobrança encerra em {fmtData(assinaturaRede.cicloFimEm ?? null)} — não sobrou nenhuma vendedora paga.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {ehGestor && pendentes.length > 0 && (
        <div className="cartao" style={{ borderLeft: '4px solid var(--accent)' }}>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>🕓 Aguardando sua aprovação ({pendentes.length})</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
            O gerente solicitou estas contas de vendedora — nada foi cobrado ainda. Aprove pra entrar na cobrança da marca.
          </p>
          <table>
            <thead><tr><th>Vendedora</th><th>Contato</th><th>Solicitado por</th><th></th></tr></thead>
            <tbody>
              {pendentes.map((p) => (
                <tr key={p.id}>
                  <td>{p.nome ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{p.email}<br />{p.telefone}</td>
                  <td>{p.solicitadoPorNome}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); aprovar(p) }} style={{ fontWeight: 600 }}>Aprovar</a>
                    {' · '}
                    <a href="#" onClick={(e) => { e.preventDefault(); recusar(p) }} style={{ color: 'var(--danger)' }}>Recusar</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Minhas contas de vendedora ({assentosAtivos.length})</h2>
        <table>
          <thead><tr><th>Vendedora</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {assentos.map((a) => (
                <tr key={a.id}>
                  <td>{a.vendedoraNome ?? <span style={{ color: 'var(--ink-soft)' }}>aguardando cadastro</span>}</td>
                  <td>
                    <span className={`selo ${a.status === 'ATIVA' ? 'ok' : a.status === 'CANCELADA' ? 'baixo' : 'ATACADO'}`}>{a.status}</span>
                    {a.gratuito && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}> (grátis — cupom)</span>}
                    {a.cancelamentoAgendado && (
                      <div style={{ fontSize: 11, color: 'var(--danger)' }}>cancela em {fmtData(assinaturaRede.cicloFimEm ?? null)}</div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {a.status === 'ATIVA' && !a.gratuito && !a.cancelamentoAgendado && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        <input
                          value={cupomPorAssento[a.id] ?? ''}
                          onChange={(e) => setCupomPorAssento((s) => ({ ...s, [a.id]: e.target.value.toUpperCase() }))}
                          placeholder="Cupom"
                          style={{ width: 90, fontSize: 12, padding: '2px 6px' }}
                        />
                        <a href="#" onClick={(e) => { e.preventDefault(); aplicarCupom(a) }} style={{ fontWeight: 600 }}>aplicar</a>
                      </div>
                    )}
                    {a.status !== 'CANCELADA' && (
                      a.cancelamentoAgendado
                        ? <a href="#" onClick={(e) => { e.preventDefault(); reativarAssento(a) }}>reativar</a>
                        : <a href="#" onClick={(e) => { e.preventDefault(); cancelarAssento(a) }} style={{ color: 'var(--danger)' }}>cancelar</a>
                    )}
                  </td>
                </tr>
            ))}
            {assentos.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>Nenhuma conta de vendedora ainda.</td></tr>}
          </tbody>
        </table>
      </div>

      {addonsCatalogo.length > 0 && (
        <>
          <header style={{ marginTop: 24 }}><h2>{t('planosApp.addonsTitulo')}</h2></header>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>{t('planosApp.addonsSubtitulo')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {addonsCatalogo.map((a) => {
              const minha = addonsMinha.find((x) => x.tipo === a.tipo)
              const ativa = minha?.status === 'ATIVA'
              const agendado = ativa && !!minha?.cancelamentoSolicitadoEm
              return (
                <div key={a.tipo} className="cartao" style={{ borderTop: `4px solid ${ativa ? 'var(--accent)' : 'var(--border)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h3 style={{ margin: 0 }}>{a.nome}</h3>
                    {ativa && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{t('planosApp.addonAtivo')}</span>}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, margin: '8px 0' }}>
                    {formataReal(a.preco)}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-soft)' }}>/{t('unidade.mes')}</span>
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 12 }}>{a.resumo}</div>
                  {ativa && minha?.simulada && <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>{t('planosApp.simulada')}</div>}
                  {ativa && agendado && (
                    <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>
                      {t('planosApp.cancelamentoAgendadoTexto', { data: fmtData(minha?.cicloFimEm ?? null) })}
                    </div>
                  )}
                  {ativa
                    ? agendado
                      ? <button className="btn" style={{ width: '100%' }} onClick={() => reativarAddon(a.tipo)} disabled={ocupado}>{t('planosApp.reativarBtn')}</button>
                      : <button className="btn secundario" style={{ width: '100%' }} onClick={() => cancelarAddon(a.tipo)} disabled={ocupado}>{t('planosApp.cancelarBtn')}</button>
                    : <button className="btn" style={{ width: '100%' }} onClick={() => assinarAddon(a.tipo)} disabled={ocupado}>{t('planosApp.assinarAddonBtn')}</button>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, formataReal, mensagemDeErro } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useIdioma } from '../lib/i18n'

interface PedidoSep {
  id: string
  tokenPublico: string
  createdAt: string
  total: string
  atacado: boolean
  canal: 'BALCAO' | 'ONLINE' | 'MERCADO_LIVRE'
  separado: boolean
  separadoEm: string | null
  pagamentoConferido: boolean
  pagamentoConferidoEm: string | null
  cliente: string
  vendedora: string
  pecas: number
}

const dataBR = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Tempo decorrido desde a venda (cobrança do gerente: há quanto tempo está pendente). */
function tempoDecorrido(iso: string, t: (chave: string, vars?: Record<string, string | number>) => string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return t('sep.haMin', { n: Math.max(1, Math.floor(ms / 60_000)) })
  if (h < 48) return t('sep.haH', { n: h })
  return t('sep.haDias', { n: Math.floor(h / 24) })
}

export default function Separacao() {
  const escopo = useLojaAtiva()
  const { t } = useIdioma()
  const [pedidos, setPedidos] = useState<PedidoSep[]>([])
  const [verTodos, setVerTodos] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState('')

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    setErro('')
    try {
      const params = { ...escopo.params, status: verTodos ? 'todos' : 'pendentes' }
      const { data } = await api.get('/vendas/separacao', { params })
      setPedidos(data)
    } catch (err) { setErro(mensagemDeErro(err)) }
  }, [escopo.pronto, escopo.params, verTodos])

  useEffect(() => { carregar() }, [carregar])

  async function alternar(p: PedidoSep) {
    setSalvando(p.id); setErro('')
    try {
      await api.patch(`/vendas/${p.id}/separado`, { separado: !p.separado }, { params: escopo.params })
      carregar()
    } catch (err) { setErro(mensagemDeErro(err)) } finally { setSalvando('') }
  }

  async function alternarPagamento(p: PedidoSep) {
    setSalvando(`pg-${p.id}`); setErro('')
    try {
      await api.patch(`/vendas/${p.id}/pagamento-conferido`, { pagamentoConferido: !p.pagamentoConferido }, { params: escopo.params })
      carregar()
    } catch (err) { setErro(mensagemDeErro(err)) } finally { setSalvando('') }
  }

  function abrirComprovante(token: string) {
    window.open(`${window.location.origin}/pedido/publico/${token}`, '_blank', 'noreferrer')
  }

  const pendentes = useMemo(() => pedidos.filter((p) => !p.separado).length, [pedidos])

  return (
    <>
      <header>
        <h1>{t('sep.titulo')}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <SeletorLoja escopo={escopo} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} />
            {t('sep.mostrarSeparados')}
          </label>
        </div>
      </header>

      <p style={{ color: 'var(--ink-soft)', marginTop: -4 }}>
        {t('sep.explicacao1')} <strong>{t('sep.pendenteDestaque')}</strong>{t('sep.explicacao2')}
        <strong> {t('sep.separadoDestaque')}</strong>{t('sep.explicacao3')}
      </p>

      {erro && <div className="alerta">{erro}</div>}

      <div style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 10px' }}>
        {pendentes > 0 ? <strong style={{ color: '#c2552b' }}>{t('sep.pendentesSufixo', { n: pendentes })}</strong> : t('sep.nenhumPendenteFesta')}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pedidos.map((p) => (
          <div key={p.id} className="cartao" style={{ padding: 12, borderLeft: `4px solid ${p.separado ? '#7ce8a0' : '#e8a87c'}`, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{t('sep.pedidoLabel')} {p.id.slice(-6).toUpperCase()}</strong>
                <span className={`selo ${p.atacado ? 'baixo' : ''}`} style={{ fontSize: 11 }}>{p.atacado ? 'ATACADO' : 'VAREJO'}</span>
                {p.canal === 'ONLINE' && <span className="selo" style={{ fontSize: 11 }}>{t('sep.canalOnline')}</span>}
                {p.separado
                  ? <span className="selo ok" style={{ fontSize: 11 }}>{t('sep.separadoStatus')}</span>
                  : <span className="selo" style={{ fontSize: 11, background: '#e8a87c33', color: '#a85a2b' }}>{t('sep.pendenteHa')} {tempoDecorrido(p.createdAt, t)}</span>}
                {p.pagamentoConferido
                  ? <span className="selo ok" style={{ fontSize: 11 }}>{t('sep.pagamentoConferidoStatus')}</span>
                  : <span className="selo" style={{ fontSize: 11, background: '#e5484d22', color: '#c2352b' }}>{t('sep.pagamentoPendenteStatus')}</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
                {dataBR(p.createdAt)} · {p.cliente} · {t('sep.pecasSufixo', { n: p.pecas })} · {formataReal(p.total)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2 }}>
                {t('sep.vendedoraLabel')} {p.vendedora}{p.separado && p.separadoEm ? ` · ${t('sep.separadoEmSufixo')} ${dataBR(p.separadoEm)}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn secundario" onClick={() => abrirComprovante(p.tokenPublico)}>{t('sep.comprovante')}</button>
              <button className={`btn ${p.pagamentoConferido ? 'secundario' : ''}`} disabled={salvando === `pg-${p.id}`} onClick={() => alternarPagamento(p)}>
                {salvando === `pg-${p.id}` ? '…' : p.pagamentoConferido ? t('sep.desmarcarConferido') : t('sep.marcarConferido')}
              </button>
              <button className={`btn ${p.separado ? 'secundario' : ''}`} disabled={salvando === p.id} onClick={() => alternar(p)}>
                {salvando === p.id ? '…' : p.separado ? t('sep.reabrir') : t('sep.marcarSeparado')}
              </button>
            </div>
          </div>
        ))}
        {pedidos.length === 0 && <div style={{ color: 'var(--ink-soft)', padding: 14 }}>{verTodos ? t('sep.nenhumPedido') : t('sep.nenhumPedidoPendente')}</div>}
      </div>
    </>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'

interface Oportunidade {
  produtoId: string
  produto: string
  referencia: string | null
  categoria: string | null
  estoqueParado: number
  valorParado: number
  clientesAlvo: number
  clienteIds: string[]
  mensagemSugerida: string
  explicacaoIa: string
  viaIa: boolean
}

interface Creditos { usados: number; limite: number; ok: boolean }
interface EmpresaProspeccao {
  id: string; nome: string; categoria: string | null; telefone: string | null; site: string | null
  endereco: string | null; notaGoogle: string | null; totalAvaliacoes: number | null; horarioFuncionamento: string[] | null
}
interface BuscaProspeccao { id: string; segmento: string; cidade: string; uf: string; simulada: boolean; empresas: EmpresaProspeccao[] }

export default function Radar() {
  const escopo = useLojaAtiva()
  const { t } = useIdioma()
  const [ops, setOps] = useState<Oportunidade[]>([])
  const [disparo, setDisparo] = useState<{ op: Oportunidade; texto: string } | null>(null)
  const [erro, setErro] = useState('')
  const avisar = useToast()
  const [enviando, setEnviando] = useState(false)

  // Prospecção de empresas novas (créditos de IA Captador)
  const [creditos, setCreditos] = useState<Creditos | null>(null)
  const [segmento, setSegmento] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [tipoEmpresa, setTipoEmpresa] = useState('')
  const [perfilIdeal, setPerfilIdeal] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultadoBusca, setResultadoBusca] = useState<BuscaProspeccao | null>(null)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/radar', { params: escopo.params })
    setOps(data.oportunidades)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  const carregarCreditos = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/radar/creditos', { params: escopo.params })
    setCreditos(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregarCreditos() }, [carregarCreditos])

  async function buscarEmpresas(e: React.FormEvent) {
    e.preventDefault()
    setBuscando(true)
    try {
      const { data } = await api.post('/radar/prospeccao', { segmento, cidade, uf, tipoEmpresa: tipoEmpresa || undefined, perfilIdeal: perfilIdeal || undefined }, { params: escopo.params })
      setResultadoBusca(data)
      carregarCreditos()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setBuscando(false) }
  }

  async function confirmar() {
    if (!disparo) return
    setEnviando(true); setErro('')
    try {
      const { data } = await api.post('/campanhas', {
        nome: `Radar — ${disparo.op.produto}`,
        clienteIds: disparo.op.clienteIds,
        mensagemTemplate: disparo.texto,
      }, { params: escopo.params })
      const partes = [t('camp.parteEnviadas', { n: data.enviados }), data.simulados ? t('camp.parteSimuladas', { n: data.simulados }) : '', data.semConsentimento ? t('camp.parteSemLgpdModelo', { n: data.semConsentimento }) : '']
      setDisparo(null)
      avisar(t('radar.campanhaDisparadaSucesso', { alcance: data.alcance, partes: partes.filter(Boolean).join(' · ') }))
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <header>
        <h1>{t('radar.titulo')}</h1>
        <SeletorLoja escopo={escopo} />
      </header>

      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        {t('radar.explicacao1')} <strong>{t('radar.estoqueParadoDestaque')}</strong> {t('radar.explicacao2')} <strong>{t('radar.perfilClientesDestaque')}</strong> {t('radar.explicacao3')}
      </div>

      {erro && !disparo && <div className="alerta">{erro}</div>}

      <div className="grade-cards">
        {ops.map((op) => (
          <div className="cartao" key={op.produtoId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <strong style={{ fontFamily: 'Georgia, serif', fontSize: 17 }}>{op.produto}</strong>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'Consolas, monospace' }}>{op.referencia ?? ''}</div>
            </div>
            {op.categoria && <span className="selo ATACADO" style={{ alignSelf: 'flex-start' }}>{op.categoria}</span>}
            <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
              📦 {t('radar.paradasSufixo', { n: op.estoqueParado })} · {formataReal(op.valorParado)} {t('radar.imobilizadoSufixo')}
            </div>
            <div style={{ fontSize: 15 }}>
              🎯 <strong>{op.clientesAlvo}</strong> {t('radar.clientesPerfilSufixo')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', fontStyle: 'italic' }}>💡 {op.explicacaoIa}</div>
            <button className="btn" style={{ marginTop: 'auto' }} onClick={() => setDisparo({ op, texto: op.mensagemSugerida })}>
              {t('radar.dispararCampanha')}
            </button>
          </div>
        ))}
        {ops.length === 0 && (
          <div className="cartao" style={{ color: 'var(--ink-soft)' }}>
            {t('radar.nenhumaOportunidade')}
          </div>
        )}
      </div>

      {/* ── Prospecção de empresas novas (créditos de IA Captador) ── */}
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>
          {t('radar.prospTitulo')}
          {creditos && (
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-soft)', marginLeft: 10 }}>
              {t('radar.prospCreditos', { usados: creditos.usados, limite: creditos.limite })}
            </span>
          )}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>{t('radar.prospExplicacao')}</p>

        <form onSubmit={buscarEmpresas} className="linha-campos" style={{ alignItems: 'end' }}>
          <div className="campo"><label>{t('radar.prospSegmentoLabel')}</label><input value={segmento} onChange={(e) => setSegmento(e.target.value)} required minLength={2} /></div>
          <div className="campo"><label>{t('radar.prospCidadeLabel')}</label><input value={cidade} onChange={(e) => setCidade(e.target.value)} required minLength={2} /></div>
          <div className="campo" style={{ maxWidth: 90 }}><label>{t('radar.prospUfLabel')}</label><input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} required /></div>
          <div className="campo"><label>{t('radar.prospTipoEmpresaLabel')}</label><input value={tipoEmpresa} onChange={(e) => setTipoEmpresa(e.target.value)} /></div>
          <div>
            <button className="btn" disabled={buscando || (creditos ? !creditos.ok : false)}>
              {buscando ? t('radar.prospBuscando') : t('radar.prospBuscarBtn')}
            </button>
          </div>
        </form>
        <div className="campo">
          <label>{t('radar.prospPerfilIdealLabel')}</label>
          <textarea rows={2} value={perfilIdeal} onChange={(e) => setPerfilIdeal(e.target.value)} />
        </div>
        {creditos && !creditos.ok && <div className="alerta">{t('radar.prospSemCreditos')}</div>}

        {resultadoBusca && (
          <>
            {resultadoBusca.simulada && <div className="alerta" style={{ marginBottom: 10 }}>{t('radar.prospSimulado')}</div>}
            <table style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>{t('radar.prospColNome')}</th><th>{t('radar.prospColTelefone')}</th><th>{t('radar.prospColSite')}</th>
                  <th>{t('radar.prospColEndereco')}</th><th>{t('radar.prospColNota')}</th><th>{t('radar.prospColHorario')}</th>
                </tr>
              </thead>
              <tbody>
                {resultadoBusca.empresas.map((emp) => (
                  <tr key={emp.id}>
                    <td>{emp.nome}</td>
                    <td>{emp.telefone ? <a href={`https://wa.me/${emp.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{emp.telefone}</a> : '—'}</td>
                    <td>{emp.site ? <a href={emp.site} target="_blank" rel="noreferrer">site</a> : '—'}</td>
                    <td style={{ fontSize: 12 }}>{emp.endereco ?? '—'}</td>
                    <td>{emp.notaGoogle ? `★ ${emp.notaGoogle} (${emp.totalAvaliacoes ?? 0})` : '—'}</td>
                    <td style={{ fontSize: 12 }}>{emp.horarioFuncionamento?.[0] ?? '—'}</td>
                  </tr>
                ))}
                {resultadoBusca.empresas.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-soft)' }}>{t('radar.prospNenhumaEmpresa')}</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>

      {disparo && (
        <div className="modal-fundo" onClick={() => setDisparo(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); confirmar() }} style={{ width: 'min(560px, 92vw)' }}>
            <h2>{t('radar.dispararTitulo', { produto: disparo.op.produto })}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 0 }}>
              {t('radar.clientesAlvoResumo', { n: disparo.op.clientesAlvo, categoria: disparo.op.categoria ?? t('radar.semCategoria') })}
            </p>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>{t('radar.mensagemVariaveis')}</label>
              <textarea rows={4} value={disparo.texto} onChange={(e) => setDisparo({ ...disparo, texto: e.target.value })} />
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setDisparo(null)}>{t('comum.cancelar')}</button>
              <button className="btn" disabled={enviando}>{enviando ? t('radar.disparando') : t('radar.confirmarDisparo')}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

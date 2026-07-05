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
}

export default function Radar() {
  const escopo = useLojaAtiva()
  const { t } = useIdioma()
  const [ops, setOps] = useState<Oportunidade[]>([])
  const [disparo, setDisparo] = useState<{ op: Oportunidade; texto: string } | null>(null)
  const [erro, setErro] = useState('')
  const avisar = useToast()
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/radar', { params: escopo.params })
    setOps(data.oportunidades)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

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

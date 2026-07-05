import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, formataReal, mensagemDeErro, rotuloFeature, type Plano } from '../api'
import { useIdioma } from '../lib/i18n'

interface PlanoCatalogo {
  plano: Plano
  nome: string
  preco: number
  limite: string
  resumo: string
}

interface RespostaPlanos {
  planos: PlanoCatalogo[]
  features: Record<string, Plano>
  atual: Plano | null
  percentualDescontoAnual: number
}

interface Assinatura {
  plano: Plano
  status: 'PENDENTE' | 'ATIVA' | 'CANCELADA'
  periodicidade: 'MENSAL' | 'ANUAL'
  valor: string
  simulada: boolean
  cicloFimEm: string | null
  cancelamentoSolicitadoEm: string | null
  cancelamentoOrigem: string | null
  createdAt: string
}

function fmtData(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
}

const ORDEM: Record<Plano, number> = { START: 0, PRO: 1, ELITE: 2 }

export default function Planos() {
  const { t } = useIdioma()
  const [dados, setDados] = useState<RespostaPlanos | null>(null)
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [mpConfiguradoNoServidor, setMpConfiguradoNoServidor] = useState(false)
  const [contratoAceito, setContratoAceito] = useState(true)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const navigate = useNavigate()

  function carregar() {
    api.get('/planos').then(({ data }) => setDados(data)).catch(() => setErro(t('planosApp.erroCarregarPlanos')))
    api.get('/assinaturas/minha').then(({ data }) => { setAssinatura(data.assinatura); setMpConfiguradoNoServidor(Boolean(data.mpConfigurado)) }).catch(() => setAssinatura(null))
    api.get('/contrato/status').then(({ data }) => setContratoAceito(Boolean(data.aceito))).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  function reentrar() {
    localStorage.removeItem('modacrm_token')
    localStorage.removeItem('modacrm_usuario')
    navigate('/login')
  }

  async function trocar(plano: Plano) {
    if (!window.confirm(t('planosApp.confirmTrocarPlano', { plano }))) return
    setErro(''); setMsg(''); setOcupado(true)
    try {
      await api.post('/assinaturas/trocar-plano', { plano })
      setMsg(t('planosApp.planoAlteradoMsg'))
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function trocarPeriodicidade(nova: 'MENSAL' | 'ANUAL') {
    const aviso = nova === 'ANUAL' ? t('planosApp.confirmAnual') : t('planosApp.confirmMensal')
    if (!window.confirm(aviso + (mpConfiguradoNoServidor ? t('planosApp.reautorizarMpAviso') : ''))) return
    setErro(''); setMsg(''); setOcupado(true)
    try {
      const { data } = await api.post('/assinaturas/trocar-periodicidade', { periodicidade: nova })
      if (data.initPoint) { window.location.href = data.initPoint; return }
      setMsg(t('planosApp.periodicidadeAlteradaMsg'))
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function cancelar() {
    if (!window.confirm(t('planosApp.confirmCancelar'))) return
    setErro(''); setMsg(''); setOcupado(true)
    try {
      const { data } = await api.post('/assinaturas/cancelar', {})
      setMsg(t('planosApp.cancelamentoAgendadoMsg', { data: fmtData(data.acessoAte) }))
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function reativar() {
    setErro(''); setMsg(''); setOcupado(true)
    try {
      await api.post('/assinaturas/reativar', {})
      setMsg(t('planosApp.assinaturaReativadaMsg'))
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  // Novo contrato (após distrato/encerramento): exige aceite vigente; preserva toda a rede.
  async function reassinar() {
    setErro(''); setMsg(''); setOcupado(true)
    try {
      const { data } = await api.post('/assinaturas/reassinar', {})
      if (data.initPoint) { window.location.href = data.initPoint; return }
      setMsg(t('planosApp.assinaturaReativadaSimuladaMsg'))
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  if (erro && !dados) return <div className="cartao alerta">{erro}</div>
  if (!dados) return <div className="cartao">{t('planosApp.carregando')}</div>

  const featuresPorPlano = (plano: Plano) =>
    Object.entries(dados.features)
      .filter(([, min]) => min === plano)
      .map(([f]) => t(`feature.${f}`) || rotuloFeature[f] || f)

  return (
    <>
      <header>
        <h1>{t('planosApp.titulo')}</h1>
        <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
          {t('planosApp.subtitulo1')} <strong>{t('planosApp.ilimitadasDestaque')}</strong> {t('planosApp.subtitulo2')}
        </div>
      </header>

      {erro && <div className="alerta">{erro}</div>}
      {msg && (
        <div className="sucesso" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{msg}</span>
          {(msg === t('planosApp.planoAlteradoMsg') || msg === t('planosApp.assinaturaReativadaSimuladaMsg')) && <button className="btn" onClick={reentrar}>{t('planosApp.entrarNovamente')}</button>}
        </div>
      )}

      {assinatura && (() => {
        const agendado = !!assinatura.cancelamentoSolicitadoEm && assinatura.status !== 'CANCELADA'
        const distrato = agendado && assinatura.cancelamentoOrigem === 'DISTRATO_TERMOS'
        // Reassinar (novo contrato) vale para conta encerrada ou distratada (recorrência cancelada).
        const podeReassinar = assinatura.status === 'CANCELADA' || distrato
        return (
          <div className="cartao" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t('planosApp.suaAssinatura')}</div>
              <div style={{ fontSize: 18 }}>
                <strong>{assinatura.plano}</strong> · {formataReal(assinatura.valor)}/{assinatura.periodicidade === 'ANUAL' ? t('unidade.ano') : t('unidade.mes')} ·{' '}
                <span className={`selo ${assinatura.status === 'ATIVA' ? 'ok' : assinatura.status === 'CANCELADA' ? 'baixo' : 'ATACADO'}`}>
                  {t(`planosApp.status.${assinatura.status}`)}
                </span>
                {assinatura.simulada && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>  {t('planosApp.simulada')}</span>}
              </div>
              <div style={{ fontSize: 13, color: agendado ? 'var(--danger)' : 'var(--ink-soft)', marginTop: 4 }}>
                {assinatura.status === 'CANCELADA'
                  ? t('planosApp.contaEncerrada')
                  : distrato
                    ? t('planosApp.distratoTexto', { data: fmtData(assinatura.cicloFimEm) })
                    : agendado
                      ? t('planosApp.cancelamentoAgendadoTexto', { data: fmtData(assinatura.cicloFimEm) })
                      : assinatura.cicloFimEm ? t('planosApp.renovaEmTexto', { data: fmtData(assinatura.cicloFimEm) }) : ''}
              </div>
              {assinatura.status === 'ATIVA' && !agendado && (
                <div style={{ marginTop: 6 }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); trocarPeriodicidade(assinatura.periodicidade === 'ANUAL' ? 'MENSAL' : 'ANUAL') }}>
                    {assinatura.periodicidade === 'ANUAL'
                      ? t('planosApp.mudarMensal')
                      : t('planosApp.mudarAnual', { pct: dados.percentualDescontoAnual })}
                  </a>
                </div>
              )}
            </div>
            {podeReassinar ? (
              contratoAceito
                ? <button className="btn" onClick={reassinar} disabled={ocupado}>{t('planosApp.reassinarBtn')}</button>
                : <button className="btn" onClick={() => navigate('/contrato')} disabled={ocupado}>{t('planosApp.aceitarNovosTermos')}</button>
            ) : assinatura.status !== 'CANCELADA' && (
              agendado
                ? <button className="btn" onClick={reativar} disabled={ocupado}>{t('planosApp.reativarBtn')}</button>
                : <button className="btn secundario" onClick={cancelar} disabled={ocupado}>{t('planosApp.cancelarBtn')}</button>
            )}
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {dados.planos.map((p) => {
          const atual = dados.atual === p.plano
          const inferior = dados.atual ? ORDEM[p.plano] < ORDEM[dados.atual] : false
          const novidades = featuresPorPlano(p.plano)
          return (
            <div
              key={p.plano}
              className="cartao"
              style={{ borderTop: `4px solid ${atual ? 'var(--accent)' : 'var(--border)'}`, opacity: inferior ? 0.7 : 1 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 style={{ margin: 0 }}>{p.nome}</h2>
                {atual && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{t('planosApp.seuPlano')}</span>}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, margin: '8px 0' }}>
                {formataReal(p.preco)}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-soft)' }}>/{t('unidade.mes')}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>{p.limite}</div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>{p.resumo}</div>

              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6 }}>
                {p.plano === 'START' ? t('planosApp.inclui') : t('planosApp.tudoDoAnterior')}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                {novidades.map((f) => <li key={f}>{f}</li>)}
              </ul>

              <button
                className={`btn ${atual ? 'secundario' : ''}`}
                style={{ width: '100%', marginTop: 16 }}
                disabled={atual || ocupado}
                onClick={() => trocar(p.plano)}
              >
                {atual ? t('planosApp.planoAtual') : inferior ? t('planosApp.mudarParaEste') : t('planosApp.fazerUpgrade')}
              </button>
            </div>
          )
        })}
      </div>

      <div className="cartao" style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-soft)' }}>
        {t('planosApp.rodapeTexto')}
      </div>
    </>
  )
}

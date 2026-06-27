import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, formataReal, mensagemDeErro, rotuloFeature, type Plano } from '../api'

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
}

interface Assinatura {
  plano: Plano
  status: 'PENDENTE' | 'ATIVA' | 'CANCELADA'
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
const rotuloStatus: Record<string, string> = { PENDENTE: 'Pendente', ATIVA: 'Ativa', CANCELADA: 'Cancelada' }

export default function Planos() {
  const [dados, setDados] = useState<RespostaPlanos | null>(null)
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [contratoAceito, setContratoAceito] = useState(true)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const navigate = useNavigate()

  function carregar() {
    api.get('/planos').then(({ data }) => setDados(data)).catch(() => setErro('Não foi possível carregar os planos.'))
    api.get('/assinaturas/minha').then(({ data }) => setAssinatura(data.assinatura)).catch(() => setAssinatura(null))
    api.get('/contrato/status').then(({ data }) => setContratoAceito(Boolean(data.aceito))).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  function reentrar() {
    localStorage.removeItem('modacrm_token')
    localStorage.removeItem('modacrm_usuario')
    navigate('/login')
  }

  async function trocar(plano: Plano) {
    if (!window.confirm(`Mudar a assinatura para o plano ${plano}?`)) return
    setErro(''); setMsg(''); setOcupado(true)
    try {
      await api.post('/assinaturas/trocar-plano', { plano })
      setMsg('Plano alterado. É necessário entrar novamente para aplicar as novas funcionalidades.')
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function cancelar() {
    if (!window.confirm('Cancelar a assinatura? O acesso continua até o fim do ciclo já pago e não há nova cobrança.')) return
    setErro(''); setMsg(''); setOcupado(true)
    try {
      const { data } = await api.post('/assinaturas/cancelar', {})
      setMsg(`Cancelamento agendado. Acesso garantido até ${fmtData(data.acessoAte)} — depois disso a conta é encerrada.`)
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
      setMsg('Assinatura reativada — a renovação volta a valer normalmente.')
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
      setMsg('Assinatura reativada (modo simulado). É necessário entrar novamente.')
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  if (erro && !dados) return <div className="cartao alerta">{erro}</div>
  if (!dados) return <div className="cartao">Carregando…</div>

  const featuresPorPlano = (plano: Plano) =>
    Object.entries(dados.features)
      .filter(([, min]) => min === plano)
      .map(([f]) => rotuloFeature[f] ?? f)

  return (
    <>
      <header>
        <h1>💳 Planos</h1>
        <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
          Lojas e vendedoras <strong>ilimitadas</strong> em todos os planos — você paga por funcionalidade, não por tamanho.
        </div>
      </header>

      {erro && <div className="alerta">{erro}</div>}
      {msg && (
        <div className="sucesso" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{msg}</span>
          {msg.includes('entrar novamente') && <button className="btn" onClick={reentrar}>Entrar novamente</button>}
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
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Sua assinatura</div>
              <div style={{ fontSize: 18 }}>
                <strong>{assinatura.plano}</strong> · {formataReal(assinatura.valor)}/mês ·{' '}
                <span className={`selo ${assinatura.status === 'ATIVA' ? 'ok' : assinatura.status === 'CANCELADA' ? 'baixo' : 'ATACADO'}`}>
                  {rotuloStatus[assinatura.status]}
                </span>
                {assinatura.simulada && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>  (simulada)</span>}
              </div>
              <div style={{ fontSize: 13, color: agendado ? 'var(--danger)' : 'var(--ink-soft)', marginTop: 4 }}>
                {assinatura.status === 'CANCELADA'
                  ? 'Conta encerrada.'
                  : distrato
                    ? `Distrato dos termos — acesso até ${fmtData(assinatura.cicloFimEm)}. Reassine (novo contrato) para manter, sem refazer a loja.`
                    : agendado
                      ? `Cancelamento agendado — acesso até ${fmtData(assinatura.cicloFimEm)}, sem nova cobrança.`
                      : assinatura.cicloFimEm ? `Renova em ${fmtData(assinatura.cicloFimEm)}.` : ''}
              </div>
            </div>
            {podeReassinar ? (
              contratoAceito
                ? <button className="btn" onClick={reassinar} disabled={ocupado}>Reassinar (novo contrato)</button>
                : <button className="btn" onClick={() => navigate('/contrato')} disabled={ocupado}>Aceitar os novos termos</button>
            ) : assinatura.status !== 'CANCELADA' && (
              agendado
                ? <button className="btn" onClick={reativar} disabled={ocupado}>Reativar assinatura</button>
                : <button className="btn secundario" onClick={cancelar} disabled={ocupado}>Cancelar assinatura</button>
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
                {atual && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>SEU PLANO</span>}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, margin: '8px 0' }}>
                {formataReal(p.preco)}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-soft)' }}>/mês</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>{p.limite}</div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>{p.resumo}</div>

              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6 }}>
                {p.plano === 'START' ? 'Inclui' : 'Tudo do plano anterior, mais'}
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
                {atual ? 'Plano atual' : inferior ? 'Mudar para este plano' : 'Fazer upgrade'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="cartao" style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-soft)' }}>
        A cobrança recorrente real entra com o Mercado Pago configurado (Fase 8). Em modo simulado, a troca de plano é
        aplicada na hora; com o Mercado Pago ativo, o novo valor passa a valer na próxima cobrança.
      </div>
    </>
  )
}

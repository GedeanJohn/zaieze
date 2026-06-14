import { useEffect, useState } from 'react'
import { api, formataReal, rotuloFeature, type Plano } from '../api'

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

const ORDEM: Record<Plano, number> = { START: 0, PRO: 1, ELITE: 2 }

export default function Planos() {
  const [dados, setDados] = useState<RespostaPlanos | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get('/planos').then(({ data }) => setDados(data)).catch(() => setErro('Não foi possível carregar os planos.'))
  }, [])

  if (erro) return <div className="cartao alerta">{erro}</div>
  if (!dados) return <div className="cartao">Carregando…</div>

  // Funcionalidades que DESBLOQUEIAM em cada plano (FEATURE_MIN === plano)
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {dados.planos.map((p) => {
          const atual = dados.atual === p.plano
          const inferior = dados.atual ? ORDEM[p.plano] < ORDEM[dados.atual] : false
          const novidades = featuresPorPlano(p.plano)
          return (
            <div
              key={p.plano}
              className="cartao"
              style={{
                borderTop: `4px solid ${atual ? 'var(--accent)' : 'var(--border)'}`,
                opacity: inferior ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 style={{ margin: 0 }}>{p.nome}</h2>
                {atual && <span style={{ fontSize: 11, color: '#e8a87c', fontWeight: 700 }}>SEU PLANO</span>}
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
                disabled={atual || inferior}
              >
                {atual ? 'Plano atual' : inferior ? 'Incluído' : 'Fazer upgrade'}
              </button>
            </div>
          )
        })}
      </div>

      <div className="cartao" style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-soft)' }}>
        A cobrança recorrente (Stripe/Asaas) entra na Fase 8 — Billing SaaS. Por enquanto o botão de upgrade é ilustrativo;
        a troca de plano é feita pelo administrador do SaaS.
      </div>
    </>
  )
}

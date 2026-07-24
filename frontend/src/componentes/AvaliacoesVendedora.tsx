import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { useToast } from './Toast'

interface Avaliacao {
  id: string; nota: number; comentario: string | null; nomeCliente: string | null
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA'; createdAt: string
}

/** Moderação das avaliações recebidas no perfil público da vendedora — mesmo padrão da aba
 *  "Avaliações" do painel do Brand Partner (PainelAssessora.tsx), adaptada pra VendedoraAvaliacao. */
export function AvaliacoesVendedora() {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)
  const avisar = useToast()

  useEffect(() => {
    api.get('/catalogo/minhas-avaliacoes').then(({ data }) => setAvaliacoes(data)).catch(() => {})
  }, [])

  async function moderar(id: string, acao: 'aprovar' | 'recusar') {
    setOcupadoId(id)
    try {
      await api.post(`/catalogo/minhas-avaliacoes/${id}/${acao}`)
      const { data } = await api.get('/catalogo/minhas-avaliacoes')
      setAvaliacoes(data)
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    } finally {
      setOcupadoId(null)
    }
  }

  return (
    <div className="cartao">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Avaliações de atendimento</div>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
        Avaliações enviadas pelos clientes no seu perfil público (nota de 1 a 5 + comentário curto).
        Aprove para que entrem na sua nota exibida e nos depoimentos públicos.
      </p>
      {avaliacoes.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Nenhuma avaliação recebida ainda.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {avaliacoes.map((a) => (
          <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ color: '#c9a25f' }}>{'★'.repeat(a.nota)}{'☆'.repeat(5 - a.nota)}</strong>{' '}
                <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {a.nomeCliente || 'Cliente anônimo'} · {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: a.status === 'APROVADA' ? 'var(--ok)' : a.status === 'RECUSADA' ? 'var(--danger)' : 'var(--warn)',
              }}>
                {a.status === 'PENDENTE' ? 'Pendente' : a.status === 'APROVADA' ? 'Aprovada' : 'Recusada'}
              </span>
            </div>
            {a.comentario && <p style={{ margin: '8px 0 0', fontSize: 14 }}>{a.comentario}</p>}
            {a.status === 'PENDENTE' && (
              <div className="acoes" style={{ marginTop: 10 }}>
                <button type="button" className="btn secundario" disabled={ocupadoId === a.id} onClick={() => moderar(a.id, 'recusar')}>Recusar</button>
                <button type="button" className="btn" disabled={ocupadoId === a.id} onClick={() => moderar(a.id, 'aprovar')}>Aprovar</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

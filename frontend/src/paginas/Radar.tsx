import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useToast } from '../componentes/Toast'

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
      const partes = [`${data.enviados} enviada(s)`, data.simulados ? `${data.simulados} simulada(s)` : '', data.semConsentimento ? `${data.semConsentimento} sem LGPD` : '']
      setDisparo(null)
      avisar(`Campanha do Radar disparada para ${data.alcance} cliente(s): ${partes.filter(Boolean).join(' · ')}.`)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <header>
        <h1>★ Radar de Oportunidades</h1>
        <SeletorLoja escopo={escopo} />
      </header>

      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Cruza <strong>estoque parado</strong> (sem venda há 60 dias) com o <strong>perfil dos clientes</strong> (quem já comprou aquela categoria) e sugere a campanha. Dispare em 1 clique — respeitando consentimento LGPD e roteando pela vendedora de cada cliente.
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
              📦 {op.estoqueParado} parada(s) · {formataReal(op.valorParado)} imobilizado
            </div>
            <div style={{ fontSize: 15 }}>
              🎯 <strong>{op.clientesAlvo}</strong> cliente(s) com perfil para esta peça
            </div>
            <button className="btn" style={{ marginTop: 'auto' }} onClick={() => setDisparo({ op, texto: op.mensagemSugerida })}>
              📲 Disparar campanha
            </button>
          </div>
        ))}
        {ops.length === 0 && (
          <div className="cartao" style={{ color: 'var(--ink-soft)' }}>
            Nenhuma oportunidade no momento — não há estoque parado com clientes de perfil compatível. 👍
          </div>
        )}
      </div>

      {disparo && (
        <div className="modal-fundo" onClick={() => setDisparo(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); confirmar() }} style={{ width: 'min(560px, 92vw)' }}>
            <h2>Disparar: {disparo.op.produto}</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 0 }}>
              {disparo.op.clientesAlvo} cliente(s) alvo · {disparo.op.categoria ?? 'sem categoria'}
            </p>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>Mensagem (variáveis: {'{primeiroNome}'} {'{loja}'} {'{vendedora}'})</label>
              <textarea rows={4} value={disparo.texto} onChange={(e) => setDisparo({ ...disparo, texto: e.target.value })} />
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setDisparo(null)}>Cancelar</button>
              <button className="btn" disabled={enviando}>{enviando ? 'Disparando…' : 'Confirmar disparo'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

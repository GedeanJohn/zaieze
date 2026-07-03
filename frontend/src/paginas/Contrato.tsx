import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'

interface Clausula { n: number; titulo: string; paragrafos: string[] }
interface ContratoMontado {
  versao: string
  titulo: string
  empresa: { nome: string; cnpj: string }
  qualificacao: string[]
  clausulas: Clausula[]
  aceite: { aceitoEm: string; ip: string | null; versao: string } | null
}
interface RespostaContrato {
  contrato: ContratoMontado
  aceito: boolean
  pendente: boolean
  prazo: string | null
  diasRestantes: number | null
  versao: string
}

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'
}

export default function Contrato() {
  const [dados, setDados] = useState<RespostaContrato | null>(null)
  const [erro, setErro] = useState('')
  const avisar = useToast()
  const [ocupado, setOcupado] = useState(false)

  function carregar() {
    api.get('/contrato/meu').then(({ data }) => setDados(data)).catch((e) => setErro(mensagemDeErro(e)))
  }
  useEffect(() => { carregar() }, [])

  async function aceitar() {
    setOcupado(true)
    try {
      await api.post('/contrato/aceitar', {})
      avisar('Aceite registrado com sucesso.')
      carregar()
    } catch (e) {
      avisar(mensagemDeErro(e), 'erro')
    } finally {
      setOcupado(false)
    }
  }

  if (erro && !dados) return <div className="cartao alerta">{erro}</div>
  if (!dados) return <div className="cartao">Carregando…</div>

  const c = dados.contrato

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1>📄 Contrato</h1>
        <span className={`selo ${dados.aceito ? 'ok' : 'ATACADO'}`}>
          {dados.aceito ? '✓ Aceito' : 'Pendente de aceite'}
        </span>
      </header>

      {!dados.aceito && dados.pendente && (
        <div className="cartao" style={{ borderLeft: '4px solid var(--danger)' }}>
          <strong>Atualizamos nossos termos de prestação de serviços e conduta.</strong> Para manter o acesso, leia o
          contrato abaixo e registre o aceite{dados.prazo && <> até <strong>{fmt(dados.prazo)}</strong></>}. Sem o aceite,
          o contrato é distratado: a cobrança recorrente é interrompida e o acesso encerrado ao fim do período já pago.
        </div>
      )}

      <div className="cartao" style={{ maxHeight: '58vh', overflowY: 'auto', lineHeight: 1.65, fontSize: 14 }}>
        <h2 style={{ marginTop: 0 }}>{c.titulo}</h2>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 12 }}>
          Versão {c.versao}
          {c.aceite && <> · aceito em {new Date(c.aceite.aceitoEm).toLocaleString('pt-BR')}{c.aceite.ip ? ` · IP ${c.aceite.ip}` : ''}</>}
        </div>

        {c.qualificacao.map((p, i) => (
          <p key={`q${i}`} style={{ textAlign: 'justify' }}>{p}</p>
        ))}

        {c.clausulas.map((cl) => (
          <div key={cl.n} style={{ marginTop: 14 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>CLÁUSULA {cl.n}ª — {cl.titulo}</h3>
            {cl.paragrafos.map((p, i) => (
              <p key={i} style={{ textAlign: 'justify', margin: '4px 0' }}>
                <span style={{ color: 'var(--ink-soft)' }}>{cl.n}.{i + 1}.</span> {p}
              </p>
            ))}
          </div>
        ))}
      </div>

      {!dados.aceito && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={aceitar} disabled={ocupado}>
            {ocupado ? 'Registrando…' : 'Li e aceito o contrato'}
          </button>
        </div>
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { api, mensagemDeErro } from '../api'

interface Marca {
  nome: string
  logoUrl: string | null
  corPrimaria: string
  corSecundaria: string
  slaEntrouMin: number
  slaAtendidoMin: number
  slaNegociandoMin: number
  slaAutoRedistribuir: boolean
}

export default function Marca() {
  const [marca, setMarca] = useState<Marca | null>(null)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { api.get('/marca').then(({ data }) => setMarca(data)) }, [])

  function aviso(msg: string) { setOk(msg); setTimeout(() => setOk(''), 2500) }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!marca) return
    setErro('')
    try {
      const { data } = await api.patch('/marca', {
        corPrimaria: marca.corPrimaria,
        corSecundaria: marca.corSecundaria,
        slaEntrouMin: marca.slaEntrouMin,
        slaAtendidoMin: marca.slaAtendidoMin,
        slaNegociandoMin: marca.slaNegociandoMin,
        slaAutoRedistribuir: marca.slaAutoRedistribuir,
      })
      setMarca(data)
      aviso('Identidade da marca salva.')
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  async function enviarLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo || !marca) return
    setErro('')
    const fd = new FormData()
    fd.append('file', arquivo)
    try {
      const { data } = await api.post('/marca/logo', fd, { params: marca.logoUrl ? { anterior: marca.logoUrl } : {} })
      setMarca(data)
      aviso('Logo atualizada.')
    } catch (err) { setErro(mensagemDeErro(err)) }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  if (!marca) return <p style={{ color: 'var(--ink-soft)' }}>Carregando…</p>

  return (
    <>
      <header><h1>Identidade da marca</h1></header>
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        A logo e as cores aparecem no <strong>catálogo público</strong> (Portal do Cliente) que as vendedoras compartilham.
        O SLA define em quanto tempo a vendedora precisa responder um lead antes da redistribuição.
      </div>

      {erro && <div className="alerta">{erro}</div>}
      {ok && <div className="cartao" style={{ background: '#1f3d2b', color: '#b9f5cf' }}>{ok}</div>}

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Logo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 140, height: 140, borderRadius: 12, background: marca.corSecundaria,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #00000022', overflow: 'hidden',
          }}>
            {marca.logoUrl
              ? <img src={marca.logoUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : <span style={{ color: '#999', fontSize: 12 }}>sem logo</span>}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={enviarLogo} />
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>PNG, JPG, WEBP ou SVG · até 5&nbsp;MB.</div>
          </div>
        </div>
      </div>

      <form className="cartao" onSubmit={salvar}>
        <h2 style={{ marginTop: 0 }}>Cores e atendimento</h2>
        <div className="linha-campos">
          <div className="campo">
            <label>Cor primária (CTA/botões)</label>
            <input type="color" value={marca.corPrimaria} onChange={(e) => setMarca({ ...marca, corPrimaria: e.target.value })} style={{ height: 42, padding: 4 }} />
          </div>
          <div className="campo">
            <label>Cor de fundo</label>
            <input type="color" value={marca.corSecundaria} onChange={(e) => setMarca({ ...marca, corSecundaria: e.target.value })} style={{ height: 42, padding: 4 }} />
          </div>
        </div>
        <h3 style={{ margin: '8px 0 4px' }}>SLA por etapa do funil (minutos)</h3>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          Tempo máximo do ciclo em cada etapa antes de aparecer como <strong>atrasado</strong>.
          O estouro de <strong>Entrou</strong> (1ª resposta) é o que dispara a redistribuição.
        </p>
        <div className="linha-campos">
          <div className="campo">
            <label>Entrou → resposta</label>
            <input type="number" min={1} value={marca.slaEntrouMin} onChange={(e) => setMarca({ ...marca, slaEntrouMin: Number(e.target.value) })} />
          </div>
          <div className="campo">
            <label>Atendido → avançar</label>
            <input type="number" min={1} value={marca.slaAtendidoMin} onChange={(e) => setMarca({ ...marca, slaAtendidoMin: Number(e.target.value) })} />
          </div>
          <div className="campo">
            <label>Negociando → fechar</label>
            <input type="number" min={1} value={marca.slaNegociandoMin} onChange={(e) => setMarca({ ...marca, slaNegociandoMin: Number(e.target.value) })} />
          </div>
        </div>
        <div className="campo">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={marca.slaAutoRedistribuir} onChange={(e) => setMarca({ ...marca, slaAutoRedistribuir: e.target.checked })} style={{ width: 'auto' }} />
            Redistribuir automaticamente quando “Entrou” estourar o prazo
          </label>
        </div>
        <div className="acoes">
          <button className="btn">Salvar</button>
        </div>
      </form>
    </>
  )
}

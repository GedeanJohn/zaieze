import { useState } from 'react'
import { api, mensagemDeErro } from '../api'

interface PapelOpcao { valor: string; rotulo: string }

interface Props {
  /** Papéis que o usuário atual pode convidar (1+). */
  papeis: PapelOpcao[]
  /** Lojas para escolher quando o papel exige loja (GERENTE/VENDEDORA). Omitir = backend usa a loja do convidante. */
  lojas?: { id: string; nome: string }[]
  onClose: () => void
}

const EXIGE_LOJA = ['GERENTE', 'VENDEDORA']

export default function ConvidarModal({ papeis, lojas, onClose }: Props) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [role, setRole] = useState(papeis[0]?.valor ?? 'VENDEDORA')
  const [lojaId, setLojaId] = useState(lojas?.[0]?.id ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<{ link: string; whatsappUrl: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const precisaLoja = !!lojas && EXIGE_LOJA.includes(role)

  async function gerar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      const corpo: Record<string, unknown> = { nome, email, telefone: telefone || undefined, role }
      if (precisaLoja) corpo.lojaId = lojaId
      const { data } = await api.post('/convites', corpo)
      setResultado({ link: data.link, whatsappUrl: data.whatsappUrl })
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setSalvando(false)
    }
  }

  async function copiar() {
    if (!resultado) return
    try { await navigator.clipboard.writeText(resultado.link) } catch { /* ignore */ }
    setCopiado(true); setTimeout(() => setCopiado(false), 1800)
  }

  return (
    <div className="modal-fundo" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 94vw)' }}>
        {!resultado ? (
          <form onSubmit={gerar}>
            <h2>Convidar por link</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
              A pessoa recebe o link, <strong>cria a própria senha</strong> e já entra no sistema. O convite expira em 7 dias.
            </p>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>Nome*</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>E-mail* (será o login)</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="campo">
                <label>WhatsApp (com DDD)</label>
                <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="5562999990011" inputMode="tel" />
              </div>
            </div>
            <div className="linha-campos">
              {papeis.length > 1 && (
                <div className="campo">
                  <label>Papel</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    {papeis.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                  </select>
                </div>
              )}
              {precisaLoja && (
                <div className="campo">
                  <label>Loja</label>
                  <select value={lojaId} onChange={(e) => setLojaId(e.target.value)} required>
                    <option value="">Selecione…</option>
                    {lojas!.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={onClose}>Cancelar</button>
              <button className="btn" disabled={salvando}>{salvando ? 'Gerando…' : 'Gerar link'}</button>
            </div>
          </form>
        ) : (
          <div>
            <h2>Convite criado ✅</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>Envie o link abaixo para a pessoa criar o acesso dela:</p>
            <div style={{ background: '#0000000d', border: '1px solid var(--border)', borderRadius: 8, padding: 10, fontSize: 12, wordBreak: 'break-all', marginBottom: 12 }}>
              {resultado.link}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn" href={resultado.whatsappUrl} target="_blank" rel="noreferrer">📲 Enviar por WhatsApp</a>
              <button className="btn secundario" onClick={copiar}>{copiado ? '✓ copiado' : 'Copiar link'}</button>
              <button className="btn secundario" onClick={onClose}>Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

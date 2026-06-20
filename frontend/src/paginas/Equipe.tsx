import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import ConvidarModal from '../componentes/ConvidarModal'

interface Membro {
  id: string
  nome: string
  email: string
  role: 'GERENTE' | 'VENDEDORA'
  telefone?: string | null
  slugCatalogo?: string | null
  metaMensal?: string | null
  comissaoPadrao?: string | null
  ativo: boolean
  _count?: { carteira: number }
}

interface FormMembro {
  id?: string
  nome: string
  email: string
  role?: 'GERENTE' | 'VENDEDORA'
  senha?: string
  telefone?: string
  slugCatalogo?: string
  metaMensal?: string
  comissaoPadrao?: string
}

export default function Equipe() {
  const usuario = usuarioLogado()!
  const ehGestor = usuario.role === 'GESTOR' || usuario.role === 'SUPER_ADMIN'
  const [equipe, setEquipe] = useState<Membro[]>([])
  const [form, setForm] = useState<FormMembro | null>(null)
  const [convidar, setConvidar] = useState(false)
  const [lojas, setLojas] = useState<{ id: string; nome: string }[]>([])
  const [gerenciar, setGerenciar] = useState<Membro | null>(null)
  const [gModo, setGModo] = useState<'substituir' | 'desligar'>('substituir')
  const [gForm, setGForm] = useState({ nome: '', email: '', senha: '' })
  const [gDestino, setGDestino] = useState('')
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await api.get('/usuarios')
    setEquipe(data)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Gestor precisa escolher a loja do convidado → carrega as lojas da rede.
  useEffect(() => {
    if (ehGestor) api.get('/lojas').then(({ data }) => setLojas(data.map((l: { id: string; nome: string }) => ({ id: l.id, nome: l.nome })))).catch(() => {})
  }, [ehGestor])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    const corpo: Record<string, unknown> = {
      nome: form.nome,
      email: form.email,
      telefone: form.telefone || undefined,
      slugCatalogo: form.slugCatalogo || undefined,
      metaMensal: form.metaMensal ? Number(form.metaMensal) : undefined,
      comissaoPadrao: form.comissaoPadrao ? Number(form.comissaoPadrao) : undefined,
    }
    if (form.senha) corpo.senha = form.senha
    if (!form.id) corpo.role = 'VENDEDORA'
    else if (ehGestor && form.role) corpo.role = form.role // gestor pode mudar a função
    try {
      if (form.id) await api.patch(`/usuarios/${form.id}`, corpo)
      else await api.post('/usuarios', corpo)
      setForm(null)
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function alternarAtivo(m: Membro) {
    await api.patch(`/usuarios/${m.id}`, { ativo: !m.ativo })
    carregar()
  }

  function abrirGerenciar(m: Membro) {
    setGerenciar(m); setGModo('substituir'); setGForm({ nome: '', email: '', senha: '' }); setGDestino(''); setErro('')
  }
  async function substituir(e: React.FormEvent) {
    e.preventDefault()
    if (!gerenciar) return
    setErro('')
    try {
      await api.post(`/usuarios/${gerenciar.id}/substituir`, gForm)
      setGerenciar(null); carregar()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }
  async function desligar() {
    if (!gerenciar) return
    if (!confirm(`Desligar ${gerenciar.nome}?${gDestino ? ' A carteira será transferida.' : ' (sem transferir a carteira)'}`)) return
    setErro('')
    try {
      const { data } = await api.post(`/usuarios/${gerenciar.id}/desligar`, { paraVendedoraId: gDestino || undefined })
      setGerenciar(null); carregar()
      alert(`${gerenciar.nome} desligada.` + (gDestino ? ` ${data.clientesTransferidos} cliente(s) e ${data.leadsTransferidos} lead(s) transferidos.` : ''))
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  return (
    <>
      <header>
        <h1>Equipe</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={() => setConvidar(true)}>✉️ Convidar por link</button>
          <button className="btn secundario" onClick={() => setForm({ nome: '', email: '' })}>+ Nova (com senha)</button>
        </div>
      </header>

      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Plano <strong>{usuario.rede?.plano ?? '—'}</strong> — o limite de vendedoras é aplicado automaticamente
        (Start: 2 · Pro: 10 · Elite: ilimitado).
      </div>

      <div className="cartao">
        <table>
          <thead>
            <tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Carteira</th><th>Meta mensal</th><th>Comissão</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {equipe.map((m) => (
              <tr key={m.id} style={{ opacity: m.ativo ? 1 : 0.5 }}>
                <td>{m.nome}</td>
                <td>{m.email}</td>
                <td>{m.role === 'GERENTE' ? 'Gerente' : 'Vendedora'}</td>
                <td>{m._count?.carteira ?? 0} clientes</td>
                <td>{m.metaMensal ? `R$ ${Number(m.metaMensal).toLocaleString('pt-BR')}` : '—'}</td>
                <td>{m.comissaoPadrao ? `${Number(m.comissaoPadrao)}%` : '—'}</td>
                <td><span className={`selo ${m.ativo ? 'ok' : 'baixo'}`}>{m.ativo ? 'ativa' : 'inativa'}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); setForm({ ...m, metaMensal: m.metaMensal ?? '', comissaoPadrao: m.comissaoPadrao ?? '', senha: '' } as FormMembro) }}>editar</a>
                  {m.role === 'VENDEDORA' && (
                    <>
                      {' · '}
                      <a href="#" onClick={(e) => { e.preventDefault(); alternarAtivo(m) }}>{m.ativo ? 'desativar' : 'reativar'}</a>
                      {' · '}
                      <a href="#" onClick={(e) => { e.preventDefault(); abrirGerenciar(m) }}>substituir/desligar</a>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {convidar && (
        <ConvidarModal
          papeis={ehGestor ? [{ valor: 'VENDEDORA', rotulo: 'Vendedora' }, { valor: 'GERENTE', rotulo: 'Gerente' }] : [{ valor: 'VENDEDORA', rotulo: 'Vendedora' }]}
          lojas={ehGestor ? lojas : undefined}
          onClose={() => setConvidar(false)}
        />
      )}

      {gerenciar && (
        <div className="modal-fundo" onClick={() => setGerenciar(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 94vw)' }}>
            <h2>Substituir ou desligar — {gerenciar.nome}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button type="button" className={`btn ${gModo === 'substituir' ? '' : 'secundario'}`} onClick={() => setGModo('substituir')}>Substituir pessoa</button>
              <button type="button" className={`btn ${gModo === 'desligar' ? '' : 'secundario'}`} onClick={() => setGModo('desligar')}>Desligar</button>
            </div>

            {gModo === 'substituir' ? (
              <form onSubmit={substituir}>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
                  Coloca <strong>outra pessoa</strong> nesta posição <strong>mantendo a carteira</strong>, clientes, leads e histórico. O WhatsApp é desconectado (o novo titular conecta o dele).
                </p>
                <div className="campo"><label>Nome do novo titular*</label><input value={gForm.nome} onChange={(e) => setGForm({ ...gForm, nome: e.target.value })} required /></div>
                <div className="linha-campos">
                  <div className="campo"><label>E-mail (novo login)*</label><input type="email" value={gForm.email} onChange={(e) => setGForm({ ...gForm, email: e.target.value })} required /></div>
                  <div className="campo"><label>Senha* (mín. 6)</label><input type="password" value={gForm.senha} onChange={(e) => setGForm({ ...gForm, senha: e.target.value })} minLength={6} required /></div>
                </div>
                <div className="acoes">
                  <button type="button" className="btn secundario" onClick={() => setGerenciar(null)}>Cancelar</button>
                  <button className="btn">Substituir</button>
                </div>
              </form>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
                  Desativa a vendedora e <strong>transfere a carteira</strong> (clientes + leads abertos) para outra vendedora. O histórico de vendas dela é preservado.
                </p>
                <div className="campo">
                  <label>Transferir carteira para</label>
                  <select value={gDestino} onChange={(e) => setGDestino(e.target.value)}>
                    <option value="">— Não transferir (só desativar) —</option>
                    {equipe.filter((v) => v.role === 'VENDEDORA' && v.ativo && v.id !== gerenciar.id).map((v) => (
                      <option key={v.id} value={v.id}>{v.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="acoes">
                  <button type="button" className="btn secundario" onClick={() => setGerenciar(null)}>Cancelar</button>
                  <button type="button" className="btn" onClick={desligar}>Desligar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>{form.id ? 'Editar membro' : 'Nova vendedora'}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>Nome*</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="campo">
                <label>E-mail*</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
            </div>
            {form.id && ehGestor && (
              <div className="campo">
                <label>Função</label>
                <select value={form.role ?? 'VENDEDORA'} onChange={(e) => setForm({ ...form, role: e.target.value as 'GERENTE' | 'VENDEDORA' })}>
                  <option value="VENDEDORA">Vendedora</option>
                  <option value="GERENTE">Gerente</option>
                </select>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Mudou de função? Troque aqui (a carteira e o histórico são mantidos).</div>
              </div>
            )}
            <div className="linha-campos">
              <div className="campo">
                <label>{form.id ? 'Nova senha (opcional)' : 'Senha* (mín. 6)'}</label>
                <input type="password" value={form.senha ?? ''} onChange={(e) => setForm({ ...form, senha: e.target.value })} required={!form.id} minLength={6} />
              </div>
              <div className="campo">
                <label>Telefone/WhatsApp</label>
                <input value={form.telefone ?? ''} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>Slug do catálogo (loja.com/...)</label>
                <input value={form.slugCatalogo ?? ''} onChange={(e) => setForm({ ...form, slugCatalogo: e.target.value })} placeholder="camila" />
              </div>
              <div className="campo">
                <label>Meta mensal (R$)</label>
                <input type="number" step="0.01" value={form.metaMensal ?? ''} onChange={(e) => setForm({ ...form, metaMensal: e.target.value })} />
              </div>
              <div className="campo">
                <label>Comissão padrão (%)</label>
                <input type="number" step="0.1" min="0" max="100" value={form.comissaoPadrao ?? ''} onChange={(e) => setForm({ ...form, comissaoPadrao: e.target.value })} />
              </div>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

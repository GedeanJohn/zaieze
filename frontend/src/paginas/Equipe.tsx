import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'

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
  senha?: string
  telefone?: string
  slugCatalogo?: string
  metaMensal?: string
  comissaoPadrao?: string
}

export default function Equipe() {
  const usuario = usuarioLogado()!
  const [equipe, setEquipe] = useState<Membro[]>([])
  const [form, setForm] = useState<FormMembro | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await api.get('/usuarios')
    setEquipe(data)
  }, [])

  useEffect(() => { carregar() }, [carregar])

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

  return (
    <>
      <header>
        <h1>Equipe</h1>
        <button className="btn" onClick={() => setForm({ nome: '', email: '' })}>+ Nova vendedora</button>
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
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

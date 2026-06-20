import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import ConvidarModal from '../componentes/ConvidarModal'

interface Estoquista {
  id: string
  nome: string
  email: string
  telefone?: string | null
  ativo: boolean
}

interface FormE {
  id?: string
  nome: string
  email: string
  senha?: string
  telefone?: string
}

export default function Estoquistas() {
  const [lista, setLista] = useState<Estoquista[]>([])
  const [form, setForm] = useState<FormE | null>(null)
  const [convidar, setConvidar] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await api.get('/estoquistas')
    setLista(data)
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
    }
    if (form.senha) corpo.senha = form.senha
    try {
      if (form.id) await api.patch(`/estoquistas/${form.id}`, corpo)
      else await api.post('/estoquistas', corpo)
      setForm(null)
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function alternarAtivo(es: Estoquista) {
    await api.patch(`/estoquistas/${es.id}`, { ativo: !es.ativo })
    carregar()
  }

  return (
    <>
      <header>
        <h1>Estoquistas</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={() => setConvidar(true)}>✉️ Convidar por link</button>
          <button className="btn secundario" onClick={() => setForm({ nome: '', email: '', senha: '' })}>+ Novo (com senha)</button>
        </div>
      </header>

      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Estoquistas atuam no nível da <strong>rede</strong>: lançam entradas de produção, fazem transferências e ajustes de estoque nas lojas.
      </div>

      <div className="cartao">
        <table>
          <thead>
            <tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {lista.map((es) => (
              <tr key={es.id} style={{ opacity: es.ativo ? 1 : 0.5 }}>
                <td>{es.nome}</td>
                <td>{es.email}</td>
                <td>{es.telefone ?? '—'}</td>
                <td><span className={`selo ${es.ativo ? 'ok' : 'baixo'}`}>{es.ativo ? 'Ativo' : 'Inativo'}</span></td>
                <td>
                  <a href="#" onClick={(e) => { e.preventDefault(); setForm({ id: es.id, nome: es.nome, email: es.email, telefone: es.telefone ?? '' }) }}>editar</a>
                  {' · '}
                  <a href="#" onClick={(e) => { e.preventDefault(); alternarAtivo(es) }}>{es.ativo ? 'desativar' : 'ativar'}</a>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>Nenhum estoquista cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {convidar && (
        <ConvidarModal papeis={[{ valor: 'ESTOQUISTA', rotulo: 'Estoquista' }]} onClose={() => setConvidar(false)} />
      )}

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar} style={{ width: 'min(520px, 92vw)' }}>
            <h2>{form.id ? 'Editar estoquista' : 'Novo estoquista'}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>Nome*</label>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>E-mail*</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div className="campo">
                <label>Telefone</label>
                <input value={form.telefone ?? ''} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="5562999990011" />
              </div>
            </div>
            <div className="campo">
              <label>{form.id ? 'Nova senha (deixe vazio para manter)' : 'Senha*'}</label>
              <input type="password" value={form.senha ?? ''} onChange={(e) => setForm({ ...form, senha: e.target.value })} required={!form.id} minLength={6} placeholder="mínimo 6 caracteres" />
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

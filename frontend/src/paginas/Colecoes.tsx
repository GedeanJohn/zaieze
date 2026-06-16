import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { useLojaAtiva, SeletorLoja } from '../componentes/SeletorLoja'

interface Colecao {
  id: string
  nome: string
  descricao?: string | null
  status: 'EM_PREPARACAO' | 'LIBERADA'
  liberadaEm?: string | null
  pecas: number
}

interface FormC { id?: string; nome: string; descricao?: string }

export default function Colecoes() {
  const escopo = useLojaAtiva()
  const [lista, setLista] = useState<Colecao[]>([])
  const [form, setForm] = useState<FormC | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/colecoes', { params: escopo.params })
    setLista(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    try {
      const corpo = { nome: form.nome, descricao: form.descricao || undefined }
      if (form.id) await api.patch(`/colecoes/${form.id}`, corpo, { params: escopo.params })
      else await api.post('/colecoes', corpo, { params: escopo.params })
      setForm(null)
      carregar()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  async function liberar(c: Colecao) {
    if (!confirm(`Liberar a coleção "${c.nome}"? Ela passa a aparecer para TODAS as vendedoras ao mesmo tempo.`)) return
    try { await api.post(`/colecoes/${c.id}/liberar`, {}, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }

  async function recolher(c: Colecao) {
    if (!confirm(`Recolher "${c.nome}"? Ela some do catálogo e do PDV das vendedoras.`)) return
    try { await api.post(`/colecoes/${c.id}/recolher`, {}, { params: escopo.params }); carregar() }
    catch (err) { alert(mensagemDeErro(err)) }
  }

  return (
    <>
      <header>
        <h1>Coleções</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          <button className="btn" onClick={() => setForm({ nome: '' })}>+ Nova coleção</button>
        </div>
      </header>

      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        A estoquista monta a coleção <strong>em preparação</strong> (cadastrando as peças) e só então <strong>libera</strong> —
        aí ela aparece para todas as vendedoras simultaneamente, garantindo competição justa pelo estoque.
      </div>

      <div className="cartao">
        <table>
          <thead>
            <tr><th>Coleção</th><th>Status</th><th>Peças</th><th>Liberada em</th><th></th></tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.nome}</strong>
                  {c.descricao && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{c.descricao}</div>}
                </td>
                <td>
                  <span className={`selo ${c.status === 'LIBERADA' ? 'ok' : 'baixo'}`}>
                    {c.status === 'LIBERADA' ? 'Liberada' : 'Em preparação'}
                  </span>
                </td>
                <td>{c.pecas}</td>
                <td>{c.liberadaEm ? new Date(c.liberadaEm).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                  {c.status === 'EM_PREPARACAO'
                    ? <a href="#" onClick={(e) => { e.preventDefault(); liberar(c) }}>🚀 liberar</a>
                    : <a href="#" onClick={(e) => { e.preventDefault(); recolher(c) }}>recolher</a>}
                  {' · '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setForm({ id: c.id, nome: c.nome, descricao: c.descricao ?? '' }) }}>editar</a>
                </td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>Nenhuma coleção. Crie uma e cadastre as peças em Produtos.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar} style={{ width: 'min(520px, 92vw)' }}>
            <h2>{form.id ? 'Editar coleção' : 'Nova coleção'}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>Nome*</label>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required placeholder="Ex.: Verão 2026" />
            </div>
            <div className="campo">
              <label>Descrição</label>
              <input value={form.descricao ?? ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Opcional" />
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

import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'
import { useIdioma } from '../lib/i18n'

interface Post {
  id: string
  titulo: string
  conteudo: string
  imagemUrl?: string | null
  createdAt: string
  autor: { nome: string }
}

export default function Mural() {
  const usuario = usuarioLogado()!
  const gerente = usuario.role !== 'VENDEDORA'
  const escopo = useLojaAtiva()
  const { t } = useIdioma()

  const [posts, setPosts] = useState<Post[]>([])
  const [form, setForm] = useState<{ titulo: string; conteudo: string; imagemUrl: string } | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/mural', { params: escopo.params })
    setPosts(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    try {
      await api.post('/mural', {
        titulo: form.titulo,
        conteudo: form.conteudo,
        imagemUrl: form.imagemUrl || undefined,
      }, { params: escopo.params })
      setForm(null)
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  return (
    <>
      <header>
        <h1>{t('mural.titulo')}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          {gerente && <button className="btn" onClick={() => setForm({ titulo: '', conteudo: '', imagemUrl: '' })}>{t('mural.publicar')}</button>}
        </div>
      </header>

      {posts.map((p) => (
        <div className="cartao" key={p.id}>
          <h2 style={{ margin: '0 0 6px', fontSize: 19 }}>{p.titulo}</h2>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 10 }}>
            {p.autor.nome} · {new Date(p.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
          {p.imagemUrl && <img src={p.imagemUrl} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 10 }} />}
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 15 }}>{p.conteudo}</div>
        </div>
      ))}
      {posts.length === 0 && <div className="cartao" style={{ color: 'var(--ink-soft)' }}>{t('mural.nenhumaNovidade')}</div>}

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>{t('mural.publicarNoMural')}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>{t('mural.tituloLabel')}</label>
              <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
            </div>
            <div className="campo">
              <label>{t('mural.mensagemLabel')}</label>
              <textarea rows={4} value={form.conteudo} onChange={(e) => setForm({ ...form, conteudo: e.target.value })} required />
            </div>
            <div className="campo">
              <label>{t('mural.imagemUrlLabel')}</label>
              <input value={form.imagemUrl} onChange={(e) => setForm({ ...form, imagemUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('mural.publicarBtn')}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado, atualizarUsuarioLocal } from '../api'
import { useToast } from '../componentes/Toast'
import { useIdioma, type Idioma } from '../lib/i18n'

/** Iniciais do nome para o avatar. */
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

/** Minha conta — qualquer papel edita os próprios dados (nome, e-mail/login, senha, foto).
 *  Para o gestor, é também o caminho de transferir a titularidade quando a marca é vendida. */
export default function Conta() {
  const u = usuarioLogado()!
  const [nome, setNome] = useState(u.nome)
  const [email, setEmail] = useState(u.email)
  const [senha, setSenha] = useState('')
  const avisar = useToast()
  const [salvando, setSalvando] = useState(false)
  const { idioma, setIdioma } = useIdioma()
  const [salvandoIdioma, setSalvandoIdioma] = useState(false)

  async function salvarIdioma(novo: Idioma) {
    setSalvandoIdioma(true)
    try {
      await api.patch('/usuarios/me', { idioma: novo })
      setIdioma(novo)
      atualizarUsuarioLocal({ idioma: novo })
      avisar('Idioma atualizado.')
    } catch (err) { avisar(mensagemDeErro(err), 'erro') } finally { setSalvandoIdioma(false) }
  }

  // Bio do catálogo (só a vendedora tem loja pública). Carrega o valor atual do servidor.
  const ehVendedora = u.role === 'VENDEDORA'
  const [bio, setBio] = useState('')
  const [bioOrig, setBioOrig] = useState('')
  useEffect(() => {
    if (!ehVendedora) return
    api.get('/usuarios/me').then(({ data }) => { setBio(data.bioCatalogo ?? ''); setBioOrig(data.bioCatalogo ?? '') }).catch(() => {})
  }, [ehVendedora])

  // Foto de perfil (exibida no topo do app e no Chat)
  const [fotoUrl, setFotoUrl] = useState<string | null>(u.fotoUrl ?? null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function enviarFoto(arquivo: File) {
    setEnviandoFoto(true)
    try {
      const fd = new FormData()
      fd.append('file', arquivo)
      const { data } = await api.post('/usuarios/me/foto', fd)
      setFotoUrl(data.fotoUrl)
      atualizarUsuarioLocal({ fotoUrl: data.fotoUrl })
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setEnviandoFoto(false) }
  }
  async function removerFoto() {
    setEnviandoFoto(true)
    try {
      await api.delete('/usuarios/me/foto')
      setFotoUrl(null)
      atualizarUsuarioLocal({ fotoUrl: null })
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setEnviandoFoto(false) }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      const corpo: Record<string, unknown> = {}
      if (nome && nome !== u.nome) corpo.nome = nome
      if (email && email !== u.email) corpo.email = email
      if (senha) corpo.senha = senha
      if (ehVendedora && bio !== bioOrig) corpo.bioCatalogo = bio
      if (Object.keys(corpo).length === 0) { avisar('Nada para alterar.'); return }
      const { data } = await api.patch('/usuarios/me', corpo)
      if ('bioCatalogo' in corpo) setBioOrig(bio)
      const atual = usuarioLogado()
      if (atual) localStorage.setItem('modacrm_usuario', JSON.stringify({ ...atual, nome: data.nome, email: data.email }))
      setSenha('')
      avisar('Dados atualizados.' + (corpo.email ? ' Use o novo e-mail no próximo login.' : ''))
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { setSalvando(false) }
  }

  return (
    <>
      <header><h1>Minha conta</h1></header>

      <div className="cartao" style={{ display: 'flex', alignItems: 'center', gap: 16, maxWidth: 520 }}>
        {fotoUrl
          ? <img src={fotoUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
          : <span style={{ width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 24, color: '#fff', background: 'linear-gradient(135deg, #a855f7, #ec4899)' }}>{iniciais(u.nome)}</span>}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Foto de perfil</div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>Aparece no topo do app e no Chat.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" disabled={enviandoFoto} onClick={() => fileRef.current?.click()}>{enviandoFoto ? 'Enviando…' : '📷 Trocar foto'}</button>
            {fotoUrl && <button type="button" className="btn secundario" disabled={enviandoFoto} onClick={removerFoto}>Remover</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFoto(f); e.target.value = '' }} />
        </div>
      </div>

      <div className="cartao" style={{ maxWidth: 520 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Idioma</div>
        <select value={idioma} onChange={(e) => salvarIdioma(e.target.value as Idioma)} disabled={salvandoIdioma} style={{ maxWidth: 220 }}>
          <option value="pt">🇧🇷 Português</option>
          <option value="en">🇺🇸 English (US)</option>
          <option value="en-gb">🇬🇧 English (UK)</option>
          <option value="es">🇪🇸 Español</option>
        </select>
      </div>

      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Atualize seus dados de acesso.{' '}
        {u.role === 'GESTOR' && 'Se a marca mudar de dono, troque aqui o nome, o e-mail e a senha para transferir a titularidade — todos os dados da rede são mantidos.'}
      </div>
      <form className="cartao" onSubmit={salvar} style={{ maxWidth: 520 }}>
        <div className="campo"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
        <div className="campo"><label>E-mail (seu login)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="campo"><label>Nova senha (deixe vazio para manter)</label><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} placeholder="mínimo 6 caracteres" /></div>
        {ehVendedora && (
          <div className="campo">
            <label>Bio da sua loja (catálogo)</label>
            <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))} placeholder="Ex.: ✨ Apaixonada por moda! Coleções exclusivas e atendimento personalizado 💖 Vem comigo!" />
            <small style={{ color: 'var(--ink-soft)' }}>{bio.length}/280 · aparece no cabeçalho da sua loja (o link do catálogo que você compartilha).</small>
          </div>
        )}
        <div className="acoes"><button className="btn" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button></div>
      </form>
    </>
  )
}

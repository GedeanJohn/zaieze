import { useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'

/** Minha conta — qualquer papel edita os próprios dados (nome, e-mail/login, senha).
 *  Para o gestor, é também o caminho de transferir a titularidade quando a marca é vendida. */
export default function Conta() {
  const u = usuarioLogado()!
  const [nome, setNome] = useState(u.nome)
  const [email, setEmail] = useState(u.email)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setOk(''); setSalvando(true)
    try {
      const corpo: Record<string, unknown> = {}
      if (nome && nome !== u.nome) corpo.nome = nome
      if (email && email !== u.email) corpo.email = email
      if (senha) corpo.senha = senha
      if (Object.keys(corpo).length === 0) { setOk('Nada para alterar.'); return }
      const { data } = await api.patch('/usuarios/me', corpo)
      const atual = usuarioLogado()
      if (atual) localStorage.setItem('modacrm_usuario', JSON.stringify({ ...atual, nome: data.nome, email: data.email }))
      setSenha('')
      setOk('Dados atualizados.' + (corpo.email ? ' Use o novo e-mail no próximo login.' : ''))
    } catch (err) { setErro(mensagemDeErro(err)) }
    finally { setSalvando(false) }
  }

  return (
    <>
      <header><h1>Minha conta</h1></header>
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Atualize seus dados de acesso.{' '}
        {u.role === 'GESTOR' && 'Se a marca mudar de dono, troque aqui o nome, o e-mail e a senha para transferir a titularidade — todos os dados da rede são mantidos.'}
      </div>
      <form className="cartao" onSubmit={salvar} style={{ maxWidth: 520 }}>
        {erro && <div className="alerta">{erro}</div>}
        {ok && <div className="sucesso">{ok}</div>}
        <div className="campo"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
        <div className="campo"><label>E-mail (seu login)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="campo"><label>Nova senha (deixe vazio para manter)</label><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} placeholder="mínimo 6 caracteres" /></div>
        <div className="acoes"><button className="btn" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button></div>
      </form>
    </>
  )
}

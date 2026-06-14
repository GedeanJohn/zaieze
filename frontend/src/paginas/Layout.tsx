import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api, rotuloPapel, temFeature, usuarioLogado } from '../api'

export default function Layout() {
  const usuario = usuarioLogado()!
  const navigate = useNavigate()

  // Aviso global de encerramento de acesso (cancelamento agendado) — todos os papéis, todas as telas
  const [encerraEm, setEncerraEm] = useState<string | null>(null)
  useEffect(() => {
    api.get('/assinaturas/aviso').then(({ data }) => setEncerraEm(data.encerraEm)).catch(() => {})
  }, [])
  const role = usuario.role
  const podeVendasClientes = role !== 'ESTOQUISTA' && role !== 'CLIENTE'
  const podeEstoque = role !== 'VENDEDORA' && role !== 'CLIENTE'
  const podeEquipe = role === 'GESTOR' || role === 'GERENTE' || role === 'SUPER_ADMIN'
  const podeEstoquistas = role === 'GESTOR' || role === 'SUPER_ADMIN'
  const ehDonoRede = role === 'GESTOR' || role === 'SUPER_ADMIN'
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'ativo' : '')

  function sair() {
    localStorage.removeItem('modacrm_token')
    localStorage.removeItem('modacrm_usuario')
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">Moda<em>CRM</em> AI</div>
        <NavLink to="/" end className={cls}>📊 Dashboard</NavLink>
        {podeVendasClientes && <NavLink to="/vendas" className={cls}>🛒 Vendas</NavLink>}
        {podeVendasClientes && <NavLink to="/clientes" className={cls}>👗 Clientes</NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/caixa" className={cls}>📥 Caixa de entrada</NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/campanhas" className={cls}>📲 WhatsApp</NavLink>}
        {podeVendasClientes && temFeature('radar') && <NavLink to="/radar" className={cls}>🎯 Radar</NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/ranking" className={cls}>🏆 Ranking</NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/mural" className={cls}>📣 Mural</NavLink>}
        {podeVendasClientes && temFeature('provador') && <NavLink to="/provador" className={cls}>🪞 Provador</NavLink>}
        {podeVendasClientes && temFeature('atacado') && <NavLink to="/atacado" className={cls}>📦 Atacado</NavLink>}
        <NavLink to="/produtos" className={cls}>🏷️ Produtos</NavLink>
        {podeEstoque && <NavLink to="/estoque" className={cls}>📦 Estoque</NavLink>}
        {podeEstoque && temFeature('multi_loja') && <NavLink to="/transferencias" className={cls}>🔄 Transferências</NavLink>}
        {podeEquipe && <NavLink to="/equipe" className={cls}>👥 Equipe</NavLink>}
        {podeEstoquistas && temFeature('multi_loja') && <NavLink to="/estoquistas" className={cls}>👷 Estoquistas</NavLink>}
        {ehDonoRede && <NavLink to="/planos" className={cls}>💳 Planos</NavLink>}
        <div className="rodape">
          <div>{usuario.nome}</div>
          <div>{usuario.loja?.nome ?? usuario.rede?.nome ?? 'SaaS Admin'} · {rotuloPapel[usuario.role]}</div>
          {usuario.rede && <div style={{ marginTop: 4 }}>Plano <strong style={{ color: '#e8a87c' }}>{usuario.rede.plano}</strong></div>}
          <button onClick={sair}>Sair</button>
        </div>
      </aside>
      <main className="conteudo">
        {encerraEm && (
          <div className="aviso-encerramento">
            ⚠️ Seu acesso ao sistema será encerrado em{' '}
            <strong>
              {new Date(encerraEm).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </strong>
            . Após essa data não haverá nova cobrança e o acesso de todas as lojas será suspenso.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}

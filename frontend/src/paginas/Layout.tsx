import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Users, Inbox, MessageCircle, Filter, Radar, Trophy,
  Megaphone, Sparkles, Package, Tag, Layers, Boxes, ArrowLeftRight, UsersRound,
  HardHat, Palette, BookOpen, CreditCard, Menu, LogOut,
} from 'lucide-react'
import { api, rotuloPapel, temFeature, usuarioLogado } from '../api'

const ICON = { size: 18, strokeWidth: 1.75 } as const

export default function Layout() {
  const usuario = usuarioLogado()!
  const navigate = useNavigate()
  const [menuAberto, setMenuAberto] = useState(false)

  // Aviso global de encerramento de acesso (cancelamento agendado) — todos os papéis, todas as telas
  const [encerraEm, setEncerraEm] = useState<string | null>(null)
  useEffect(() => {
    api.get('/assinaturas/aviso').then(({ data }) => setEncerraEm(data.encerraEm)).catch(() => {})
  }, [])

  // Contagem regressiva amigável até o encerramento
  function contagemRegressiva(iso: string): string {
    const ms = new Date(iso).getTime() - Date.now()
    if (ms <= 0) return 'hoje'
    const dias = Math.floor(ms / 86_400_000)
    if (dias >= 2) return `faltam ${dias} dias`
    if (dias === 1) return 'falta 1 dia'
    const horas = Math.ceil(ms / 3_600_000)
    return horas <= 1 ? 'falta menos de 1 hora' : `faltam ${horas} horas`
  }
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
      <header className="topbar-mobile">
        <button className="menu-toggle" onClick={() => setMenuAberto(true)} aria-label="Abrir menu"><Menu size={24} strokeWidth={2} /></button>
        <div className="logo">Moda<em>CRM</em> AI</div>
      </header>
      {menuAberto && <div className="menu-overlay" onClick={() => setMenuAberto(false)} />}
      <aside
        className={`sidebar ${menuAberto ? 'aberta' : ''}`}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMenuAberto(false) }}
      >
        <div className="logo">Moda<em>CRM</em> AI</div>
        <nav className="sidebar-nav">
        <NavLink to="/" end className={cls}><LayoutDashboard {...ICON} /><span>Dashboard</span></NavLink>
        {podeVendasClientes && <NavLink to="/vendas" className={cls}><ShoppingBag {...ICON} /><span>Vendas</span></NavLink>}
        {podeVendasClientes && <NavLink to="/clientes" className={cls}><Users {...ICON} /><span>Clientes</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/caixa" className={cls}><Inbox {...ICON} /><span>Caixa de entrada</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/campanhas" className={cls}><MessageCircle {...ICON} /><span>WhatsApp</span></NavLink>}
        {podeVendasClientes && temFeature('portal_cliente') && <NavLink to="/funil" className={cls}><Filter {...ICON} /><span>Funil de vendas</span></NavLink>}
        {podeVendasClientes && temFeature('radar') && <NavLink to="/radar" className={cls}><Radar {...ICON} /><span>Radar</span></NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/ranking" className={cls}><Trophy {...ICON} /><span>Ranking</span></NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/mural" className={cls}><Megaphone {...ICON} /><span>Mural</span></NavLink>}
        {podeVendasClientes && temFeature('provador') && <NavLink to="/provador" className={cls}><Sparkles {...ICON} /><span>Provador</span></NavLink>}
        {podeVendasClientes && temFeature('atacado') && <NavLink to="/atacado" className={cls}><Package {...ICON} /><span>Atacado</span></NavLink>}
        <NavLink to="/produtos" className={cls}><Tag {...ICON} /><span>Produtos</span></NavLink>
        {podeEstoque && <NavLink to="/colecoes" className={cls}><Layers {...ICON} /><span>Coleções</span></NavLink>}
        {podeEstoque && <NavLink to="/estoque" className={cls}><Boxes {...ICON} /><span>Estoque</span></NavLink>}
        {podeEstoque && temFeature('multi_loja') && <NavLink to="/transferencias" className={cls}><ArrowLeftRight {...ICON} /><span>Transferências</span></NavLink>}
        {podeEquipe && <NavLink to="/equipe" className={cls}><UsersRound {...ICON} /><span>Equipe</span></NavLink>}
        {podeEstoquistas && temFeature('multi_loja') && <NavLink to="/estoquistas" className={cls}><HardHat {...ICON} /><span>Estoquistas</span></NavLink>}
        {ehDonoRede && temFeature('portal_cliente') && <NavLink to="/marca" className={cls}><Palette {...ICON} /><span>Marca</span></NavLink>}
        {ehDonoRede && <NavLink to="/manual" className={cls}><BookOpen {...ICON} /><span>Manual</span></NavLink>}
        {ehDonoRede && <NavLink to="/planos" className={cls}><CreditCard {...ICON} /><span>Planos</span></NavLink>}
        </nav>
        <div className="rodape">
          <div className="rodape-nome">{usuario.nome}</div>
          <div>{usuario.loja?.nome ?? usuario.rede?.nome ?? 'SaaS Admin'} · {rotuloPapel[usuario.role]}</div>
          {usuario.rede && <div style={{ marginTop: 4 }}>Plano <strong style={{ color: '#e8a87c' }}>{usuario.rede.plano}</strong></div>}
          <button onClick={sair}><LogOut size={15} strokeWidth={1.75} /> Sair</button>
        </div>
      </aside>
      <main className="conteudo">
        {encerraEm && (
          <div className="aviso-encerramento">
            🗓️ Seu acesso vai até{' '}
            <strong>
              {new Date(encerraEm).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </strong>
            <span className="aviso-contagem"> · {contagemRegressiva(encerraEm)}</span>. Sem novas cobranças.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Users, Inbox, MessageCircle, Filter, Radar, Trophy,
  Megaphone, Package, Tag, Layers, Boxes, UsersRound,
  Palette, BookOpen, CreditCard, Menu, LogOut, UserCog, ClipboardCheck, FileText, Wrench, Smartphone, Camera,
} from 'lucide-react'
import { api, rotuloPapel, temFeature, usuarioLogado } from '../api'

const ICON = { size: 18, strokeWidth: 1.75 } as const

/** Iniciais do nome para o avatar do perfil no topo. */
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

export default function Layout() {
  const usuario = usuarioLogado()!
  const navigate = useNavigate()
  const [menuAberto, setMenuAberto] = useState(false)

  // Aviso global de encerramento de acesso (cancelamento agendado) — todos os papéis, todas as telas
  const [encerraEm, setEncerraEm] = useState<string | null>(null)
  // 1ª cobrança a caminho (free trial): só vem preenchido quando faltam <= 30 dias
  const [cobrancaComecaEm, setCobrancaComecaEm] = useState<string | null>(null)
  // Pendência de aceite dos termos (banner) — qualquer usuário da rede vê; o aceite é do gestor
  const [reaceite, setReaceite] = useState<{ pendente: boolean; diasRestantes: number | null } | null>(null)
  useEffect(() => {
    api.get('/assinaturas/aviso').then(({ data }) => { setEncerraEm(data.encerraEm); setCobrancaComecaEm(data.cobrancaComecaEm ?? null) }).catch(() => {})
    api.get('/contrato/status').then(({ data }) => setReaceite(data)).catch(() => {})
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
  const ehDonoRede = role === 'GESTOR' || role === 'SUPER_ADMIN'
  const ehAdmin = role === 'SUPER_ADMIN'
  // Pedidos a separar: gestor de estoque (separa) + gerente/gestor/admin (acompanham e cobram)
  const podeSeparacao = role === 'ESTOQUISTA' || role === 'GERENTE' || role === 'GESTOR' || role === 'SUPER_ADMIN'
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'ativo' : '')

  function sair() {
    localStorage.removeItem('modacrm_token')
    localStorage.removeItem('modacrm_usuario')
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="topbar-avatar" onClick={() => navigate('/conta')} title="Minha conta" aria-label="Minha conta">
          {usuario.fotoUrl
            ? <img src={usuario.fotoUrl} alt="" />
            : <span className="topbar-ini">{iniciais(usuario.nome)}</span>}
        </button>
        {podeVendasClientes && temFeature('whatsapp') && (
          <button className="topbar-chat" onClick={() => navigate('/caixa')} title="Chat Zaieze" aria-label="Chat">
            <MessageCircle size={20} strokeWidth={1.9} />
          </button>
        )}
      </header>
      {menuAberto && <div className="menu-overlay" onClick={() => setMenuAberto(false)} />}
      <div className="shell-corpo">
      <aside
        className={`sidebar ${menuAberto ? 'aberta' : ''}`}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMenuAberto(false) }}
      >
        <div className="sidebar-marca">ZAIEZE</div>
        <nav className="sidebar-nav">
        <NavLink to="/" end className={cls}><LayoutDashboard {...ICON} /><span>Dashboard</span></NavLink>
        {podeVendasClientes && <NavLink to="/vendas" className={cls}><ShoppingBag {...ICON} /><span>Vendas</span></NavLink>}
        {podeVendasClientes && <NavLink to="/clientes" className={cls}><Users {...ICON} /><span>Clientes</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/caixa" className={cls}><Inbox {...ICON} /><span>Chat Zaieze</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/campanhas" className={cls}><MessageCircle {...ICON} /><span>WhatsApp</span></NavLink>}
        {podeVendasClientes && temFeature('funil') && <NavLink to="/funil" className={cls}><Filter {...ICON} /><span>Funil de vendas</span></NavLink>}
        {podeVendasClientes && temFeature('radar') && <NavLink to="/radar" className={cls}><Radar {...ICON} /><span>Radar</span></NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/ranking" className={cls}><Trophy {...ICON} /><span>Ranking</span></NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/mural" className={cls}><Megaphone {...ICON} /><span>Mural</span></NavLink>}
        {podeVendasClientes && temFeature('atacado') && <NavLink to="/atacado" className={cls}><Package {...ICON} /><span>Atacado</span></NavLink>}
        {podeEstoque && <NavLink to="/colecoes" className={cls}><Layers {...ICON} /><span>Coleções</span></NavLink>}
        <NavLink to="/produtos" className={cls}><Tag {...ICON} /><span>Produtos</span></NavLink>
        {podeEstoque && <NavLink to="/estoque" className={cls}><Boxes {...ICON} /><span>Estoque</span></NavLink>}
        {podeSeparacao && <NavLink to="/separacao" className={cls}><ClipboardCheck {...ICON} /><span>Pedidos a separar</span></NavLink>}
        {podeEquipe && <NavLink to="/equipe" className={cls}><UsersRound {...ICON} /><span>Equipe</span></NavLink>}
        {ehDonoRede && temFeature('whatsapp') && <NavLink to="/whatsapp-config" className={cls}><Smartphone {...ICON} /><span>WhatsApp oficial</span></NavLink>}
        {ehDonoRede && temFeature('whatsapp') && <NavLink to="/instagram-config" className={cls}><Camera {...ICON} /><span>Instagram oficial</span></NavLink>}
        {ehDonoRede && temFeature('portal_cliente') && <NavLink to="/marca" className={cls}><Palette {...ICON} /><span>Minha Loja</span></NavLink>}
        {ehDonoRede && <NavLink to="/manual" className={cls}><BookOpen {...ICON} /><span>Manual</span></NavLink>}
        {ehDonoRede && <NavLink to="/planos" className={cls}><CreditCard {...ICON} /><span>Planos</span></NavLink>}
        {ehDonoRede && <NavLink to="/contrato" className={cls}><FileText {...ICON} /><span>Contrato</span></NavLink>}
        {ehAdmin && <NavLink to="/admin" className={cls}><Wrench {...ICON} /><span>Admin</span></NavLink>}
        <NavLink to="/conta" className={cls}><UserCog {...ICON} /><span>Minha conta</span></NavLink>
        </nav>
        <div className="rodape">
          <div className="rodape-nome">{usuario.nome}</div>
          <div>{usuario.loja?.nome ?? usuario.rede?.nome ?? 'SaaS Admin'} · {rotuloPapel[usuario.role]}</div>
          {usuario.rede && <div style={{ marginTop: 4 }}>Plano <strong style={{ color: '#e8a87c' }}>{usuario.rede.plano}</strong></div>}
          <button onClick={sair}><LogOut size={15} strokeWidth={1.75} /> Sair</button>
        </div>
      </aside>
      <main className="conteudo">
        {reaceite?.pendente && (
          <div className="aviso-encerramento" style={{ background: '#3a2a12', color: '#f0c987' }}>
            📄 <strong>Atualizamos nossos termos de prestação de serviços e conduta.</strong>{' '}
            {reaceite.diasRestantes != null && reaceite.diasRestantes > 0
              ? <>Aceite em até <strong>{reaceite.diasRestantes} dia{reaceite.diasRestantes === 1 ? '' : 's'}</strong> para evitar o distrato.</>
              : <>Prazo encerrado — o distrato será aplicado.</>}{' '}
            {ehDonoRede
              ? <Link to="/contrato" style={{ color: '#ffd9a0', fontWeight: 700 }}>Ler e aceitar</Link>
              : <span>Solicite ao gestor da marca para aceitar.</span>}
          </div>
        )}
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
        {cobrancaComecaEm && (
          <div className="aviso-encerramento" style={{ background: '#12233a', color: '#9ec5ff' }}>
            💳 Sua <strong>primeira cobrança</strong> começa em{' '}
            <strong>
              {new Date(cobrancaComecaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </strong>
            <span className="aviso-contagem"> · {contagemRegressiva(cobrancaComecaEm)}</span>. Aproveite o período gratuito. 💛
          </div>
        )}
        <Outlet />
      </main>
      </div>

      {/* Barra de menu no rodapé (só celular) — estilo app. "Mais" abre o menu completo. */}
      <nav className="bottom-nav">
        <NavLink to="/" end className={cls}><LayoutDashboard size={20} strokeWidth={1.9} /><span>Início</span></NavLink>
        {podeVendasClientes && <NavLink to="/vendas" className={cls}><ShoppingBag size={20} strokeWidth={1.9} /><span>Vendas</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/caixa" className={cls}><Inbox size={20} strokeWidth={1.9} /><span>Chat</span></NavLink>}
        {podeVendasClientes && <NavLink to="/clientes" className={cls}><Users size={20} strokeWidth={1.9} /><span>Clientes</span></NavLink>}
        <button type="button" className={`bn-mais${menuAberto ? ' ativo' : ''}`} onClick={() => setMenuAberto(true)}>
          <Menu size={20} strokeWidth={1.9} /><span>Mais</span>
        </button>
      </nav>
    </div>
  )
}

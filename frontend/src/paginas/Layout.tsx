import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Users, Inbox, MessageCircle, Filter, Radar, Trophy,
  Megaphone, Package, Tag, Layers, Boxes, UsersRound,
  Palette, BookOpen, CreditCard, Menu, LogOut, UserCog, ClipboardCheck, FileText, Wrench, Smartphone, Camera,
} from 'lucide-react'
import { api, rotuloPapel, temFeature, usuarioLogado } from '../api'
import { useIdioma } from '../lib/i18n'

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
  const { t } = useIdioma()

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
    if (ms <= 0) return t('layout.contagem.hoje')
    const dias = Math.floor(ms / 86_400_000)
    if (dias >= 2) return `${t('layout.contagem.faltamDias')} ${dias} ${t('unidade.dias')}`
    if (dias === 1) return t('layout.contagem.falta1Dia')
    const horas = Math.ceil(ms / 3_600_000)
    return horas <= 1 ? t('layout.contagem.faltaMenos1Hora') : `${t('layout.contagem.faltamDias')} ${horas} ${t('unidade.horas')}`
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
        <button className="topbar-avatar" onClick={() => navigate('/conta')} title={t('layout.minhaConta')} aria-label={t('layout.minhaConta')}>
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
        <NavLink to="/" end className={cls}><LayoutDashboard {...ICON} /><span>{t('layout.dashboard')}</span></NavLink>
        {podeVendasClientes && <NavLink to="/vendas" className={cls}><ShoppingBag {...ICON} /><span>{t('layout.vendas')}</span></NavLink>}
        {podeVendasClientes && <NavLink to="/clientes" className={cls}><Users {...ICON} /><span>{t('layout.clientes')}</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/caixa" className={cls}><Inbox {...ICON} /><span>{t('layout.chatZaieze')}</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/campanhas" className={cls}><MessageCircle {...ICON} /><span>{t('layout.campanhas')}</span></NavLink>}
        {podeVendasClientes && temFeature('funil') && <NavLink to="/funil" className={cls}><Filter {...ICON} /><span>{t('layout.funil')}</span></NavLink>}
        {podeVendasClientes && temFeature('radar') && <NavLink to="/radar" className={cls}><Radar {...ICON} /><span>{t('layout.radar')}</span></NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/ranking" className={cls}><Trophy {...ICON} /><span>{t('layout.ranking')}</span></NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/mural" className={cls}><Megaphone {...ICON} /><span>{t('layout.mural')}</span></NavLink>}
        {podeVendasClientes && temFeature('atacado') && <NavLink to="/atacado" className={cls}><Package {...ICON} /><span>{t('layout.atacado')}</span></NavLink>}
        {podeEstoque && <NavLink to="/colecoes" className={cls}><Layers {...ICON} /><span>{t('layout.colecoes')}</span></NavLink>}
        <NavLink to="/produtos" className={cls}><Tag {...ICON} /><span>{t('layout.produtos')}</span></NavLink>
        {podeEstoque && <NavLink to="/estoque" className={cls}><Boxes {...ICON} /><span>{t('layout.estoque')}</span></NavLink>}
        {podeSeparacao && <NavLink to="/separacao" className={cls}><ClipboardCheck {...ICON} /><span>{t('layout.separacao')}</span></NavLink>}
        {podeEquipe && <NavLink to="/equipe" className={cls}><UsersRound {...ICON} /><span>{t('layout.equipe')}</span></NavLink>}
        {ehDonoRede && temFeature('whatsapp') && <NavLink to="/whatsapp-config" className={cls}><Smartphone {...ICON} /><span>{t('layout.whatsappOficial')}</span></NavLink>}
        {ehDonoRede && temFeature('whatsapp') && <NavLink to="/instagram-config" className={cls}><Camera {...ICON} /><span>{t('layout.instagramOficial')}</span></NavLink>}
        {ehDonoRede && temFeature('portal_cliente') && <NavLink to="/marca" className={cls}><Palette {...ICON} /><span>{t('layout.minhaLoja')}</span></NavLink>}
        {ehDonoRede && <NavLink to="/manual" className={cls}><BookOpen {...ICON} /><span>{t('layout.manual')}</span></NavLink>}
        {ehDonoRede && <NavLink to="/planos" className={cls}><CreditCard {...ICON} /><span>{t('layout.planos')}</span></NavLink>}
        {ehDonoRede && <NavLink to="/contrato" className={cls}><FileText {...ICON} /><span>{t('layout.contrato')}</span></NavLink>}
        {ehAdmin && <NavLink to="/admin" className={cls}><Wrench {...ICON} /><span>{t('layout.admin')}</span></NavLink>}
        <NavLink to="/conta" className={cls}><UserCog {...ICON} /><span>{t('layout.minhaConta')}</span></NavLink>
        </nav>
        <div className="rodape">
          <div className="rodape-nome">{usuario.nome}</div>
          <div>{usuario.loja?.nome ?? usuario.rede?.nome ?? 'SaaS Admin'} · {t(`papel.${usuario.role}`) || rotuloPapel[usuario.role]}</div>
          {usuario.rede && <div style={{ marginTop: 4 }}>{t('layout.plano')} <strong style={{ color: '#e8a87c' }}>{usuario.rede.plano}</strong></div>}
          <button onClick={sair}><LogOut size={15} strokeWidth={1.75} /> {t('layout.sair')}</button>
        </div>
      </aside>
      <main className="conteudo">
        {reaceite?.pendente && (
          <div className="aviso-encerramento" style={{ background: '#3a2a12', color: '#f0c987' }}>
            📄 <strong>{t('layout.termosAtualizados')}</strong>{' '}
            {reaceite.diasRestantes != null && reaceite.diasRestantes > 0
              ? <>{t('layout.aceiteEmAte')} <strong>{reaceite.diasRestantes} {reaceite.diasRestantes === 1 ? t('unidade.dia') : t('unidade.dias')}</strong> {t('layout.paraEvitarDistrato')}.</>
              : <>{t('layout.prazoEncerrado')}</>}{' '}
            {ehDonoRede
              ? <Link to="/contrato" style={{ color: '#ffd9a0', fontWeight: 700 }}>{t('layout.lerEAceitar')}</Link>
              : <span>{t('layout.soliciteAoGestor')}</span>}
          </div>
        )}
        {encerraEm && (
          <div className="aviso-encerramento">
            🗓️ {t('layout.acessoVaiAte')}{' '}
            <strong>
              {new Date(encerraEm).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </strong>
            <span className="aviso-contagem"> · {contagemRegressiva(encerraEm)}</span>. {t('layout.semNovasCobrancas')}.
          </div>
        )}
        {cobrancaComecaEm && (
          <div className="aviso-encerramento" style={{ background: '#12233a', color: '#9ec5ff' }}>
            💳 {t('layout.primeiraCobrancaComeca')}{' '}
            <strong>
              {new Date(cobrancaComecaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </strong>
            <span className="aviso-contagem"> · {contagemRegressiva(cobrancaComecaEm)}</span>. {t('layout.aproveitePeriodo')} 💛
          </div>
        )}
        <Outlet />
      </main>
      </div>

      {/* Barra de menu no rodapé (só celular) — estilo app. "Mais" abre o menu completo. */}
      <nav className="bottom-nav">
        <NavLink to="/" end className={cls}><LayoutDashboard size={20} strokeWidth={1.9} /><span>{t('layout.inicio')}</span></NavLink>
        {podeVendasClientes && <NavLink to="/vendas" className={cls}><ShoppingBag size={20} strokeWidth={1.9} /><span>{t('layout.vendas')}</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/caixa" className={cls}><Inbox size={20} strokeWidth={1.9} /><span>{t('layout.chat')}</span></NavLink>}
        {podeVendasClientes && <NavLink to="/clientes" className={cls}><Users size={20} strokeWidth={1.9} /><span>{t('layout.clientes')}</span></NavLink>}
        <button type="button" className={`bn-mais${menuAberto ? ' ativo' : ''}`} onClick={() => setMenuAberto(true)}>
          <Menu size={20} strokeWidth={1.9} /><span>{t('layout.mais')}</span>
        </button>
      </nav>
    </div>
  )
}

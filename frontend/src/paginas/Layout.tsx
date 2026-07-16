import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Users, Inbox, MessageCircle, Filter, Radar, Trophy,
  Megaphone, Package, Tag, Layers, Boxes, UsersRound, Eye, Receipt,
  Palette, BookOpen, CreditCard, Menu, LogOut, UserCog, ClipboardCheck, FileText, Wrench, Smartphone, Camera, Store, Shirt,
  ChevronLeft, ChevronRight, Bot, Landmark,
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
  // Sidebar recolhida (só ícones) no desktop — vale para qualquer perfil, preferência salva por navegador
  const [menuRecolhido, setMenuRecolhido] = useState(() => localStorage.getItem('zaieze_menu_recolhido') === '1')
  useEffect(() => { localStorage.setItem('zaieze_menu_recolhido', menuRecolhido ? '1' : '0') }, [menuRecolhido])
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
  // Supervisão do atendimento (espelho somente leitura das conversas das vendedoras): gerente/gestor/admin.
  const podeSupervisionar = role === 'GERENTE' || role === 'GESTOR' || role === 'SUPER_ADMIN'
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
        className={`sidebar ${menuAberto ? 'aberta' : ''} ${menuRecolhido ? 'recolhida' : ''}`}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMenuAberto(false) }}
      >
        <button
          type="button" className="sidebar-recolher"
          onClick={() => setMenuRecolhido((v) => !v)}
          title={menuRecolhido ? t('layout.expandirMenu') : t('layout.recolherMenu')}
          aria-label={menuRecolhido ? t('layout.expandirMenu') : t('layout.recolherMenu')}
        >
          {menuRecolhido ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronLeft size={14} strokeWidth={2} />}
        </button>
        <div className="sidebar-marca">{menuRecolhido ? 'Z' : 'ZAIEZE'}</div>
        <nav className="sidebar-nav">
        <NavLink to="/" end className={cls} title={t('layout.dashboard')}><LayoutDashboard {...ICON} /><span>{t('layout.dashboard')}</span></NavLink>
        {podeVendasClientes && <NavLink to="/vendas" className={cls} title={t('layout.vendas')}><ShoppingBag {...ICON} /><span>{t('layout.vendas')}</span></NavLink>}
        {podeVendasClientes && <NavLink to="/orcamentos" className={cls} title={t('layout.orcamentos')}><Receipt {...ICON} /><span>{t('layout.orcamentos')}</span></NavLink>}
        {podeVendasClientes && <NavLink to="/clientes" className={cls} title={t('layout.clientes')}><Users {...ICON} /><span>{t('layout.clientes')}</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/caixa" className={cls} title={t('layout.chatZaieze')}><Inbox {...ICON} /><span>{t('layout.chatZaieze')}</span></NavLink>}
        {podeSupervisionar && temFeature('whatsapp') && <NavLink to="/supervisao" className={cls} title={t('layout.supervisao')}><Eye {...ICON} /><span>{t('layout.supervisao')}</span></NavLink>}
        {podeVendasClientes && temFeature('whatsapp') && <NavLink to="/campanhas" className={cls} title={t('layout.campanhas')}><MessageCircle {...ICON} /><span>{t('layout.campanhas')}</span></NavLink>}
        {podeVendasClientes && temFeature('funil') && <NavLink to="/funil" className={cls} title={t('layout.funil')}><Filter {...ICON} /><span>{t('layout.funil')}</span></NavLink>}
        {podeVendasClientes && temFeature('radar') && <NavLink to="/radar" className={cls} title={t('layout.radar')}><Radar {...ICON} /><span>{t('layout.radar')}</span></NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/ranking" className={cls} title={t('layout.ranking')}><Trophy {...ICON} /><span>{t('layout.ranking')}</span></NavLink>}
        {podeVendasClientes && temFeature('gamificacao') && <NavLink to="/mural" className={cls} title={t('layout.mural')}><Megaphone {...ICON} /><span>{t('layout.mural')}</span></NavLink>}
        {podeVendasClientes && temFeature('atacado') && <NavLink to="/atacado" className={cls} title={t('layout.atacado')}><Package {...ICON} /><span>{t('layout.atacado')}</span></NavLink>}
        {podeVendasClientes && <NavLink to="/provador" className={cls} title={t('layout.provador')}><Shirt {...ICON} /><span>{t('layout.provador')}</span></NavLink>}
        {podeEstoque && <NavLink to="/colecoes" className={cls} title={t('layout.colecoes')}><Layers {...ICON} /><span>{t('layout.colecoes')}</span></NavLink>}
        <NavLink to="/produtos" className={cls} title={t('layout.produtos')}><Tag {...ICON} /><span>{t('layout.produtos')}</span></NavLink>
        {podeEstoque && <NavLink to="/estoque" className={cls} title={t('layout.estoque')}><Boxes {...ICON} /><span>{t('layout.estoque')}</span></NavLink>}
        {podeSeparacao && <NavLink to="/separacao" className={cls} title={t('layout.separacao')}><ClipboardCheck {...ICON} /><span>{t('layout.separacao')}</span></NavLink>}
        {podeEquipe && <NavLink to="/equipe" className={cls} title={t('layout.equipe')}><UsersRound {...ICON} /><span>{t('layout.equipe')}</span></NavLink>}
        {ehDonoRede && temFeature('whatsapp') && <NavLink to="/whatsapp-config" className={cls} title={t('layout.whatsappOficial')}><Smartphone {...ICON} /><span>{t('layout.whatsappOficial')}</span></NavLink>}
        {ehDonoRede && temFeature('whatsapp') && <NavLink to="/instagram-config" className={cls} title={t('layout.instagramOficial')}><Camera {...ICON} /><span>{t('layout.instagramOficial')}</span></NavLink>}
        {ehDonoRede && <NavLink to="/vendedora-zaieze" className={cls} title={t('layout.vendedoraZaieze')}><Bot {...ICON} /><span>{t('layout.vendedoraZaieze')}</span></NavLink>}
        {ehDonoRede && <NavLink to="/recebimento-vendas" className={cls} title={t('layout.recebimentoVendas')}><Landmark {...ICON} /><span>{t('layout.recebimentoVendas')}</span></NavLink>}
        {ehDonoRede && temFeature('marketplace') && <NavLink to="/mercadolivre-config" className={cls} title={t('layout.mercadoLivre')}><Store {...ICON} /><span>{t('layout.mercadoLivre')}</span></NavLink>}
        {ehDonoRede && temFeature('portal_cliente') && <NavLink to="/marca" className={cls} title={t('layout.minhaLoja')}><Palette {...ICON} /><span>{t('layout.minhaLoja')}</span></NavLink>}
        {ehDonoRede && <NavLink to="/manual" className={cls} title={t('layout.manual')}><BookOpen {...ICON} /><span>{t('layout.manual')}</span></NavLink>}
        {ehDonoRede && <NavLink to="/planos" className={cls} title={t('layout.planos')}><CreditCard {...ICON} /><span>{t('layout.planos')}</span></NavLink>}
        {ehDonoRede && <NavLink to="/contrato" className={cls} title={t('layout.contrato')}><FileText {...ICON} /><span>{t('layout.contrato')}</span></NavLink>}
        {ehAdmin && <NavLink to="/admin" className={cls} title={t('layout.admin')}><Wrench {...ICON} /><span>{t('layout.admin')}</span></NavLink>}
        <NavLink to="/conta" className={cls} title={t('layout.minhaConta')}><UserCog {...ICON} /><span>{t('layout.minhaConta')}</span></NavLink>
        </nav>
        <div className="rodape">
          <div className="rodape-nome">{usuario.nome}</div>
          <div>{usuario.loja?.nome ?? usuario.rede?.nome ?? 'SaaS Admin'} · {t(`papel.${usuario.role}`) || rotuloPapel[usuario.role]}</div>
          {usuario.rede && <div style={{ marginTop: 4 }}>{t('layout.plano')} <strong style={{ color: '#e8a87c' }}>{usuario.rede.plano}</strong></div>}
          <button onClick={sair} title={t('layout.sair')}><LogOut size={15} strokeWidth={1.75} /> <span>{t('layout.sair')}</span></button>
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

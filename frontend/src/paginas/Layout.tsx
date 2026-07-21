import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, Users, Inbox, MessageCircle, Filter, Radar, Trophy,
  Megaphone, Package, Tag, Layers, Boxes, UsersRound, Eye, Receipt,
  Palette, BookOpen, CreditCard, Menu, LogOut, UserCog, ClipboardCheck, FileText, Wrench, Smartphone, Camera, Store, Shirt,
  ChevronLeft, ChevronRight, ChevronDown, Bot, Landmark, Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { api, rotuloPapel, temFeature, temAddon, usuarioLogado } from '../api'
import { useIdioma } from '../lib/i18n'

const ICON = { size: 18, strokeWidth: 1.75 } as const

/** Iniciais do nome para o avatar do perfil no topo. */
function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

interface ItemMenu {
  to: string
  label: string
  Icone: LucideIcon
  mostrar: boolean
}

/** Um grupo de itens do menu com header colapsável (accordion, estado salvo por navegador).
 * Não renderiza nada se não sobrar item visível pro papel atual. Se a rota ativa está dentro do
 * grupo, ele abre sozinho mesmo que o usuário tenha colapsado — sem sobrescrever a preferência salva. */
function SecaoMenu({ titulo, itens, fechada, onToggle }: { titulo: string; itens: ItemMenu[]; fechada: boolean; onToggle: () => void }) {
  const location = useLocation()
  if (itens.length === 0) return null
  const contemAtiva = itens.some((i) => i.to === location.pathname)
  const aberta = contemAtiva || !fechada
  return (
    <div className="sidebar-secao">
      <button type="button" className="sidebar-secao-header" onClick={onToggle} aria-expanded={aberta}>
        <span>{titulo}</span>
        <ChevronDown size={14} strokeWidth={2} style={{ transform: aberta ? undefined : 'rotate(-90deg)', transition: 'transform 0.15s ease' }} />
      </button>
      <div className="sidebar-secao-corpo" style={{ display: aberta ? 'flex' : 'none' }}>
        {itens.map(({ to, label, Icone }) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'ativo' : '')} title={label}>
            <Icone {...ICON} /><span>{label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export default function Layout() {
  const usuario = usuarioLogado()!
  const navigate = useNavigate()
  const [menuAberto, setMenuAberto] = useState(false)
  // Sidebar recolhida (só ícones) no desktop — vale para qualquer perfil, preferência salva por navegador
  const [menuRecolhido, setMenuRecolhido] = useState(() => localStorage.getItem('zaieze_menu_recolhido') === '1')
  useEffect(() => { localStorage.setItem('zaieze_menu_recolhido', menuRecolhido ? '1' : '0') }, [menuRecolhido])
  // Seções do menu colapsadas (accordion) — preferência salva por navegador, mesmo espírito do recolhido acima.
  const [secoesFechadas, setSecoesFechadas] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('zaieze_menu_secoes_fechadas') ?? '{}') } catch { return {} }
  })
  useEffect(() => { localStorage.setItem('zaieze_menu_secoes_fechadas', JSON.stringify(secoesFechadas)) }, [secoesFechadas])
  function alternarSecao(chave: string) {
    setSecoesFechadas((s) => ({ ...s, [chave]: !s[chave] }))
  }
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
  // Estoque Inteligente (add-on de IA): dono da rede contrata, mas quem opera no dia a dia é o
  // Gestor de Estoque — mesmo grupo de papéis já usado no gate do backend (GET /estoque/inteligencia).
  const podeEstoqueInteligente = role === 'SUPER_ADMIN' || role === 'GESTOR' || role === 'ESTOQUISTA'
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'ativo' : '')

  function sair() {
    localStorage.removeItem('modacrm_token')
    localStorage.removeItem('modacrm_usuario')
    navigate('/login')
  }

  const itensVendas: ItemMenu[] = [
    { to: '/vendas', label: t('layout.vendas'), Icone: ShoppingBag, mostrar: podeVendasClientes },
    { to: '/orcamentos', label: t('layout.orcamentos'), Icone: Receipt, mostrar: podeVendasClientes },
    { to: '/clientes', label: t('layout.clientes'), Icone: Users, mostrar: podeVendasClientes },
    { to: '/funil', label: t('layout.funil'), Icone: Filter, mostrar: podeVendasClientes && temFeature('funil') },
    { to: '/radar', label: t('layout.radar'), Icone: Radar, mostrar: podeVendasClientes && temFeature('radar') },
    { to: '/atacado', label: t('layout.atacado'), Icone: Package, mostrar: podeVendasClientes && temFeature('atacado') },
  ].filter((i) => i.mostrar)

  const itensForcaIa: ItemMenu[] = [
    { to: '/vendedora-zaieze', label: t('layout.vendedoraZaieze'), Icone: Bot, mostrar: ehDonoRede && temAddon('VENDEDORA_ZAIEZE') },
    { to: '/provador', label: t('layout.provador'), Icone: Shirt, mostrar: podeVendasClientes && temAddon('PROVADOR') },
    { to: '/estoque-inteligente', label: t('layout.estoqueInteligente'), Icone: Sparkles, mostrar: podeEstoqueInteligente && temAddon('ESTOQUE_INTELIGENTE') },
  ].filter((i) => i.mostrar)

  const itensComunicacao: ItemMenu[] = [
    { to: '/caixa', label: t('layout.chatZaieze'), Icone: Inbox, mostrar: podeVendasClientes && temFeature('whatsapp') },
    { to: '/supervisao', label: t('layout.supervisao'), Icone: Eye, mostrar: podeSupervisionar && temFeature('whatsapp') },
    { to: '/campanhas', label: t('layout.campanhas'), Icone: MessageCircle, mostrar: podeVendasClientes && temFeature('whatsapp') },
  ].filter((i) => i.mostrar)

  const itensProdutoEstoque: ItemMenu[] = [
    { to: '/colecoes', label: t('layout.colecoes'), Icone: Layers, mostrar: podeEstoque },
    { to: '/produtos', label: t('layout.produtos'), Icone: Tag, mostrar: true },
    { to: '/estoque', label: t('layout.estoque'), Icone: Boxes, mostrar: podeEstoque },
    { to: '/separacao', label: t('layout.separacao'), Icone: ClipboardCheck, mostrar: podeSeparacao },
  ].filter((i) => i.mostrar)

  const itensEquipe: ItemMenu[] = [
    { to: '/equipe', label: t('layout.equipe'), Icone: UsersRound, mostrar: podeEquipe },
    { to: '/ranking', label: t('layout.ranking'), Icone: Trophy, mostrar: podeVendasClientes && temFeature('gamificacao') },
    { to: '/mural', label: t('layout.mural'), Icone: Megaphone, mostrar: podeVendasClientes && temFeature('gamificacao') },
  ].filter((i) => i.mostrar)

  const itensCanais: ItemMenu[] = [
    { to: '/whatsapp-config', label: t('layout.whatsappOficial'), Icone: Smartphone, mostrar: ehDonoRede && temFeature('whatsapp') },
    { to: '/instagram-config', label: t('layout.instagramOficial'), Icone: Camera, mostrar: ehDonoRede && temFeature('whatsapp') },
    { to: '/mercadolivre-config', label: t('layout.mercadoLivre'), Icone: Store, mostrar: ehDonoRede && temFeature('marketplace') },
  ].filter((i) => i.mostrar)

  const itensFinanceiro: ItemMenu[] = [
    { to: '/recebimento-vendas', label: t('layout.recebimentoVendas'), Icone: Landmark, mostrar: ehDonoRede },
    { to: '/planos', label: t('layout.planos'), Icone: CreditCard, mostrar: ehDonoRede },
    { to: '/contrato', label: t('layout.contrato'), Icone: FileText, mostrar: ehDonoRede },
  ].filter((i) => i.mostrar)

  const itensInstitucional: ItemMenu[] = [
    { to: '/marca', label: t('layout.minhaLoja'), Icone: Palette, mostrar: ehDonoRede && temFeature('portal_cliente') },
    { to: '/manual', label: t('layout.manual'), Icone: BookOpen, mostrar: ehDonoRede },
  ].filter((i) => i.mostrar)

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

        <SecaoMenu titulo={t('layout.secao.vendas')} itens={itensVendas} fechada={!!secoesFechadas.vendas} onToggle={() => alternarSecao('vendas')} />
        <SecaoMenu titulo={t('layout.secao.forcaIa')} itens={itensForcaIa} fechada={!!secoesFechadas.forcaIa} onToggle={() => alternarSecao('forcaIa')} />
        <SecaoMenu titulo={t('layout.secao.comunicacao')} itens={itensComunicacao} fechada={!!secoesFechadas.comunicacao} onToggle={() => alternarSecao('comunicacao')} />
        <SecaoMenu titulo={t('layout.secao.produtoEstoque')} itens={itensProdutoEstoque} fechada={!!secoesFechadas.produtoEstoque} onToggle={() => alternarSecao('produtoEstoque')} />
        <SecaoMenu titulo={t('layout.secao.equipe')} itens={itensEquipe} fechada={!!secoesFechadas.equipe} onToggle={() => alternarSecao('equipe')} />
        <SecaoMenu titulo={t('layout.secao.canais')} itens={itensCanais} fechada={!!secoesFechadas.canais} onToggle={() => alternarSecao('canais')} />
        <SecaoMenu titulo={t('layout.secao.financeiro')} itens={itensFinanceiro} fechada={!!secoesFechadas.financeiro} onToggle={() => alternarSecao('financeiro')} />
        <SecaoMenu titulo={t('layout.secao.institucional')} itens={itensInstitucional} fechada={!!secoesFechadas.institucional} onToggle={() => alternarSecao('institucional')} />

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

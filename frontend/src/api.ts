import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('modacrm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('modacrm_token')
      localStorage.removeItem('modacrm_usuario')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export type Papel = 'SUPER_ADMIN' | 'GESTOR' | 'ESTOQUISTA' | 'GERENTE' | 'VENDEDORA' | 'CLIENTE'

export interface Usuario {
  id: string
  nome: string
  email: string
  role: Papel
  fotoUrl?: string | null
  rede: { id: string; nome: string; plano: string } | null
  loja: { id: string; nome: string; slug: string } | null
}

/** Atualiza o usuário salvo no localStorage (ex.: após trocar a foto de perfil). */
export function atualizarUsuarioLocal(patch: Partial<Usuario>): Usuario | null {
  const atual = usuarioLogado()
  if (!atual) return null
  const novo = { ...atual, ...patch }
  localStorage.setItem('modacrm_usuario', JSON.stringify(novo))
  return novo
}

export function usuarioLogado(): Usuario | null {
  const raw = localStorage.getItem('modacrm_usuario')
  return raw ? (JSON.parse(raw) as Usuario) : null
}

export const rotuloPapel: Record<Papel, string> = {
  SUPER_ADMIN: 'Admin SaaS',
  GESTOR: 'Gestor da marca',
  ESTOQUISTA: 'Gestor de Estoque',
  GERENTE: 'Gerente de Loja',
  VENDEDORA: 'Vendedora',
  CLIENTE: 'Cliente',
}

export const rotuloMovimento: Record<string, string> = {
  ENTRADA: 'Entrada',
  SAIDA_VENDA: 'Saída (venda)',
  AJUSTE: 'Ajuste',
  DEVOLUCAO: 'Devolução',
  TRANSFERENCIA_SAIDA: 'Transf. (saída)',
  TRANSFERENCIA_ENTRADA: 'Transf. (entrada)',
}

export const rotuloStatusTransf: Record<string, string> = {
  EM_TRANSITO: 'Em trânsito',
  RECEBIDA: 'Recebida',
  CANCELADA: 'Cancelada',
}

// Canal da venda — o foco do produto é a venda online (WhatsApp)
export const CANAIS_VENDA = ['BALCAO', 'ONLINE'] as const
export type CanalVenda = (typeof CANAIS_VENDA)[number]
export const rotuloCanal: Record<string, string> = { BALCAO: 'Balcão', ONLINE: 'Online (WhatsApp)' }

export const FORMAS_RECEBIMENTO = ['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'OUTRO'] as const
export type FormaRecebimento = (typeof FORMAS_RECEBIMENTO)[number]
export const rotuloForma: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  DEBITO: 'Cartão de débito',
  CREDITO: 'Cartão de crédito',
  OUTRO: 'Outro',
}

// ── Planos / entitlements (espelho da matriz do backend) ──
export type Plano = 'START' | 'PRO' | 'ELITE'
const ORDEM_PLANO: Record<Plano, number> = { START: 0, PRO: 1, ELITE: 2 }

export const FEATURE_MIN: Record<string, Plano> = {
  vendas: 'START', produtos: 'START', estoque: 'START', clientes: 'START', dashboard: 'START', forma_recebimento: 'START', whatsapp: 'START', multi_loja: 'START', funil: 'START', atacado: 'START',
  crm_segmentacao: 'PRO', gamificacao: 'PRO',
  radar: 'ELITE', estoque_inteligente: 'ELITE', ia_avancada: 'ELITE', portal_cliente: 'ELITE',
}

// Rótulos amigáveis das funcionalidades (tela de Planos/Upgrade)
export const rotuloFeature: Record<string, string> = {
  vendas: 'PDV / Vendas', produtos: 'Catálogo de produtos', estoque: 'Controle de estoque',
  clientes: 'Cadastro de clientes', dashboard: 'Dashboard de vendas', forma_recebimento: 'Forma de recebimento',
  whatsapp: 'WhatsApp (disparos, réguas, Chat Zaieze)',
  funil: 'Funil de vendas (Kanban)',
  crm_segmentacao: 'Carteira inteligente (segmentação)', gamificacao: 'Comissão, ranking e mural',
  estoque_inteligente: 'Estoque inteligente (encalhados/ruptura)',
  multi_loja: 'Operação em rede (várias lojas vendendo do estoque central da marca)', radar: 'Radar de Oportunidades',
  atacado: 'Sistema de atacado',
  ia_avancada: 'IA avançada', portal_cliente: 'Portal do Cliente',
}

export function planoAtual(): Plano {
  return (usuarioLogado()?.rede?.plano as Plano) ?? 'START'
}

export function temFeature(feature: string): boolean {
  const u = usuarioLogado()
  if (u?.role === 'SUPER_ADMIN') return true
  const plano = (u?.rede?.plano as Plano) ?? 'START'
  return ORDEM_PLANO[plano] >= ORDEM_PLANO[FEATURE_MIN[feature] ?? 'START']
}

export function mensagemDeErro(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const dados = e.response?.data as { erro?: string; detalhes?: { campo: string; mensagem: string }[] } | undefined
    if (dados?.detalhes?.length) return dados.detalhes.map((d) => `${d.campo}: ${d.mensagem}`).join('; ')
    if (dados?.erro) return dados.erro
  }
  return 'Erro inesperado. Tente novamente.'
}

export function formataReal(v: number | string): string {
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

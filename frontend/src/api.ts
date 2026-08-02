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

export type Papel = 'SUPER_ADMIN' | 'GESTOR' | 'ESTOQUISTA' | 'GERENTE' | 'VENDEDORA' | 'CLIENTE' | 'AFILIADO' | 'ASSESSORA'

export interface Usuario {
  id: string
  nome: string
  email: string
  role: Papel
  // Só relevante quando role === 'SUPER_ADMIN': é o login "Gestor Comercial do Sistema" (mesmas
  // atribuições do Gestor Administrador — muda só o rótulo exibido, ver Layout.tsx).
  comercial?: boolean
  fotoUrl?: string | null
  idioma?: string
  rede: { id: string; nome: string; addonsAtivos?: string[] } | null
  loja: { id: string; nome: string; slug: string } | null
  assessor?: { slug: string } | null
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
  AFILIADO: 'Afiliado',
  ASSESSORA: 'Brand Partner',
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

// ── Add-ons de IA (Força IA): contratados à parte do assento de vendedora, ver backend/addons ──
export type TipoAddon = 'PROVADOR' | 'VENDEDORA_ZAIEZE' | 'ESTOQUE_INTELIGENTE' | 'RADAR'
export function temAddon(tipo: TipoAddon): boolean {
  const u = usuarioLogado()
  if (u?.role === 'SUPER_ADMIN') return true
  return u?.rede?.addonsAtivos?.includes(tipo) ?? false
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
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formataUsd(v: number | string): string {
  return `US$ ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

import { createContext, useContext, useState, type ReactNode } from 'react'

export type Idioma = 'pt' | 'en' | 'es'

const CHAVE = 'zaieze_idioma'

type Dicionario = Record<string, string>

// Escopo desta 1ª etapa: landing page pública + rótulos de feature (compartilhados com o CRM).
// Textos vindos do backend (resumo/limite de cada plano) NÃO são traduzidos ainda — seguem em pt.
const DICIONARIOS: Record<Idioma, Dicionario> = {
  pt: {
    'meta.titulo': 'ZAIEZE — Sistemas Inteligentes para a Moda',
    'meta.descricao': 'Sistema de gestão, estoque e CRM para lojas de moda (varejo e atacado) com atendimento pelo WhatsApp organizado por vendedora e IA que recupera clientes e gira o estoque parado.',
    'nav.planos': 'Planos',
    'nav.como': 'Como funciona',
    'nav.entrar': 'Entrar',
    'hero.titulo': 'Sistemas Inteligentes para a Moda',
    'hero.texto': 'Organize a venda online da sua equipe pelo WhatsApp: carteira por vendedora, estoque em grade e IA que recupera clientes e gira o que está parado. Seu painel no ar em minutos, no seu próprio endereço.',
    'hero.verPlanos': 'Ver planos',
    'hero.jaSouCliente': 'Já sou cliente',
    'hero.nota': 'Lojas e vendedoras ilimitadas em todos os planos · 7 dias para testar',
    'faixa.1.titulo': '1. Escolha o plano',
    'faixa.1.texto': 'Start, Pro ou Elite — todos sem limite de lojas ou vendedoras.',
    'faixa.2.titulo': '2. Crie seu endereço',
    'faixa.2.texto': 'sualoja.zaieze.com fica pronto na hora do pagamento.',
    'faixa.3.titulo': '3. Comece a vender',
    'faixa.3.texto': 'Cadastre produtos, equipe e dispare no WhatsApp.',
    'unidade.mes': 'mês',
    'unidade.ano': 'ano',
    'planos.titulo': 'Escolha seu plano',
    'planos.sub': 'Pague por funcionalidade, não por tamanho. Cancele quando quiser.',
    'planos.maisPopular': 'Mais popular',
    'planos.assinar': 'Assinar',
    'planos.equivaleMes': 'equivale a',
    'planos.duvida': 'Ficou com alguma dúvida sobre os planos?',
    'planos.faleConosco': 'Fale Conosco!',
    'footer.tagline': 'Sistemas Inteligentes para a Moda',
    'footer.quemSomos': 'Quem Somos',
    'footer.lgpd': 'LGPD',
    'footer.privacidade': 'Política de Privacidade',
    'footer.pagamento': 'Pagamento seguro via Mercado Pago',
    'feature.vendas': 'PDV / Vendas',
    'feature.produtos': 'Catálogo de produtos',
    'feature.estoque': 'Controle de estoque',
    'feature.clientes': 'Cadastro de clientes',
    'feature.dashboard': 'Dashboard de vendas',
    'feature.forma_recebimento': 'Forma de recebimento',
    'feature.whatsapp': 'WhatsApp (disparos, réguas, Chat Zaieze)',
    'feature.funil': 'Funil de vendas (Kanban)',
    'feature.crm_segmentacao': 'Carteira inteligente (segmentação)',
    'feature.gamificacao': 'Comissão, ranking e mural',
    'feature.estoque_inteligente': 'Estoque inteligente (encalhados/ruptura)',
    'feature.multi_loja': 'Operação em rede (várias lojas vendendo do estoque central da marca)',
    'feature.radar': 'Radar de Oportunidades',
    'feature.atacado': 'Sistema de atacado',
    'feature.ia_avancada': 'IA avançada',
    'feature.portal_cliente': 'Portal do Cliente',
  },
  en: {
    'meta.titulo': 'ZAIEZE — Smart Systems for Fashion Retail',
    'meta.descricao': 'Management, inventory and CRM system for fashion stores (retail and wholesale) with WhatsApp support organized by salesperson and AI that wins back customers and moves slow-moving stock.',
    'nav.planos': 'Plans',
    'nav.como': 'How it works',
    'nav.entrar': 'Sign in',
    'hero.titulo': 'Smart Systems for Fashion Retail',
    'hero.texto': 'Organize your team\'s online sales over WhatsApp: a portfolio per salesperson, grid-based inventory, and AI that wins back customers and moves slow stock. Your dashboard live in minutes, on your own address.',
    'hero.verPlanos': 'See plans',
    'hero.jaSouCliente': "I'm already a customer",
    'hero.nota': 'Unlimited stores and salespeople on every plan · 7-day trial',
    'faixa.1.titulo': '1. Choose your plan',
    'faixa.1.texto': 'Start, Pro or Elite — none of them limit stores or salespeople.',
    'faixa.2.titulo': '2. Create your address',
    'faixa.2.texto': 'yourstore.zaieze.com is ready right after payment.',
    'faixa.3.titulo': '3. Start selling',
    'faixa.3.texto': 'Add products, your team, and send WhatsApp campaigns.',
    'unidade.mes': 'month',
    'unidade.ano': 'year',
    'planos.titulo': 'Choose your plan',
    'planos.sub': 'Pay for features, not for size. Cancel anytime.',
    'planos.maisPopular': 'Most popular',
    'planos.assinar': 'Subscribe',
    'planos.equivaleMes': 'equivalent to',
    'planos.duvida': 'Have any questions about the plans?',
    'planos.faleConosco': 'Talk to us!',
    'footer.tagline': 'Smart Systems for Fashion Retail',
    'footer.quemSomos': 'About Us',
    'footer.lgpd': 'Data Protection',
    'footer.privacidade': 'Privacy Policy',
    'footer.pagamento': 'Secure payment via Mercado Pago',
    'feature.vendas': 'POS / Sales',
    'feature.produtos': 'Product catalog',
    'feature.estoque': 'Inventory control',
    'feature.clientes': 'Customer records',
    'feature.dashboard': 'Sales dashboard',
    'feature.forma_recebimento': 'Payment method',
    'feature.whatsapp': 'WhatsApp (campaigns, follow-ups, Chat Zaieze)',
    'feature.funil': 'Sales pipeline (Kanban)',
    'feature.crm_segmentacao': 'Smart portfolio (segmentation)',
    'feature.gamificacao': 'Commission, ranking and mural',
    'feature.estoque_inteligente': 'Smart inventory (slow-moving/stockouts)',
    'feature.multi_loja': 'Network operation (multiple stores selling from the brand\'s central stock)',
    'feature.radar': 'Opportunity Radar',
    'feature.atacado': 'Wholesale system',
    'feature.ia_avancada': 'Advanced AI',
    'feature.portal_cliente': 'Customer Portal',
  },
  es: {
    'meta.titulo': 'ZAIEZE — Sistemas Inteligentes para la Moda',
    'meta.descricao': 'Sistema de gestión, stock y CRM para tiendas de moda (minorista y mayorista) con atención por WhatsApp organizada por vendedora e IA que recupera clientes y mueve el stock parado.',
    'nav.planos': 'Planes',
    'nav.como': 'Cómo funciona',
    'nav.entrar': 'Ingresar',
    'hero.titulo': 'Sistemas Inteligentes para la Moda',
    'hero.texto': 'Organiza la venta online de tu equipo por WhatsApp: cartera por vendedora, stock en grilla e IA que recupera clientes y mueve lo que está parado. Tu panel en línea en minutos, en tu propio dominio.',
    'hero.verPlanos': 'Ver planes',
    'hero.jaSouCliente': 'Ya soy cliente',
    'hero.nota': 'Tiendas y vendedoras ilimitadas en todos los planes · 7 días de prueba',
    'faixa.1.titulo': '1. Elige tu plan',
    'faixa.1.texto': 'Start, Pro o Elite — ninguno limita tiendas ni vendedoras.',
    'faixa.2.titulo': '2. Crea tu dirección',
    'faixa.2.texto': 'tutienda.zaieze.com queda lista al momento del pago.',
    'faixa.3.titulo': '3. Empieza a vender',
    'faixa.3.texto': 'Registra productos, tu equipo y envía campañas por WhatsApp.',
    'unidade.mes': 'mes',
    'unidade.ano': 'año',
    'planos.titulo': 'Elige tu plan',
    'planos.sub': 'Paga por funcionalidad, no por tamaño. Cancela cuando quieras.',
    'planos.maisPopular': 'Más popular',
    'planos.assinar': 'Suscribirme',
    'planos.equivaleMes': 'equivale a',
    'planos.duvida': '¿Tienes dudas sobre los planes?',
    'planos.faleConosco': '¡Hablemos!',
    'footer.tagline': 'Sistemas Inteligentes para la Moda',
    'footer.quemSomos': 'Quiénes Somos',
    'footer.lgpd': 'Protección de Datos',
    'footer.privacidade': 'Política de Privacidad',
    'footer.pagamento': 'Pago seguro vía Mercado Pago',
    'feature.vendas': 'POS / Ventas',
    'feature.produtos': 'Catálogo de productos',
    'feature.estoque': 'Control de stock',
    'feature.clientes': 'Registro de clientes',
    'feature.dashboard': 'Panel de ventas',
    'feature.forma_recebimento': 'Forma de pago',
    'feature.whatsapp': 'WhatsApp (campañas, seguimientos, Chat Zaieze)',
    'feature.funil': 'Embudo de ventas (Kanban)',
    'feature.crm_segmentacao': 'Cartera inteligente (segmentación)',
    'feature.gamificacao': 'Comisión, ranking y mural',
    'feature.estoque_inteligente': 'Stock inteligente (estancado/quiebre)',
    'feature.multi_loja': 'Operación en red (varias tiendas vendiendo del stock central de la marca)',
    'feature.radar': 'Radar de Oportunidades',
    'feature.atacado': 'Sistema mayorista',
    'feature.ia_avancada': 'IA avanzada',
    'feature.portal_cliente': 'Portal del Cliente',
  },
}

interface CtxValor { idioma: Idioma; setIdioma: (i: Idioma) => void; t: (chave: string) => string }
const IdiomaCtx = createContext<CtxValor | null>(null)

function idiomaSalvo(): Idioma {
  const salvo = localStorage.getItem(CHAVE)
  return salvo === 'en' || salvo === 'es' ? salvo : 'pt'
}

export function IdiomaProvider({ children }: { children: ReactNode }) {
  const [idioma, setIdiomaState] = useState<Idioma>(idiomaSalvo)

  function setIdioma(i: Idioma) {
    localStorage.setItem(CHAVE, i)
    setIdiomaState(i)
  }

  function t(chave: string): string {
    return DICIONARIOS[idioma][chave] ?? DICIONARIOS.pt[chave] ?? chave
  }

  return <IdiomaCtx.Provider value={{ idioma, setIdioma, t }}>{children}</IdiomaCtx.Provider>
}

export function useIdioma(): CtxValor {
  const ctx = useContext(IdiomaCtx)
  if (!ctx) throw new Error('useIdioma precisa estar dentro de <IdiomaProvider>')
  return ctx
}

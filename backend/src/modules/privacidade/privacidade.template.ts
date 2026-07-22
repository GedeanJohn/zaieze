/**
 * Template da Política de Privacidade do ZAIEZE.
 *
 * Documento independente do Contrato de Licença/Prestação de Serviços (SaaS) e dos
 * Termos de Uso e Responsabilidade — cada um com aceite eletrônico próprio, versão
 * própria e reaceite/distrato próprios (ver contrato.template.ts e termos-uso.template.ts).
 *
 * ⚠️ Template padrão — revise com advogado antes do uso real. Ao alterar o texto de
 * forma relevante, incremente PRIVACIDADE_VERSAO e a data PRIVACIDADE_PUBLICADO_EM
 * (base do prazo de reaceite/distrato).
 *
 * Multilíngue (pt/en/es — en-gb cai no fallback de en): o texto é regido pela lei
 * brasileira (LGPD) em qualquer idioma; as versões en/es são traduções de cortesia.
 */
export const PRIVACIDADE_VERSAO = '1.0-2026-07'

/** Data em que a versão vigente entrou no ar — base do prazo de reaceite. */
export const PRIVACIDADE_PUBLICADO_EM = new Date('2026-07-21T00:00:00-03:00')

/** Janela (dias corridos) para aceitar/reaceitar antes do distrato. */
export const JANELA_REACEITE_DIAS = 30

/** Prazo final de aceite — a partir desta data o distrato é executado. */
export function prazoReaceite(): Date {
  const d = new Date(PRIVACIDADE_PUBLICADO_EM)
  d.setDate(d.getDate() + JANELA_REACEITE_DIAS)
  return d
}

export type PrivacidadeIdioma = 'pt' | 'en' | 'es'

function resolverIdioma(idioma?: string): PrivacidadeIdioma {
  if (idioma === 'en-gb') return 'en'
  if (idioma === 'en' || idioma === 'es') return idioma
  return 'pt'
}

export interface PrivacidadeInput {
  aceite?: { aceitoEm: Date; ip?: string | null; versao: string }
  idioma?: string
}

/** Uma seção do documento: paragrafo (string) ou lista com marcadores (string[]). */
export type ItemSecao = string | string[]

export interface SecaoDocumento {
  n: number
  titulo: string
  itens: ItemSecao[]
}

export interface PrivacidadeMontada {
  versao: string
  idioma: PrivacidadeIdioma
  titulo: string
  atualizadoEm: string
  secoes: SecaoDocumento[]
  aceite: { aceitoEm: string; ip: string | null; versao: string } | null
  historico: ItemHistorico[]
}

/** Um item do changelog exibido no banner "ver o que mudou" a cada nova versão. */
export interface ItemHistorico {
  versao: string
  publicadoEm: string
  mudancas: string[]
}

/**
 * Changelog do documento. A cada bump de PRIVACIDADE_VERSAO, adicione um novo item no
 * TOPO (mais recente primeiro) resumindo o que mudou — alimenta o banner de aviso e a
 * tela de leitura. O uso do sistema após a publicação de uma nova versão já registra o
 * aceite automaticamente (ver privacidade.service.ts); o changelog é o que dá
 * transparência a esse aceite implícito.
 */
const HISTORICO: Record<PrivacidadeIdioma, ItemHistorico[]> = {
  pt: [
    { versao: '1.0-2026-07', publicadoEm: '21/07/2026', mudancas: ['Publicação inicial da Política de Privacidade.'] },
  ],
  en: [
    { versao: '1.0-2026-07', publicadoEm: '07/21/2026', mudancas: ['Initial publication of the Privacy Policy.'] },
  ],
  es: [
    { versao: '1.0-2026-07', publicadoEm: '21/07/2026', mudancas: ['Publicación inicial de la Política de Privacidad.'] },
  ],
}

const TITULOS: Record<PrivacidadeIdioma, string> = {
  pt: 'POLÍTICA DE PRIVACIDADE – ZAIEZE',
  en: 'PRIVACY POLICY – ZAIEZE',
  es: 'POLÍTICA DE PRIVACIDAD – ZAIEZE',
}

const ATUALIZADO_EM: Record<PrivacidadeIdioma, string> = {
  pt: '21 de julho de 2026',
  en: 'July 21, 2026',
  es: '21 de julio de 2026',
}

const SECOES: Record<PrivacidadeIdioma, SecaoDocumento[]> = {
  pt: [
    {
      n: 1,
      titulo: 'Introdução',
      itens: [
        'A ZAIEZE respeita a privacidade de seus usuários e está comprometida com a proteção dos dados pessoais tratados em sua plataforma.',
        'Esta Política de Privacidade explica como coletamos, utilizamos, armazenamos, compartilhamos e protegemos os dados de usuários que utilizam o ecossistema ZAIEZE, incluindo:',
        [
          'Marketplace de Moda Premium', 'Plataforma para Lojistas', 'Plataforma para Assessores de Moda',
          'Sistema de Gestão Comercial', 'CRM', 'Aplicativos móveis', 'Website', 'APIs e Integrações',
          'WhatsApp Business', 'Instagram', 'Facebook', 'Inteligência Artificial da ZAIEZE', 'Provador Virtual',
          'Vendedora Virtual por IA', 'Ferramentas de Marketing, Catálogo e Atendimento',
        ],
        'Ao utilizar qualquer serviço da ZAIEZE, o usuário declara que leu e concorda com esta Política de Privacidade.',
      ],
    },
    {
      n: 2,
      titulo: 'Base Legal',
      itens: [
        'A ZAIEZE realiza o tratamento de dados em conformidade com:',
        [
          'Lei Geral de Proteção de Dados (Lei nº 13.709/2018 – LGPD)', 'Marco Civil da Internet',
          'Código de Defesa do Consumidor', 'Normas da Autoridade Nacional de Proteção de Dados (ANPD)',
          'Demais legislações aplicáveis',
        ],
      ],
    },
    {
      n: 3,
      titulo: 'Quem utiliza a ZAIEZE',
      itens: [
        'Esta política aplica-se a:',
        [
          'Consumidores', 'Clientes', 'Lojistas', 'Marcas', 'Fabricantes', 'Revendedores', 'Representantes',
          'Assessores de Moda', 'Vendedores', 'Influenciadores', 'Parceiros', 'Prestadores de Serviço',
          'Visitantes do site', 'Usuários dos aplicativos',
        ],
      ],
    },
    {
      n: 4,
      titulo: 'Dados que coletamos',
      itens: [
        'Podemos coletar:',
        'Dados de cadastro:',
        ['Nome', 'CPF ou CNPJ', 'E-mail', 'Telefone', 'WhatsApp', 'Endereço', 'Data de nascimento', 'Nome da empresa', 'Cargo'],
        'Dados de navegação:',
        ['Endereço IP', 'Tipo de dispositivo', 'Navegador', 'Sistema Operacional', 'Cookies', 'Geolocalização (quando autorizada)', 'Histórico de navegação', 'Horário de acesso'],
        'Dados comerciais:',
        ['Produtos anunciados', 'Fotos', 'Vídeos', 'Catálogos', 'Histórico de compras', 'Histórico de vendas', 'Pedidos', 'Pagamentos', 'Comissões', 'Avaliações'],
        'Dados de comunicação:',
        ['Conversas pelo Chat', 'WhatsApp', 'Instagram', 'Facebook Messenger', 'E-mails', 'Solicitações de suporte'],
        'Dados gerados pela Inteligência Artificial: quando o usuário utiliza recursos de IA da ZAIEZE, poderão ser processados:',
        ['Perguntas enviadas', 'Respostas geradas', 'Histórico de atendimento', 'Preferências do cliente', 'Informações utilizadas para personalização da experiência'],
      ],
    },
    {
      n: 5,
      titulo: 'Finalidade do tratamento',
      itens: [
        'Os dados poderão ser utilizados para:',
        [
          'Criar contas', 'Identificar usuários', 'Processar pedidos', 'Gerenciar pagamentos', 'Emitir documentos fiscais',
          'Personalizar recomendações', 'Melhorar o Marketplace', 'Treinar funcionalidades da plataforma (sem identificação pessoal quando possível)',
          'Atendimento ao cliente', 'Prevenção a fraudes', 'Segurança da plataforma', 'Cumprimento de obrigações legais',
          'Envio de comunicações autorizadas', 'Campanhas de marketing mediante consentimento ou outra base legal aplicável',
        ],
      ],
    },
    {
      n: 6,
      titulo: 'Inteligência Artificial',
      itens: [
        'A ZAIEZE utiliza Inteligência Artificial para:',
        [
          'Atendimento automatizado', 'Vendedora Virtual', 'Assistente de Moda', 'Recomendações de produtos',
          'Provador Virtual', 'Sugestões de looks', 'Automação comercial', 'CRM Inteligente', 'Recuperação de clientes',
          'Análise de comportamento',
        ],
        'A IA não toma decisões exclusivamente automatizadas que produzam efeitos jurídicos relevantes sobre os usuários sem possibilidade de revisão humana.',
      ],
    },
    {
      n: 7,
      titulo: 'Marketplace',
      itens: [
        'No Marketplace da ZAIEZE:',
        [
          'lojistas são responsáveis pelas informações de seus produtos',
          'consumidores compram diretamente dos vendedores participantes',
          'a ZAIEZE atua como plataforma tecnológica e pode intermediar pagamentos, comunicações e suporte, conforme o serviço contratado',
          'avaliações devem ser verdadeiras e respeitosas',
        ],
      ],
    },
    {
      n: 8,
      titulo: 'Compartilhamento de dados',
      itens: [
        'Os dados poderão ser compartilhados com:',
        [
          'Processadores de pagamento', 'Empresas de logística', 'Operadoras de pagamento', 'Serviços antifraude',
          'Empresas de hospedagem em nuvem', 'Ferramentas de CRM', 'Serviços de envio de e-mail', 'Parceiros de autenticação',
          'Plataformas da Meta (Facebook, Instagram e WhatsApp), quando integradas pelo usuário',
          'Autoridades públicas, quando exigido por lei',
        ],
        'A ZAIEZE não comercializa dados pessoais.',
      ],
    },
    {
      n: 9,
      titulo: 'Cookies',
      itens: [
        'Utilizamos cookies para:',
        ['autenticação', 'segurança', 'desempenho', 'estatísticas', 'preferências', 'personalização', 'marketing'],
        'O usuário poderá gerenciar cookies nas configurações do navegador, observadas as limitações funcionais decorrentes.',
      ],
    },
    {
      n: 10,
      titulo: 'Segurança',
      itens: [
        'Adotamos medidas técnicas e administrativas compatíveis com as melhores práticas de mercado, incluindo:',
        ['criptografia', 'conexões HTTPS', 'autenticação segura', 'controle de acesso', 'monitoramento', 'backups', 'registros de auditoria', 'proteção contra ataques', 'testes periódicos de segurança'],
        'Embora adotemos medidas robustas, nenhum sistema é totalmente imune a riscos.',
      ],
    },
    {
      n: 11,
      titulo: 'Direitos do titular (LGPD)',
      itens: [
        'O usuário poderá solicitar:',
        [
          'confirmação do tratamento', 'acesso aos dados', 'correção de dados',
          'anonimização, bloqueio ou eliminação quando cabível', 'portabilidade', 'revogação do consentimento',
          'informações sobre compartilhamentos', 'oposição ao tratamento, quando aplicável',
        ],
        'As solicitações serão respondidas nos prazos legais.',
      ],
    },
    {
      n: 12,
      titulo: 'Retenção',
      itens: [
        'Os dados serão mantidos:',
        ['enquanto houver relação contratual', 'enquanto necessários para cumprir obrigações legais', 'para exercício regular de direitos', 'conforme prazos previstos em lei'],
        'Após esse período, serão eliminados ou anonimizados quando possível.',
      ],
    },
    {
      n: 13,
      titulo: 'Menores de idade',
      itens: [
        'Os serviços da ZAIEZE destinam-se a pessoas com capacidade civil ou devidamente representadas por seus responsáveis legais, quando permitido por lei.',
      ],
    },
    {
      n: 14,
      titulo: 'Responsabilidades dos usuários',
      itens: [
        'Os usuários comprometem-se a:',
        ['fornecer informações verdadeiras', 'proteger suas credenciais de acesso', 'respeitar direitos de terceiros', 'não utilizar a plataforma para atividades ilícitas, fraudulentas ou que violem direitos de propriedade intelectual'],
      ],
    },
    {
      n: 15,
      titulo: 'Transferência internacional de dados',
      itens: [
        'Quando necessário, a ZAIEZE poderá utilizar provedores de tecnologia localizados em outros países, assegurando mecanismos adequados de proteção de dados conforme a LGPD.',
      ],
    },
    {
      n: 16,
      titulo: 'Alterações desta Política',
      itens: [
        'Esta Política poderá ser atualizada periodicamente. Alterações relevantes poderão ser comunicadas por meio da plataforma ou por outros canais apropriados.',
      ],
    },
    {
      n: 17,
      titulo: 'Encarregado pelo Tratamento de Dados (DPO)',
      itens: [
        'A ZAIEZE disponibilizará canal específico para atendimento de solicitações relacionadas à proteção de dados pessoais, em conformidade com a LGPD.',
      ],
    },
    {
      n: 18,
      titulo: 'Contato',
      itens: [
        'Para dúvidas, solicitações ou exercício de direitos relacionados à privacidade e proteção de dados, os usuários poderão utilizar os canais oficiais de atendimento disponibilizados pela ZAIEZE.',
      ],
    },
    {
      n: 19,
      titulo: 'Disposições Finais',
      itens: [
        'Ao utilizar os serviços da ZAIEZE, o usuário declara estar ciente desta Política de Privacidade e concorda com o tratamento de seus dados pessoais nos termos aqui descritos.',
        'A ZAIEZE compromete-se a revisar continuamente suas práticas de privacidade para manter conformidade com a LGPD, normas da ANPD e boas práticas internacionais de proteção de dados, promovendo um ambiente digital seguro, transparente e confiável para consumidores, lojistas, assessores de moda e demais parceiros.',
      ],
    },
  ],
  en: [
    {
      n: 1,
      titulo: 'Introduction',
      itens: [
        'ZAIEZE respects the privacy of its users and is committed to protecting the personal data processed on its platform.',
        'This Privacy Policy explains how we collect, use, store, share, and protect the data of users of the ZAIEZE ecosystem, including:',
        [
          'Premium Fashion Marketplace', 'Platform for Store Owners', 'Platform for Fashion Advisors',
          'Business Management System', 'CRM', 'Mobile applications', 'Website', 'APIs and Integrations',
          'WhatsApp Business', 'Instagram', 'Facebook', "ZAIEZE's Artificial Intelligence", 'Virtual Fitting Room',
          'AI Virtual Salesperson', 'Marketing, Catalog, and Customer Service tools',
        ],
        'By using any ZAIEZE service, the user represents that they have read and agree to this Privacy Policy.',
      ],
    },
    {
      n: 2,
      titulo: 'Legal Basis',
      itens: [
        'ZAIEZE processes data in accordance with:',
        [
          'The Brazilian General Data Protection Law (Federal Law No. 13,709/2018 — LGPD)', 'The Brazilian Internet Civil Rights Framework (Marco Civil da Internet)',
          "Brazil's Consumer Protection Code", "The rules of Brazil's National Data Protection Authority (ANPD)",
          'Other applicable legislation',
        ],
      ],
    },
    {
      n: 3,
      titulo: 'Who uses ZAIEZE',
      itens: [
        'This policy applies to:',
        [
          'Consumers', 'Customers', 'Store owners', 'Brands', 'Manufacturers', 'Resellers', 'Representatives',
          'Fashion Advisors', 'Salespeople', 'Influencers', 'Partners', 'Service providers',
          'Website visitors', 'App users',
        ],
      ],
    },
    {
      n: 4,
      titulo: 'Data we collect',
      itens: [
        'We may collect:',
        'Registration data:',
        ['Name', 'Individual or corporate taxpayer ID (CPF/CNPJ)', 'E-mail', 'Phone number', 'WhatsApp', 'Address', 'Date of birth', 'Company name', 'Job title'],
        'Browsing data:',
        ['IP address', 'Device type', 'Browser', 'Operating system', 'Cookies', 'Geolocation (when authorized)', 'Browsing history', 'Access time'],
        'Commercial data:',
        ['Advertised products', 'Photos', 'Videos', 'Catalogs', 'Purchase history', 'Sales history', 'Orders', 'Payments', 'Commissions', 'Reviews'],
        'Communication data:',
        ['Chat conversations', 'WhatsApp', 'Instagram', 'Facebook Messenger', 'E-mails', 'Support requests'],
        "Data generated by Artificial Intelligence: when the user uses ZAIEZE's AI features, the following may be processed:",
        ['Questions submitted', 'Answers generated', 'Service history', 'Customer preferences', 'Information used to personalize the experience'],
      ],
    },
    {
      n: 5,
      titulo: 'Purpose of processing',
      itens: [
        'Data may be used to:',
        [
          'Create accounts', 'Identify users', 'Process orders', 'Manage payments', 'Issue tax/fiscal documents',
          'Personalize recommendations', 'Improve the Marketplace', 'Train platform features (without personal identification whenever possible)',
          'Provide customer service', 'Prevent fraud', 'Ensure platform security', 'Comply with legal obligations',
          'Send authorized communications', 'Run marketing campaigns based on consent or another applicable legal basis',
        ],
      ],
    },
    {
      n: 6,
      titulo: 'Artificial Intelligence',
      itens: [
        'ZAIEZE uses Artificial Intelligence for:',
        [
          'Automated customer service', 'Virtual Salesperson', 'Fashion Assistant', 'Product recommendations',
          'Virtual Fitting Room', 'Outfit suggestions', 'Sales automation', 'Smart CRM', 'Customer win-back',
          'Behavior analysis',
        ],
        'The AI does not make exclusively automated decisions that produce legally relevant effects on users without the possibility of human review.',
      ],
    },
    {
      n: 7,
      titulo: 'Marketplace',
      itens: [
        'On the ZAIEZE Marketplace:',
        [
          'store owners are responsible for their product information',
          'consumers buy directly from participating sellers',
          'ZAIEZE acts as a technology platform and may intermediate payments, communications, and support, depending on the service contracted',
          'reviews must be truthful and respectful',
        ],
      ],
    },
    {
      n: 8,
      titulo: 'Data sharing',
      itens: [
        'Data may be shared with:',
        [
          'Payment processors', 'Logistics companies', 'Payment operators', 'Anti-fraud services',
          'Cloud hosting providers', 'CRM tools', 'E-mail delivery services', 'Authentication partners',
          "Meta platforms (Facebook, Instagram, and WhatsApp), when integrated by the user",
          'Public authorities, when required by law',
        ],
        'ZAIEZE does not sell personal data.',
      ],
    },
    {
      n: 9,
      titulo: 'Cookies',
      itens: [
        'We use cookies for:',
        ['authentication', 'security', 'performance', 'analytics', 'preferences', 'personalization', 'marketing'],
        "The user may manage cookies in their browser settings, subject to the resulting functional limitations.",
      ],
    },
    {
      n: 10,
      titulo: 'Security',
      itens: [
        'We adopt technical and administrative measures consistent with market best practices, including:',
        ['encryption', 'HTTPS connections', 'secure authentication', 'access control', 'monitoring', 'backups', 'audit logs', 'attack protection', 'periodic security testing'],
        'While we adopt robust measures, no system is entirely immune to risk.',
      ],
    },
    {
      n: 11,
      titulo: 'Data subject rights (LGPD)',
      itens: [
        'The user may request:',
        [
          'confirmation of processing', 'access to their data', 'correction of data',
          'anonymization, blocking, or deletion where applicable', 'portability', 'withdrawal of consent',
          'information about data sharing', 'objection to processing, where applicable',
        ],
        'Requests will be answered within the legal deadlines.',
      ],
    },
    {
      n: 12,
      titulo: 'Retention',
      itens: [
        'Data will be kept:',
        ['for as long as the contractual relationship lasts', 'for as long as necessary to comply with legal obligations', 'for the regular exercise of rights', 'in accordance with legally established periods'],
        'After that period, data will be deleted or anonymized whenever possible.',
      ],
    },
    {
      n: 13,
      titulo: 'Minors',
      itens: [
        "ZAIEZE's services are intended for persons with legal capacity, or duly represented by their legal guardians, where permitted by law.",
      ],
    },
    {
      n: 14,
      titulo: 'User responsibilities',
      itens: [
        'Users undertake to:',
        ['provide truthful information', 'protect their access credentials', 'respect the rights of third parties', 'not use the platform for unlawful or fraudulent activities, or activities that violate intellectual property rights'],
      ],
    },
    {
      n: 15,
      titulo: 'International data transfer',
      itens: [
        'When necessary, ZAIEZE may use technology providers located in other countries, ensuring adequate data protection mechanisms in accordance with the LGPD.',
      ],
    },
    {
      n: 16,
      titulo: 'Changes to this Policy',
      itens: [
        'This Policy may be updated periodically. Material changes may be communicated through the platform or other appropriate channels.',
      ],
    },
    {
      n: 17,
      titulo: 'Data Protection Officer (DPO)',
      itens: [
        'ZAIEZE will make available a specific channel for handling requests related to the protection of personal data, in accordance with the LGPD.',
      ],
    },
    {
      n: 18,
      titulo: 'Contact',
      itens: [
        'For questions, requests, or the exercise of rights related to privacy and data protection, users may use the official support channels made available by ZAIEZE.',
      ],
    },
    {
      n: 19,
      titulo: 'Final Provisions',
      itens: [
        'By using ZAIEZE\'s services, the user represents that they are aware of this Privacy Policy and agree to the processing of their personal data under the terms described herein.',
        'ZAIEZE undertakes to continuously review its privacy practices to remain in compliance with the LGPD, ANPD rules, and international data protection best practices, promoting a secure, transparent, and reliable digital environment for consumers, store owners, fashion advisors, and other partners. ' +
          'This Policy is governed by the laws of the Federative Republic of Brazil; this English version is provided for the user\'s convenience only, and in the event of any conflict or discrepancy, the original Portuguese-language version shall prevail.',
      ],
    },
  ],
  es: [
    {
      n: 1,
      titulo: 'Introducción',
      itens: [
        'ZAIEZE respeta la privacidad de sus usuarios y está comprometida con la protección de los datos personales tratados en su plataforma.',
        'Esta Política de Privacidad explica cómo recopilamos, utilizamos, almacenamos, compartimos y protegemos los datos de los usuarios que utilizan el ecosistema ZAIEZE, incluyendo:',
        [
          'Marketplace de Moda Premium', 'Plataforma para Comerciantes', 'Plataforma para Asesoras de Moda',
          'Sistema de Gestión Comercial', 'CRM', 'Aplicaciones móviles', 'Sitio web', 'APIs e Integraciones',
          'WhatsApp Business', 'Instagram', 'Facebook', 'Inteligencia Artificial de ZAIEZE', 'Probador Virtual',
          'Vendedora Virtual por IA', 'Herramientas de Marketing, Catálogo y Atención',
        ],
        'Al utilizar cualquier servicio de ZAIEZE, el usuario declara que ha leído y acepta esta Política de Privacidad.',
      ],
    },
    {
      n: 2,
      titulo: 'Base Legal',
      itens: [
        'ZAIEZE realiza el tratamiento de datos de conformidad con:',
        [
          'La Ley General de Protección de Datos de Brasil (Ley nº 13.709/2018 — LGPD)', 'El Marco Civil de Internet de Brasil',
          'El Código de Defensa del Consumidor de Brasil', 'Las normas de la Autoridad Nacional de Protección de Datos de Brasil (ANPD)',
          'Demás legislación aplicable',
        ],
      ],
    },
    {
      n: 3,
      titulo: 'Quién utiliza ZAIEZE',
      itens: [
        'Esta política se aplica a:',
        [
          'Consumidores', 'Clientes', 'Comerciantes', 'Marcas', 'Fabricantes', 'Revendedores', 'Representantes',
          'Asesoras de Moda', 'Vendedoras', 'Influencers', 'Socios', 'Prestadores de servicio',
          'Visitantes del sitio', 'Usuarios de las aplicaciones',
        ],
      ],
    },
    {
      n: 4,
      titulo: 'Datos que recopilamos',
      itens: [
        'Podemos recopilar:',
        'Datos de registro:',
        ['Nombre', 'CPF o CNPJ (identificación fiscal brasileña)', 'Correo electrónico', 'Teléfono', 'WhatsApp', 'Dirección', 'Fecha de nacimiento', 'Nombre de la empresa', 'Cargo'],
        'Datos de navegación:',
        ['Dirección IP', 'Tipo de dispositivo', 'Navegador', 'Sistema operativo', 'Cookies', 'Geolocalización (cuando esté autorizada)', 'Historial de navegación', 'Horario de acceso'],
        'Datos comerciales:',
        ['Productos anunciados', 'Fotos', 'Videos', 'Catálogos', 'Historial de compras', 'Historial de ventas', 'Pedidos', 'Pagos', 'Comisiones', 'Evaluaciones'],
        'Datos de comunicación:',
        ['Conversaciones por el Chat', 'WhatsApp', 'Instagram', 'Facebook Messenger', 'Correos electrónicos', 'Solicitudes de soporte'],
        'Datos generados por la Inteligencia Artificial: cuando el usuario utiliza funciones de IA de ZAIEZE, podrán procesarse:',
        ['Preguntas enviadas', 'Respuestas generadas', 'Historial de atención', 'Preferencias del cliente', 'Información utilizada para personalizar la experiencia'],
      ],
    },
    {
      n: 5,
      titulo: 'Finalidad del tratamiento',
      itens: [
        'Los datos podrán utilizarse para:',
        [
          'Crear cuentas', 'Identificar usuarios', 'Procesar pedidos', 'Gestionar pagos', 'Emitir documentos fiscales',
          'Personalizar recomendaciones', 'Mejorar el Marketplace', 'Entrenar funcionalidades de la plataforma (sin identificación personal cuando sea posible)',
          'Atención al cliente', 'Prevención de fraudes', 'Seguridad de la plataforma', 'Cumplimiento de obligaciones legales',
          'Envío de comunicaciones autorizadas', 'Campañas de marketing mediante consentimiento u otra base legal aplicable',
        ],
      ],
    },
    {
      n: 6,
      titulo: 'Inteligencia Artificial',
      itens: [
        'ZAIEZE utiliza Inteligencia Artificial para:',
        [
          'Atención automatizada', 'Vendedora Virtual', 'Asistente de Moda', 'Recomendaciones de productos',
          'Probador Virtual', 'Sugerencias de looks', 'Automatización comercial', 'CRM Inteligente', 'Recuperación de clientes',
          'Análisis de comportamiento',
        ],
        'La IA no toma decisiones exclusivamente automatizadas que produzcan efectos jurídicos relevantes sobre los usuarios sin posibilidad de revisión humana.',
      ],
    },
    {
      n: 7,
      titulo: 'Marketplace',
      itens: [
        'En el Marketplace de ZAIEZE:',
        [
          'los comerciantes son responsables de la información de sus productos',
          'los consumidores compran directamente a las vendedoras participantes',
          'ZAIEZE actúa como plataforma tecnológica y puede intermediar pagos, comunicaciones y soporte, según el servicio contratado',
          'las evaluaciones deben ser veraces y respetuosas',
        ],
      ],
    },
    {
      n: 8,
      titulo: 'Compartición de datos',
      itens: [
        'Los datos podrán compartirse con:',
        [
          'Procesadores de pago', 'Empresas de logística', 'Operadoras de pago', 'Servicios antifraude',
          'Empresas de alojamiento en la nube', 'Herramientas de CRM', 'Servicios de envío de correo electrónico', 'Socios de autenticación',
          'Plataformas de Meta (Facebook, Instagram y WhatsApp), cuando sean integradas por el usuario',
          'Autoridades públicas, cuando lo exija la ley',
        ],
        'ZAIEZE no comercializa datos personales.',
      ],
    },
    {
      n: 9,
      titulo: 'Cookies',
      itens: [
        'Utilizamos cookies para:',
        ['autenticación', 'seguridad', 'rendimiento', 'estadísticas', 'preferencias', 'personalización', 'marketing'],
        'El usuario podrá gestionar las cookies en la configuración de su navegador, con las limitaciones funcionales que ello conlleve.',
      ],
    },
    {
      n: 10,
      titulo: 'Seguridad',
      itens: [
        'Adoptamos medidas técnicas y administrativas compatibles con las mejores prácticas del mercado, incluyendo:',
        ['cifrado', 'conexiones HTTPS', 'autenticación segura', 'control de acceso', 'monitoreo', 'copias de seguridad', 'registros de auditoría', 'protección contra ataques', 'pruebas periódicas de seguridad'],
        'Aunque adoptamos medidas robustas, ningún sistema está totalmente exento de riesgos.',
      ],
    },
    {
      n: 11,
      titulo: 'Derechos del titular (LGPD)',
      itens: [
        'El usuario podrá solicitar:',
        [
          'confirmación del tratamiento', 'acceso a los datos', 'corrección de datos',
          'anonimización, bloqueo o eliminación cuando corresponda', 'portabilidad', 'revocación del consentimiento',
          'información sobre las comparticiones', 'oposición al tratamiento, cuando sea aplicable',
        ],
        'Las solicitudes serán respondidas dentro de los plazos legales.',
      ],
    },
    {
      n: 12,
      titulo: 'Retención',
      itens: [
        'Los datos se conservarán:',
        ['mientras exista relación contractual', 'mientras sean necesarios para cumplir obligaciones legales', 'para el ejercicio regular de derechos', 'conforme a los plazos previstos por la ley'],
        'Transcurrido ese período, serán eliminados o anonimizados cuando sea posible.',
      ],
    },
    {
      n: 13,
      titulo: 'Menores de edad',
      itens: [
        'Los servicios de ZAIEZE están destinados a personas con capacidad civil o debidamente representadas por sus responsables legales, cuando la ley lo permita.',
      ],
    },
    {
      n: 14,
      titulo: 'Responsabilidades de los usuarios',
      itens: [
        'Los usuarios se comprometen a:',
        ['proporcionar información veraz', 'proteger sus credenciales de acceso', 'respetar los derechos de terceros', 'no utilizar la plataforma para actividades ilícitas, fraudulentas o que violen derechos de propiedad intelectual'],
      ],
    },
    {
      n: 15,
      titulo: 'Transferencia internacional de datos',
      itens: [
        'Cuando sea necesario, ZAIEZE podrá utilizar proveedores de tecnología ubicados en otros países, asegurando mecanismos adecuados de protección de datos conforme a la LGPD.',
      ],
    },
    {
      n: 16,
      titulo: 'Cambios en esta Política',
      itens: [
        'Esta Política podrá actualizarse periódicamente. Los cambios relevantes podrán comunicarse a través de la plataforma o de otros canales apropiados.',
      ],
    },
    {
      n: 17,
      titulo: 'Encargado de Protección de Datos (DPO)',
      itens: [
        'ZAIEZE pondrá a disposición un canal específico para atender solicitudes relacionadas con la protección de datos personales, conforme a la LGPD.',
      ],
    },
    {
      n: 18,
      titulo: 'Contacto',
      itens: [
        'Para dudas, solicitudes o el ejercicio de derechos relacionados con la privacidad y la protección de datos, los usuarios podrán utilizar los canales oficiales de atención puestos a disposición por ZAIEZE.',
      ],
    },
    {
      n: 19,
      titulo: 'Disposiciones Finales',
      itens: [
        'Al utilizar los servicios de ZAIEZE, el usuario declara estar al tanto de esta Política de Privacidad y acepta el tratamiento de sus datos personales en los términos aquí descritos.',
        'ZAIEZE se compromete a revisar continuamente sus prácticas de privacidad para mantener el cumplimiento de la LGPD, las normas de la ANPD y las buenas prácticas internacionales de protección de datos, promoviendo un entorno digital seguro, transparente y confiable para consumidores, comerciantes, asesoras de moda y demás socios. ' +
          'Esta Política se rige por las leyes de la República Federativa de Brasil; esta versión en español se ofrece únicamente como cortesía para el usuario, y en caso de cualquier conflicto o discrepancia, prevalecerá la versión original en portugués.',
      ],
    },
  ],
}

export function montarPrivacidade(input: PrivacidadeInput = {}): PrivacidadeMontada {
  const idioma = resolverIdioma(input.idioma)
  const aceite = input.aceite
    ? { aceitoEm: input.aceite.aceitoEm.toISOString(), ip: input.aceite.ip ?? null, versao: input.aceite.versao }
    : null

  return {
    versao: PRIVACIDADE_VERSAO,
    idioma,
    titulo: TITULOS[idioma],
    atualizadoEm: ATUALIZADO_EM[idioma],
    secoes: SECOES[idioma],
    aceite,
    historico: HISTORICO[idioma],
  }
}

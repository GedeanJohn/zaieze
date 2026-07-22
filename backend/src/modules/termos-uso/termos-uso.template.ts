/**
 * Template dos Termos de Uso e Responsabilidade do ZAIEZE.
 *
 * Documento independente do Contrato de Licença/Prestação de Serviços (SaaS) e da
 * Política de Privacidade — cada um com aceite eletrônico próprio, versão própria e
 * reaceite/distrato próprios (ver contrato.template.ts e privacidade.template.ts).
 *
 * ⚠️ Template padrão — revise com advogado antes do uso real. Ao alterar o texto de
 * forma relevante, incremente TERMOS_USO_VERSAO e a data TERMOS_USO_PUBLICADO_EM (base
 * do prazo de reaceite/distrato), e adicione um item no topo do HISTORICO abaixo.
 *
 * Multilíngue (pt/en/es — en-gb cai no fallback de en): o texto é regido pela lei
 * brasileira em qualquer idioma; as versões en/es são traduções de cortesia.
 */
export const TERMOS_USO_VERSAO = '1.0-2026-07'

/** Data em que a versão vigente entrou no ar — base do prazo de reaceite. */
export const TERMOS_USO_PUBLICADO_EM = new Date('2026-07-21T00:00:00-03:00')

/** Janela (dias corridos) para aceitar/reaceitar antes do distrato. */
export const JANELA_REACEITE_DIAS = 30

/** Prazo final de aceite — a partir desta data o distrato é executado. */
export function prazoReaceite(): Date {
  const d = new Date(TERMOS_USO_PUBLICADO_EM)
  d.setDate(d.getDate() + JANELA_REACEITE_DIAS)
  return d
}

export type TermosUsoIdioma = 'pt' | 'en' | 'es'

function resolverIdioma(idioma?: string): TermosUsoIdioma {
  if (idioma === 'en-gb') return 'en'
  if (idioma === 'en' || idioma === 'es') return idioma
  return 'pt'
}

export interface TermosUsoInput {
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

export interface ItemHistorico {
  versao: string
  publicadoEm: string
  mudancas: string[]
}

export interface TermosUsoMontado {
  versao: string
  idioma: TermosUsoIdioma
  titulo: string
  atualizadoEm: string
  secoes: SecaoDocumento[]
  aceite: { aceitoEm: string; ip: string | null; versao: string } | null
  historico: ItemHistorico[]
}

const TITULOS: Record<TermosUsoIdioma, string> = {
  pt: 'TERMOS DE USO E RESPONSABILIDADE – ZAIEZE',
  en: 'TERMS OF USE AND RESPONSIBILITY – ZAIEZE',
  es: 'TÉRMINOS DE USO Y RESPONSABILIDAD – ZAIEZE',
}

const ATUALIZADO_EM: Record<TermosUsoIdioma, string> = {
  pt: '21 de julho de 2026',
  en: 'July 21, 2026',
  es: '21 de julio de 2026',
}

const HISTORICO: Record<TermosUsoIdioma, ItemHistorico[]> = {
  pt: [
    { versao: '1.0-2026-07', publicadoEm: '21/07/2026', mudancas: ['Publicação inicial dos Termos de Uso e Responsabilidade.'] },
  ],
  en: [
    { versao: '1.0-2026-07', publicadoEm: '07/21/2026', mudancas: ['Initial publication of the Terms of Use and Responsibility.'] },
  ],
  es: [
    { versao: '1.0-2026-07', publicadoEm: '21/07/2026', mudancas: ['Publicación inicial de los Términos de Uso y Responsabilidad.'] },
  ],
}

const SECOES: Record<TermosUsoIdioma, SecaoDocumento[]> = {
  pt: [
    {
      n: 1,
      titulo: 'Aceitação dos Termos',
      itens: [
        'Bem-vindo à ZAIEZE.',
        'Ao criar uma conta, acessar ou utilizar qualquer serviço da plataforma, o usuário declara que leu, compreendeu e concorda integralmente com estes Termos de Uso, com a Política de Privacidade e com as demais políticas da ZAIEZE.',
        'Caso não concorde com estes termos, o usuário não deverá utilizar a plataforma.',
      ],
    },
    {
      n: 2,
      titulo: 'Sobre a ZAIEZE',
      itens: [
        'A ZAIEZE é uma plataforma tecnológica que reúne soluções para o setor da moda, incluindo:',
        [
          'Marketplace de Moda Premium', 'Plataforma para Lojistas', 'Plataforma para Assessores de Moda',
          'CRM Inteligente', 'Catálogo Digital', 'Provador Virtual', 'Vendedora Virtual por Inteligência Artificial',
          'Gestão Comercial', 'Integrações com WhatsApp, Instagram, Facebook e demais serviços autorizados',
          'Ferramentas de automação de vendas, atendimento e marketing',
        ],
        'A ZAIEZE atua como provedora de tecnologia e intermediação digital, não sendo fabricante dos produtos anunciados pelos vendedores, salvo quando expressamente informado.',
      ],
    },
    {
      n: 3,
      titulo: 'Cadastro',
      itens: [
        'O usuário declara que:',
        ['fornecerá informações verdadeiras, completas e atualizadas', 'manterá seus dados sempre corretos', 'possui capacidade legal para contratar', 'é responsável pela segurança de sua senha e credenciais de acesso'],
        'Cada conta é pessoal e intransferível.',
      ],
    },
    {
      n: 4,
      titulo: 'Responsabilidades do Usuário',
      itens: [
        'Ao utilizar a ZAIEZE, o usuário compromete-se a:',
        [
          'agir de boa-fé', 'respeitar a legislação brasileira', 'respeitar direitos de terceiros',
          'não utilizar a plataforma para práticas ilícitas', 'não enviar vírus, códigos maliciosos ou conteúdos que comprometam a segurança da plataforma',
          'não tentar acessar áreas restritas sem autorização', 'não copiar, reproduzir ou comercializar tecnologias da ZAIEZE sem autorização',
        ],
      ],
    },
    {
      n: 5,
      titulo: 'Marketplace',
      itens: [
        'Os vendedores são exclusivamente responsáveis por:',
        ['descrição dos produtos', 'qualidade', 'autenticidade', 'estoque', 'preços', 'entrega', 'emissão de documentos fiscais', 'garantias legais', 'atendimento ao consumidor'],
        'A ZAIEZE disponibiliza a infraestrutura tecnológica para aproximar compradores e vendedores, podendo oferecer ferramentas de intermediação, pagamento, comunicação e suporte.',
      ],
    },
    {
      n: 6,
      titulo: 'Responsabilidade dos Compradores',
      itens: [
        'Os compradores comprometem-se a:',
        ['fornecer informações corretas para entrega', 'realizar pagamentos de forma legítima', 'utilizar os produtos conforme sua finalidade', 'respeitar as políticas de compra, troca e devolução'],
      ],
    },
    {
      n: 7,
      titulo: 'Conteúdo Publicado',
      itens: [
        'O usuário permanece titular do conteúdo publicado na plataforma.',
        'Ao publicar fotos, vídeos, descrições, marcas autorizadas ou outros materiais, concede à ZAIEZE licença não exclusiva para utilizar esse conteúdo com a finalidade de operar, divulgar e promover os serviços da plataforma.',
        'É proibida a publicação de conteúdo:',
        ['falso', 'ofensivo', 'discriminatório', 'ilegal', 'que viole direitos autorais', 'que utilize marcas sem autorização', 'que infrinja direitos de terceiros'],
      ],
    },
    {
      n: 8,
      titulo: 'Inteligência Artificial',
      itens: [
        'A ZAIEZE disponibiliza recursos baseados em Inteligência Artificial para otimizar vendas, atendimento e experiência dos usuários.',
        'As respostas e recomendações geradas pela IA possuem caráter auxiliar e não substituem análise humana.',
        'O usuário é responsável por revisar informações importantes antes de utilizá-las para decisões comerciais.',
      ],
    },
    {
      n: 9,
      titulo: 'Integrações',
      itens: [
        'A plataforma poderá integrar-se a serviços de terceiros, incluindo:',
        ['WhatsApp Business', 'Instagram', 'Facebook', 'Gateways de pagamento', 'Sistemas ERP', 'Plataformas de logística', 'Ferramentas de marketing'],
        'Cada integração também estará sujeita aos termos e políticas dos respectivos fornecedores.',
      ],
    },
    {
      n: 10,
      titulo: 'Pagamentos',
      itens: [
        'Quando houver contratação de serviços pagos:',
        ['os valores serão informados previamente', 'assinaturas poderão ser mensais ou anuais', 'o cancelamento seguirá as condições do plano contratado', 'inadimplência poderá ocasionar suspensão ou encerramento dos serviços'],
      ],
    },
    {
      n: 11,
      titulo: 'Propriedade Intelectual',
      itens: [
        'Todo o software, código-fonte, identidade visual, logotipos, banco de dados, funcionalidades, interfaces, inteligência artificial, design, documentação e demais ativos tecnológicos da ZAIEZE são protegidos pela legislação de propriedade intelectual.',
        'É proibida sua reprodução, engenharia reversa, distribuição ou exploração comercial sem autorização expressa.',
      ],
    },
    {
      n: 12,
      titulo: 'Limitação de Responsabilidade',
      itens: [
        'A ZAIEZE não responde por:',
        [
          'informações incorretas fornecidas por usuários', 'negociações realizadas diretamente entre compradores e vendedores',
          'indisponibilidades causadas por terceiros', 'falhas de internet', 'serviços de terceiros integrados',
          'uso inadequado da plataforma', 'perdas decorrentes de descumprimento destes Termos pelo usuário',
          'indisponibilidades causadas por eventos climáticos',
        ],
      ],
    },
    {
      n: 13,
      titulo: 'Suspensão e Encerramento de Contas',
      itens: [
        'A ZAIEZE poderá suspender ou encerrar contas, temporária ou definitivamente, quando houver:',
        ['fraude', 'tentativa de invasão', 'uso indevido da plataforma', 'violação destes Termos', 'prática de atividades ilícitas', 'descumprimento da legislação'],
      ],
    },
    {
      n: 14,
      titulo: 'Privacidade e Proteção de Dados',
      itens: [
        'O tratamento de dados pessoais ocorrerá conforme a Política de Privacidade da ZAIEZE e a Lei Geral de Proteção de Dados (LGPD).',
      ],
    },
    {
      n: 15,
      titulo: 'Atualizações da Plataforma',
      itens: [
        'A ZAIEZE poderá alterar, atualizar, adicionar ou remover funcionalidades visando melhorias, segurança, inovação tecnológica ou adequação legal, sem necessidade de aviso prévio, quando permitido pela legislação.',
      ],
    },
    {
      n: 16,
      titulo: 'Alterações dos Termos',
      itens: [
        'Estes Termos poderão ser modificados periodicamente. A versão mais recente estará disponível na plataforma e passará a valer a partir de sua publicação.',
      ],
    },
    {
      n: 17,
      titulo: 'Legislação Aplicável',
      itens: [
        'Estes Termos são regidos pelas leis da República Federativa do Brasil, especialmente pela:',
        ['Constituição Federal', 'Código Civil', 'Código de Defesa do Consumidor', 'Marco Civil da Internet', 'Lei Geral de Proteção de Dados (LGPD)', 'demais normas aplicáveis'],
      ],
    },
    {
      n: 18,
      titulo: 'Foro',
      itens: [
        'Fica eleito o foro da comarca da sede da cidade de Goiânia, Goiás para dirimir eventuais controvérsias decorrentes destes Termos, ressalvadas as hipóteses em que a legislação assegure foro diverso ao consumidor.',
      ],
    },
    {
      n: 19,
      titulo: 'Disposições Finais',
      itens: [
        'A ZAIEZE tem como compromisso oferecer um ambiente digital seguro, transparente e inovador para consumidores, lojistas, assessores de moda, marcas e parceiros.',
        'Ao utilizar a plataforma, o usuário declara que leu, compreendeu e aceitou integralmente estes Termos de Uso e Responsabilidade, comprometendo-se a utilizá-la de forma ética, legal e responsável.',
      ],
    },
  ],
  en: [
    {
      n: 1,
      titulo: 'Acceptance of the Terms',
      itens: [
        'Welcome to ZAIEZE.',
        'By creating an account, accessing, or using any platform service, the user represents that they have read, understood, and fully agree to these Terms of Use, to the Privacy Policy, and to ZAIEZE\'s other policies.',
        'If the user does not agree to these terms, they should not use the platform.',
      ],
    },
    {
      n: 2,
      titulo: 'About ZAIEZE',
      itens: [
        'ZAIEZE is a technology platform that brings together solutions for the fashion industry, including:',
        [
          'Premium Fashion Marketplace', 'Platform for Store Owners', 'Platform for Fashion Advisors',
          'Smart CRM', 'Digital Catalog', 'Virtual Fitting Room', 'AI Virtual Salesperson',
          'Business Management', 'Integrations with WhatsApp, Instagram, Facebook, and other authorized services',
          'Sales, customer service, and marketing automation tools',
        ],
        'ZAIEZE acts as a technology and digital intermediation provider, and is not the manufacturer of the products advertised by sellers, except where expressly stated.',
      ],
    },
    {
      n: 3,
      titulo: 'Registration',
      itens: [
        'The user represents that they:',
        ['will provide truthful, complete, and up-to-date information', 'will keep their data accurate at all times', 'have the legal capacity to enter into agreements', 'are responsible for the security of their password and access credentials'],
        'Each account is personal and non-transferable.',
      ],
    },
    {
      n: 4,
      titulo: 'User Responsibilities',
      itens: [
        'When using ZAIEZE, the user undertakes to:',
        [
          'act in good faith', 'comply with Brazilian law', 'respect the rights of third parties',
          'not use the platform for unlawful practices', 'not send viruses, malicious code, or content that compromises the security of the platform',
          'not attempt to access restricted areas without authorization', "not copy, reproduce, or commercialize ZAIEZE's technologies without authorization",
        ],
      ],
    },
    {
      n: 5,
      titulo: 'Marketplace',
      itens: [
        'Sellers are solely responsible for:',
        ['product descriptions', 'quality', 'authenticity', 'inventory', 'prices', 'delivery', 'issuing tax/fiscal documents', 'legal warranties', 'customer service'],
        'ZAIEZE provides the technology infrastructure to bring buyers and sellers together, and may offer intermediation, payment, communication, and support tools.',
      ],
    },
    {
      n: 6,
      titulo: "Buyers' Responsibility",
      itens: [
        'Buyers undertake to:',
        ['provide correct information for delivery', 'make payments in a legitimate manner', 'use products in accordance with their intended purpose', 'comply with the purchase, exchange, and return policies'],
      ],
    },
    {
      n: 7,
      titulo: 'Published Content',
      itens: [
        'The user remains the owner of the content published on the platform.',
        'By publishing photos, videos, descriptions, authorized brands, or other materials, the user grants ZAIEZE a non-exclusive license to use such content for the purpose of operating, disclosing, and promoting the platform\'s services.',
        'The publication of the following content is prohibited:',
        ['false', 'offensive', 'discriminatory', 'unlawful', 'that infringes copyright', 'that uses trademarks without authorization', 'that infringes the rights of third parties'],
      ],
    },
    {
      n: 8,
      titulo: 'Artificial Intelligence',
      itens: [
        "ZAIEZE provides features based on Artificial Intelligence to optimize sales, customer service, and the users' experience.",
        'The responses and recommendations generated by the AI are auxiliary in nature and do not replace human analysis.',
        'The user is responsible for reviewing important information before using it for business decisions.',
      ],
    },
    {
      n: 9,
      titulo: 'Integrations',
      itens: [
        'The platform may integrate with third-party services, including:',
        ['WhatsApp Business', 'Instagram', 'Facebook', 'Payment gateways', 'ERP systems', 'Logistics platforms', 'Marketing tools'],
        "Each integration is also subject to the respective provider's own terms and policies.",
      ],
    },
    {
      n: 10,
      titulo: 'Payments',
      itens: [
        'When paid services are contracted:',
        ['fees will be disclosed in advance', 'subscriptions may be monthly or annual', 'cancellation will follow the conditions of the contracted plan', 'non-payment may result in the suspension or termination of services'],
      ],
    },
    {
      n: 11,
      titulo: 'Intellectual Property',
      itens: [
        "All of ZAIEZE's software, source code, visual identity, logos, database, features, interfaces, artificial intelligence, design, documentation, and other technology assets are protected by intellectual property law.",
        'Their reproduction, reverse engineering, distribution, or commercial exploitation without express authorization is prohibited.',
      ],
    },
    {
      n: 12,
      titulo: 'Limitation of Liability',
      itens: [
        'ZAIEZE is not liable for:',
        [
          'incorrect information provided by users', 'negotiations carried out directly between buyers and sellers',
          'unavailability caused by third parties', 'internet failures', 'integrated third-party services',
          'improper use of the platform', 'losses arising from the user\'s breach of these Terms',
          'unavailability caused by weather events',
        ],
      ],
    },
    {
      n: 13,
      titulo: 'Suspension and Termination of Accounts',
      itens: [
        'ZAIEZE may suspend or terminate accounts, temporarily or permanently, in the event of:',
        ['fraud', 'attempted intrusion', 'misuse of the platform', 'violation of these Terms', 'unlawful activity', 'non-compliance with the law'],
      ],
    },
    {
      n: 14,
      titulo: 'Privacy and Data Protection',
      itens: [
        "The processing of personal data will take place in accordance with ZAIEZE's Privacy Policy and Brazil's General Data Protection Law (LGPD).",
      ],
    },
    {
      n: 15,
      titulo: 'Platform Updates',
      itens: [
        'ZAIEZE may change, update, add, or remove features for the purpose of improvements, security, technological innovation, or legal compliance, without prior notice, where permitted by law.',
      ],
    },
    {
      n: 16,
      titulo: 'Changes to the Terms',
      itens: [
        'These Terms may be modified periodically. The most recent version will be available on the platform and will take effect as of its publication.',
      ],
    },
    {
      n: 17,
      titulo: 'Governing Law',
      itens: [
        'These Terms are governed by the laws of the Federative Republic of Brazil, in particular:',
        ["Brazil's Federal Constitution", "Brazil's Civil Code", "Brazil's Consumer Protection Code", 'The Brazilian Internet Civil Rights Framework (Marco Civil da Internet)', 'The Brazilian General Data Protection Law (LGPD)', 'Other applicable rules'],
      ],
    },
    {
      n: 18,
      titulo: 'Venue',
      itens: [
        'The courts of the Judicial District (Comarca) of Goiânia, State of Goiás, Brazil, are elected to settle any disputes arising from these Terms, except where the law grants the consumer a different venue.',
      ],
    },
    {
      n: 19,
      titulo: 'Final Provisions',
      itens: [
        'ZAIEZE is committed to offering a secure, transparent, and innovative digital environment for consumers, store owners, fashion advisors, brands, and partners.',
        'By using the platform, the user represents that they have read, understood, and fully accepted these Terms of Use and Responsibility, and undertake to use it in an ethical, lawful, and responsible manner. ' +
          'These Terms are governed by the laws of the Federative Republic of Brazil; this English version is provided for the user\'s convenience only, and in the event of any conflict or discrepancy, the original Portuguese-language version shall prevail.',
      ],
    },
  ],
  es: [
    {
      n: 1,
      titulo: 'Aceptación de los Términos',
      itens: [
        'Bienvenido a ZAIEZE.',
        'Al crear una cuenta, acceder o utilizar cualquier servicio de la plataforma, el usuario declara que ha leído, comprendido y acepta íntegramente estos Términos de Uso, la Política de Privacidad y las demás políticas de ZAIEZE.',
        'Si no está de acuerdo con estos términos, el usuario no deberá utilizar la plataforma.',
      ],
    },
    {
      n: 2,
      titulo: 'Sobre ZAIEZE',
      itens: [
        'ZAIEZE es una plataforma tecnológica que reúne soluciones para el sector de la moda, incluyendo:',
        [
          'Marketplace de Moda Premium', 'Plataforma para Comerciantes', 'Plataforma para Asesoras de Moda',
          'CRM Inteligente', 'Catálogo Digital', 'Probador Virtual', 'Vendedora Virtual por Inteligencia Artificial',
          'Gestión Comercial', 'Integraciones con WhatsApp, Instagram, Facebook y demás servicios autorizados',
          'Herramientas de automatización de ventas, atención y marketing',
        ],
        'ZAIEZE actúa como proveedora de tecnología e intermediación digital, no siendo fabricante de los productos anunciados por las vendedoras, salvo cuando se informe expresamente.',
      ],
    },
    {
      n: 3,
      titulo: 'Registro',
      itens: [
        'El usuario declara que:',
        ['proporcionará información veraz, completa y actualizada', 'mantendrá sus datos siempre correctos', 'posee capacidad legal para contratar', 'es responsable de la seguridad de su contraseña y credenciales de acceso'],
        'Cada cuenta es personal e intransferible.',
      ],
    },
    {
      n: 4,
      titulo: 'Responsabilidades del Usuario',
      itens: [
        'Al utilizar ZAIEZE, el usuario se compromete a:',
        [
          'actuar de buena fe', 'respetar la legislación brasileña', 'respetar los derechos de terceros',
          'no utilizar la plataforma para prácticas ilícitas', 'no enviar virus, códigos maliciosos o contenidos que comprometan la seguridad de la plataforma',
          'no intentar acceder a áreas restringidas sin autorización', 'no copiar, reproducir ni comercializar tecnologías de ZAIEZE sin autorización',
        ],
      ],
    },
    {
      n: 5,
      titulo: 'Marketplace',
      itens: [
        'Las vendedoras son exclusivamente responsables por:',
        ['la descripción de los productos', 'la calidad', 'la autenticidad', 'el stock', 'los precios', 'la entrega', 'la emisión de documentos fiscales', 'las garantías legales', 'la atención al consumidor'],
        'ZAIEZE pone a disposición la infraestructura tecnológica para acercar a compradores y vendedoras, pudiendo ofrecer herramientas de intermediación, pago, comunicación y soporte.',
      ],
    },
    {
      n: 6,
      titulo: 'Responsabilidad de los Compradores',
      itens: [
        'Los compradores se comprometen a:',
        ['proporcionar información correcta para la entrega', 'realizar los pagos de forma legítima', 'utilizar los productos conforme a su finalidad', 'respetar las políticas de compra, cambio y devolución'],
      ],
    },
    {
      n: 7,
      titulo: 'Contenido Publicado',
      itens: [
        'El usuario sigue siendo titular del contenido publicado en la plataforma.',
        'Al publicar fotos, videos, descripciones, marcas autorizadas u otros materiales, otorga a ZAIEZE una licencia no exclusiva para utilizar dicho contenido con la finalidad de operar, difundir y promover los servicios de la plataforma.',
        'Queda prohibida la publicación de contenido:',
        ['falso', 'ofensivo', 'discriminatorio', 'ilegal', 'que viole derechos de autor', 'que utilice marcas sin autorización', 'que infrinja derechos de terceros'],
      ],
    },
    {
      n: 8,
      titulo: 'Inteligencia Artificial',
      itens: [
        'ZAIEZE pone a disposición funciones basadas en Inteligencia Artificial para optimizar las ventas, la atención y la experiencia de los usuarios.',
        'Las respuestas y recomendaciones generadas por la IA tienen carácter auxiliar y no sustituyen el análisis humano.',
        'El usuario es responsable de revisar la información importante antes de utilizarla para decisiones comerciales.',
      ],
    },
    {
      n: 9,
      titulo: 'Integraciones',
      itens: [
        'La plataforma podrá integrarse con servicios de terceros, incluyendo:',
        ['WhatsApp Business', 'Instagram', 'Facebook', 'Pasarelas de pago', 'Sistemas ERP', 'Plataformas de logística', 'Herramientas de marketing'],
        'Cada integración también estará sujeta a los términos y políticas de los respectivos proveedores.',
      ],
    },
    {
      n: 10,
      titulo: 'Pagos',
      itens: [
        'Cuando se contraten servicios pagos:',
        ['los valores se informarán previamente', 'las suscripciones podrán ser mensuales o anuales', 'la cancelación seguirá las condiciones del plan contratado', 'la falta de pago podrá ocasionar la suspensión o el cierre de los servicios'],
      ],
    },
    {
      n: 11,
      titulo: 'Propiedad Intelectual',
      itens: [
        'Todo el software, código fuente, identidad visual, logotipos, base de datos, funcionalidades, interfaces, inteligencia artificial, diseño, documentación y demás activos tecnológicos de ZAIEZE están protegidos por la legislación de propiedad intelectual.',
        'Queda prohibida su reproducción, ingeniería inversa, distribución o explotación comercial sin autorización expresa.',
      ],
    },
    {
      n: 12,
      titulo: 'Limitación de Responsabilidad',
      itens: [
        'ZAIEZE no responde por:',
        [
          'información incorrecta proporcionada por los usuarios', 'negociaciones realizadas directamente entre compradores y vendedoras',
          'indisponibilidades causadas por terceros', 'fallas de internet', 'servicios de terceros integrados',
          'uso inadecuado de la plataforma', 'pérdidas derivadas del incumplimiento de estos Términos por parte del usuario',
          'indisponibilidades causadas por eventos climáticos',
        ],
      ],
    },
    {
      n: 13,
      titulo: 'Suspensión y Cierre de Cuentas',
      itens: [
        'ZAIEZE podrá suspender o cerrar cuentas, temporal o definitivamente, cuando exista:',
        ['fraude', 'intento de intrusión', 'uso indebido de la plataforma', 'violación de estos Términos', 'práctica de actividades ilícitas', 'incumplimiento de la legislación'],
      ],
    },
    {
      n: 14,
      titulo: 'Privacidad y Protección de Datos',
      itens: [
        'El tratamiento de datos personales se realizará conforme a la Política de Privacidad de ZAIEZE y a la Ley General de Protección de Datos de Brasil (LGPD).',
      ],
    },
    {
      n: 15,
      titulo: 'Actualizaciones de la Plataforma',
      itens: [
        'ZAIEZE podrá modificar, actualizar, agregar o eliminar funcionalidades con el fin de realizar mejoras, garantizar la seguridad, innovar tecnológicamente o adecuarse a la legislación, sin necesidad de aviso previo, cuando lo permita la ley.',
      ],
    },
    {
      n: 16,
      titulo: 'Modificaciones de los Términos',
      itens: [
        'Estos Términos podrán ser modificados periódicamente. La versión más reciente estará disponible en la plataforma y comenzará a regir a partir de su publicación.',
      ],
    },
    {
      n: 17,
      titulo: 'Legislación Aplicable',
      itens: [
        'Estos Términos se rigen por las leyes de la República Federativa de Brasil, especialmente por:',
        ['La Constitución Federal', 'El Código Civil', 'El Código de Defensa del Consumidor', 'El Marco Civil de Internet', 'La Ley General de Protección de Datos (LGPD)', 'Demás normas aplicables'],
      ],
    },
    {
      n: 18,
      titulo: 'Fuero',
      itens: [
        'Queda elegido el fuero de la comarca de la ciudad de Goiânia, Estado de Goiás, Brasil, para dirimir cualquier controversia derivada de estos Términos, salvo en los casos en que la ley asegure un fuero distinto al consumidor.',
      ],
    },
    {
      n: 19,
      titulo: 'Disposiciones Finales',
      itens: [
        'ZAIEZE tiene como compromiso ofrecer un entorno digital seguro, transparente e innovador para consumidores, comerciantes, asesoras de moda, marcas y socios.',
        'Al utilizar la plataforma, el usuario declara que ha leído, comprendido y aceptado íntegramente estos Términos de Uso y Responsabilidad, comprometiéndose a utilizarla de forma ética, legal y responsable. ' +
          'Estos Términos se rigen por las leyes de la República Federativa de Brasil; esta versión en español se ofrece únicamente como cortesía para el usuario, y en caso de cualquier conflicto o discrepancia, prevalecerá la versión original en portugués.',
      ],
    },
  ],
}

export function montarTermosUso(input: TermosUsoInput = {}): TermosUsoMontado {
  const idioma = resolverIdioma(input.idioma)
  const aceite = input.aceite
    ? { aceitoEm: input.aceite.aceitoEm.toISOString(), ip: input.aceite.ip ?? null, versao: input.aceite.versao }
    : null

  return {
    versao: TERMOS_USO_VERSAO,
    idioma,
    titulo: TITULOS[idioma],
    atualizadoEm: ATUALIZADO_EM[idioma],
    secoes: SECOES[idioma],
    aceite,
    historico: HISTORICO[idioma],
  }
}

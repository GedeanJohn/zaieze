/**
 * Template do Contrato de Licença de Uso e Prestação de Serviços (SaaS) do ZAIEZE.
 *
 * CONTRATADA = ZAIEZE (a plataforma). CONTRATANTE = a marca/rede, representada
 * pelo GESTOR que aceita eletronicamente. O mesmo builder serve a API (render em
 * tela) e — futuramente — a geração de PDF.
 *
 * ⚠️ Template padrão — revise com advogado e PREENCHA os dados da EMPRESA antes do
 * uso real. Ao alterar o texto de forma relevante, incremente CONTRATO_VERSAO e a
 * data CONTRATO_PUBLICADO_EM (base do prazo de reaceite/distrato).
 *
 * Multilíngue (pt/en/es — en-gb cai no fallback de en, ver resolverIdioma): o texto
 * é regido pela lei brasileira em qualquer idioma; as versões en/es são traduções de
 * cortesia (nota nesse sentido incluída no próprio texto). `versao`/CONTRATO_VERSAO
 * e o job de reaceite/distrato são agnósticos de idioma — o idioma exibido em cada
 * aceite fica registrado à parte (ver AceiteContrato.idioma).
 */
export const CONTRATO_VERSAO = '1.0-2026-06'

/** Data em que a versão vigente entrou no ar — base do prazo de reaceite. */
export const CONTRATO_PUBLICADO_EM = new Date('2026-06-27T00:00:00-03:00')

/** Janela (dias corridos) para aceitar/reaceitar antes do distrato. */
export const JANELA_REACEITE_DIAS = 30

/** Prazo final de aceite — a partir desta data o distrato é executado. */
export function prazoReaceite(): Date {
  const d = new Date(CONTRATO_PUBLICADO_EM)
  d.setDate(d.getDate() + JANELA_REACEITE_DIAS)
  return d
}

/** Dados cadastrais da CONTRATADA (ZAIEZE) — nomes próprios, não traduzidos. */
export const EMPRESA = {
  nome: 'GEDEAN JOHN ASSESSORIA E CONSULTORIA EMPRESARIAL LTDA',
  cnpj: '43.391.734/0001-51',
  endereco: 'Rua Dinamarca, nº 689, apto 10, Jardim Europa, Goiânia/GO, CEP 74330-050',
  representante: 'GEDEAN JOHN GAZOLA, Sócio-Administrador, CPF 028.918.094-59',
  cidadeForo: 'Goiânia/GO',
  produto: 'Zaieze Sistemas Inteligentes para a Moda',
} as const

const PLACEHOLDER = '_________________________________'

export type ContratoIdioma = 'pt' | 'en' | 'es'

/** en-gb cai no fallback de en (não há "inglês jurídico britânico" próprio aqui); qualquer valor não reconhecido cai em pt. */
function resolverIdioma(idioma?: string): ContratoIdioma {
  if (idioma === 'en-gb') return 'en'
  if (idioma === 'en' || idioma === 'es') return idioma
  return 'pt'
}

export interface ContratanteData {
  redeNome: string
  slug: string
  gestorNome: string
  gestorEmail: string
}

export interface ContratoInput {
  contratante?: ContratanteData
  plano?: { nome: string; valor: number }
  aceite?: { aceitoEm: Date; ip?: string | null; versao: string }
  idioma?: string
}

export interface ClausulaContrato {
  n: number
  titulo: string
  paragrafos: string[]
}

export interface ContratoMontado {
  versao: string
  idioma: ContratoIdioma
  titulo: string
  empresa: typeof EMPRESA
  contratante: ContratanteData | null
  plano: { nome: string; valor: number } | null
  qualificacao: string[]
  clausulas: ClausulaContrato[]
  aceite: { aceitoEm: string; ip: string | null; versao: string } | null
}

function brl(v?: number) {
  if (v == null) return null
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

function valorFallback(idioma: ContratoIdioma): string {
  if (idioma === 'en') return 'the contracted plan amount'
  if (idioma === 'es') return 'el valor del plan contratado'
  return 'o valor do plano contratado'
}

function dominioRede(slug: string | undefined, idioma: ContratoIdioma): string {
  if (slug) return `${slug}.zaieze.com`
  if (idioma === 'en') return '[your-address].zaieze.com'
  if (idioma === 'es') return '[su-dirección].zaieze.com'
  return '[seu-endereço].zaieze.com'
}

const TITULOS: Record<ContratoIdioma, string> = {
  pt: 'CONTRATO DE LICENÇA DE USO E PRESTAÇÃO DE SERVIÇOS (SaaS)',
  en: 'SOFTWARE LICENSE AND SERVICES AGREEMENT (SaaS)',
  es: 'CONTRATO DE LICENCIA DE USO Y PRESTACIÓN DE SERVICIOS (SaaS)',
}

type QualificacaoBuilder = (e: typeof EMPRESA, ct: ContratanteData | undefined) => string[]

const QUALIFICACAO_BUILDERS: Record<ContratoIdioma, QualificacaoBuilder> = {
  pt: (e, ct) => [
    `CONTRATADA: ${e.nome}, inscrita no CNPJ sob o nº ${e.cnpj}, com sede em ${e.endereco}, neste ato representada na ` +
      `forma de seus atos constitutivos por ${e.representante}, doravante denominada simplesmente CONTRATADA.`,
    `CONTRATANTE: ${ct?.redeNome ?? PLACEHOLDER}, marca/estabelecimento responsável pela operação em ${dominioRede(ct?.slug, 'pt')}, ` +
      `neste ato representada pelo(a) gestor(a) ${ct?.gestorNome ?? PLACEHOLDER}, e-mail ${ct?.gestorEmail ?? PLACEHOLDER}, ` +
      `doravante denominada simplesmente CONTRATANTE.`,
    `As partes acima qualificadas têm, entre si, justo e contratado o presente Contrato de Licença de Uso e Prestação de ` +
      `Serviços de Software como Serviço (SaaS), que se regerá pelas cláusulas e condições seguintes.`,
  ],
  en: (e, ct) => [
    `SERVICE PROVIDER: ${e.nome}, a company duly registered under Brazilian CNPJ (National Register of Legal Entities) No. ` +
      `${e.cnpj}, with registered office at ${e.endereco}, herein represented, pursuant to its bylaws, by ${e.representante}, ` +
      `hereinafter referred to simply as SERVICE PROVIDER.`,
    `CLIENT: ${ct?.redeNome ?? PLACEHOLDER}, the brand/business responsible for the operation at ${dominioRede(ct?.slug, 'en')}, ` +
      `herein represented by its manager, ${ct?.gestorNome ?? PLACEHOLDER}, e-mail ${ct?.gestorEmail ?? PLACEHOLDER}, ` +
      `hereinafter referred to simply as CLIENT.`,
    `The parties qualified above have mutually agreed to enter into this Software License and Software-as-a-Service (SaaS) ` +
      `Agreement, which shall be governed by the clauses and conditions set forth below. This Agreement is governed by the ` +
      `laws of the Federative Republic of Brazil; this English version is provided for the CLIENT's convenience only, and in ` +
      `the event of any conflict or discrepancy, the original Portuguese-language version shall prevail.`,
  ],
  es: (e, ct) => [
    `PROVEEDOR: ${e.nome}, sociedad debidamente inscrita en el CNPJ (Registro Nacional de Personas Jurídicas de Brasil) bajo ` +
      `el nº ${e.cnpj}, con domicilio en ${e.endereco}, en este acto representada, conforme sus actos constitutivos, por ` +
      `${e.representante}, en adelante denominada simplemente PROVEEDOR.`,
    `CLIENTE: ${ct?.redeNome ?? PLACEHOLDER}, marca/establecimiento responsable de la operación en ${dominioRede(ct?.slug, 'es')}, ` +
      `en este acto representada por su gestor(a), ${ct?.gestorNome ?? PLACEHOLDER}, correo electrónico ${ct?.gestorEmail ?? PLACEHOLDER}, ` +
      `en adelante denominada simplemente CLIENTE.`,
    `Las partes arriba calificadas han acordado celebrar el presente Contrato de Licencia de Uso y Prestación de Servicios de ` +
      `Software como Servicio (SaaS), que se regirá por las cláusulas y condiciones siguientes. Este contrato se rige por las ` +
      `leyes de la República Federativa de Brasil; esta versión en español se ofrece únicamente como cortesía para el CLIENTE, ` +
      `y en caso de cualquier conflicto o discrepancia, prevalecerá la versión original en portugués.`,
  ],
}

type ClausulaBuilder = (e: typeof EMPRESA, ct: ContratanteData | undefined, valor: string) => ClausulaContrato[]

const CLAUSULA_BUILDERS: Record<ContratoIdioma, ClausulaBuilder> = {
  pt: (e, ct, valor) => [
    {
      n: 1,
      titulo: 'DO OBJETO',
      paragrafos: [
        `O presente contrato tem por objeto a concessão, pela CONTRATADA, de licença de uso, não exclusiva e intransferível, ` +
          `da plataforma ${e.produto} — sistema de gestão de vendas, relacionamento (CRM), atendimento por WhatsApp, estoque e ` +
          `catálogo/Portal do Cliente —, hospedada e disponibilizada à CONTRATANTE em ambiente próprio (${dominioRede(ct?.slug, 'pt')}).`,
        `Os módulos e funcionalidades disponíveis variam conforme o plano contratado (START, PRO ou ELITE). A CONTRATADA presta ` +
          `serviço de tecnologia e disponibilização da plataforma, não participando, intermediando ou se responsabilizando pelas ` +
          `vendas, negociações, entregas ou pagamentos realizados entre a CONTRATANTE e seus clientes.`,
      ],
    },
    {
      n: 2,
      titulo: 'DA FORMA DE PRESTAÇÃO DOS SERVIÇOS',
      paragrafos: [
        `Os serviços são prestados integralmente de forma online. A CONTRATANTE acessa um painel de gestão para operar suas lojas, ` +
          `vendedoras, estoque e canais de atendimento, disponível enquanto vigente e adimplente este contrato.`,
        `A CONTRATADA empregará seus melhores esforços para manter a plataforma disponível, podendo realizar manutenções ` +
          `programadas e eventuais interrupções técnicas, sem que isso configure descumprimento contratual.`,
      ],
    },
    {
      n: 3,
      titulo: 'DO PREÇO E DA FORMA DE PAGAMENTO',
      paragrafos: [
        `Pela licença e pelos serviços, a CONTRATANTE pagará à CONTRATADA o valor mensal de ${valor}, por meio do provedor de ` +
          `pagamentos integrado à plataforma (Mercado Pago), na modalidade de cobrança recorrente.`,
        `O pagamento é antecipado e a renovação é automática a cada período de 30 (trinta) dias, enquanto não houver cancelamento. ` +
          `A falta de pagamento autoriza a suspensão do acesso até a regularização.`,
        `Os valores poderão ser reajustados pela CONTRATADA mediante comunicação prévia à CONTRATANTE, que poderá rescindir o ` +
          `contrato caso não concorde com o novo valor.`,
      ],
    },
    {
      n: 4,
      titulo: 'DA VIGÊNCIA',
      paragrafos: [
        `O presente contrato vigora por prazo indeterminado, em ciclos mensais, iniciando-se na data do aceite eletrônico e da ` +
          `confirmação do primeiro pagamento, renovando-se automaticamente a cada período enquanto adimplente e não cancelado ` +
          `por qualquer das partes.`,
      ],
    },
    {
      n: 5,
      titulo: 'DO CANCELAMENTO E DA RESCISÃO',
      paragrafos: [
        `A CONTRATANTE poderá cancelar o serviço a qualquer tempo, diretamente pelo painel da plataforma. Adotada a política de ` +
          `fim de ciclo, o acesso permanece disponível até o término do período mensal já pago, cessando as renovações seguintes, ` +
          `sem direito a reembolso do período em curso.`,
        `A CONTRATADA poderá rescindir o contrato em caso de inadimplência, uso indevido da plataforma, ou publicação de conteúdo ` +
          `ilícito ou que viole estes termos, mediante a desativação do acesso.`,
        `A CONTRATADA poderá alterar os termos deste contrato, inclusive as regras de conduta e de conteúdo, mediante aviso à ` +
          `CONTRATANTE e solicitação de novo aceite eletrônico. Não havendo o reaceite no prazo de ${JANELA_REACEITE_DIAS} (trinta) ` +
          `dias contados do aviso, o presente contrato será considerado distratado de pleno direito, cessando a renovação ` +
          `automática da cobrança e encerrando-se o acesso à plataforma ao término do período de assinatura já pago, sem direito a ` +
          `reembolso e preservados os dados pelos prazos legais.`,
      ],
    },
    {
      n: 6,
      titulo: 'DAS OBRIGAÇÕES DA CONTRATADA',
      paragrafos: [
        `Disponibilizar a plataforma e o painel de gestão conforme o plano contratado; envidar esforços para manter o serviço no ` +
          `ar; prestar suporte pelos canais informados; e tratar os dados pessoais conforme a legislação aplicável.`,
      ],
    },
    {
      n: 7,
      titulo: 'DAS OBRIGAÇÕES DA CONTRATANTE',
      paragrafos: [
        `Fornecer informações verídicas e mantê-las atualizadas; utilizar a plataforma de forma lícita; ser a única responsável ` +
          `pelo conteúdo (textos, imagens, produtos, ofertas, preços e mensagens) que publicar ou disparar por meio da plataforma; ` +
          `respeitar direitos de terceiros; obter o consentimento dos seus clientes para o envio de mensagens; e efetuar os ` +
          `pagamentos nos prazos.`,
        `A CONTRATANTE declara e garante que os produtos divulgados e comercializados são lícitos e de procedência legítima, ` +
          `assumindo integral e exclusiva responsabilidade civil, administrativa e criminal por sua origem e comercialização.`,
      ],
    },
    {
      n: 8,
      titulo: 'DAS VEDAÇÕES AO CONTEÚDO E À CONDUTA',
      paragrafos: [
        `É expressamente vedado à CONTRATANTE publicar, divulgar, exibir, armazenar ou disparar, por meio da plataforma ou dos ` +
          `canais a ela vinculados (catálogo, Portal do Cliente, WhatsApp e correlatos), qualquer anúncio, imagem, vídeo, áudio ou ` +
          `texto de natureza sexual, pornográfica, erótica ou sensual, de forma explícita ou implícita, envolvendo pessoas adultas, ` +
          `bem como a oferta, intermediação ou divulgação de serviços de natureza sexual.`,
        `É terminantemente proibida, por constituir ilícito penal, a publicação, veiculação ou divulgação de qualquer conteúdo que ` +
          `envolva, represente, exiba, sugira, simule ou explore criança ou adolescente (pessoa menor de 18 anos) em contexto, cena ` +
          `ou situação de natureza sexual, erótica ou pornográfica, ainda que de forma implícita, simulada ou por montagem, nos ` +
          `termos da Lei nº 8.069/1990 (Estatuto da Criança e do Adolescente).`,
        `A constatação de qualquer das condutas vedadas neste item enseja a imediata desativação do acesso e a rescisão deste ` +
          `contrato por justa causa, independentemente de aviso prévio e sem direito a reembolso, sem prejuízo da comunicação às ` +
          `autoridades competentes e da responsabilização civil e criminal exclusiva da CONTRATANTE, que se obriga a isentar e ` +
          `indenizar a CONTRATADA por quaisquer danos, perdas, multas ou demandas decorrentes.`,
      ],
    },
    {
      n: 9,
      titulo: 'DA PROTEÇÃO DE DADOS (LGPD)',
      paragrafos: [
        `As partes se comprometem a tratar os dados pessoais em conformidade com a Lei nº 13.709/2018 (LGPD). Quanto aos dados dos ` +
          `clientes finais inseridos pela CONTRATANTE, esta atua como CONTROLADORA e a CONTRATADA como OPERADORA, tratando-os ` +
          `exclusivamente para a execução deste contrato e conforme as instruções da CONTRATANTE.`,
        `A CONTRATANTE é responsável por possuir base legal para o tratamento e o envio de comunicações aos seus clientes.`,
      ],
    },
    {
      n: 10,
      titulo: 'DA PROPRIEDADE INTELECTUAL',
      paragrafos: [
        `A plataforma, marca, layout e software da CONTRATADA são de sua exclusiva propriedade, sendo concedida à CONTRATANTE ` +
          `apenas a licença de uso ora pactuada. O conteúdo e os dados inseridos pela CONTRATANTE permanecem de sua titularidade.`,
      ],
    },
    {
      n: 11,
      titulo: 'DO ACEITE ELETRÔNICO',
      paragrafos: [
        `As partes reconhecem a validade e a eficácia do aceite eletrônico deste contrato, manifestado pela CONTRATANTE, por meio ` +
          `de seu gestor, mediante ação afirmativa na plataforma ("Li e aceito"), com registro de data, hora e endereço IP, nos ` +
          `termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001, dispensando-se a assinatura física.`,
      ],
    },
    {
      n: 12,
      titulo: 'DO FORO',
      paragrafos: [
        `As partes elegem o foro da Comarca de ${e.cidadeForo} para dirimir quaisquer dúvidas ou litígios oriundos do presente ` +
          `contrato, com renúncia a qualquer outro, por mais privilegiado que seja.`,
      ],
    },
  ],
  en: (e, ct, valor) => [
    {
      n: 1,
      titulo: 'SUBJECT MATTER',
      paragrafos: [
        `This Agreement has as its subject matter the grant, by the SERVICE PROVIDER, of a non-exclusive, non-transferable ` +
          `license to use the ${e.produto} platform — a sales management, customer relationship (CRM), WhatsApp customer ` +
          `service, inventory, and catalog/Customer Portal system —, hosted and made available to the CLIENT on its own ` +
          `dedicated environment (${dominioRede(ct?.slug, 'en')}).`,
        `The modules and features available vary according to the plan contracted (START, PRO, or ELITE). The SERVICE ` +
          `PROVIDER renders a technology service and makes the platform available, without participating in, intermediating, ` +
          `or assuming any responsibility for the sales, negotiations, deliveries, or payments carried out between the CLIENT ` +
          `and its own customers.`,
      ],
    },
    {
      n: 2,
      titulo: 'MANNER OF SERVICE DELIVERY',
      paragrafos: [
        `The services are provided entirely online. The CLIENT accesses a management dashboard to operate its stores, ` +
          `salespeople, inventory, and service channels, available for as long as this Agreement remains in force and the ` +
          `CLIENT's account remains in good standing.`,
        `The SERVICE PROVIDER shall use its best efforts to keep the platform available, and may carry out scheduled ` +
          `maintenance and occasional technical interruptions, none of which shall constitute a breach of this Agreement.`,
      ],
    },
    {
      n: 3,
      titulo: 'PRICE AND PAYMENT TERMS',
      paragrafos: [
        `In consideration for the license and services, the CLIENT shall pay the SERVICE PROVIDER the monthly amount of ` +
          `${valor}, through the payment provider integrated into the platform (Mercado Pago), on a recurring billing basis.`,
        `Payment is made in advance, and renewal is automatic every 30 (thirty) days, unless cancelled. Failure to pay ` +
          `authorizes the suspension of access until the account is brought current.`,
        `Fees may be adjusted by the SERVICE PROVIDER upon prior notice to the CLIENT, who may terminate this Agreement if ` +
          `it does not agree with the new amount.`,
      ],
    },
    {
      n: 4,
      titulo: 'TERM',
      paragrafos: [
        `This Agreement is effective for an indefinite term, in monthly cycles, commencing on the date of electronic ` +
          `acceptance and confirmation of the first payment, and shall automatically renew each period for as long as the ` +
          `CLIENT's account remains in good standing and is not cancelled by either party.`,
      ],
    },
    {
      n: 5,
      titulo: 'CANCELLATION AND TERMINATION',
      paragrafos: [
        `The CLIENT may cancel the service at any time, directly through the platform dashboard. Under the end-of-cycle ` +
          `policy adopted, access remains available until the end of the monthly period already paid for, with subsequent ` +
          `renewals ceasing thereafter, without any right to a refund of the period in progress.`,
        `The SERVICE PROVIDER may terminate this Agreement in the event of non-payment, misuse of the platform, or ` +
          `publication of unlawful content or content that violates these terms, by deactivating access.`,
        `The SERVICE PROVIDER may amend the terms of this Agreement, including rules of conduct and content, upon notice to ` +
          `the CLIENT and a request for a new electronic acceptance. If such re-acceptance is not given within ` +
          `${JANELA_REACEITE_DIAS} (thirty) days of the notice, this Agreement shall be deemed automatically terminated by ` +
          `operation of law, the automatic renewal of billing shall cease, and access to the platform shall end upon ` +
          `expiration of the subscription period already paid for, without any right to a refund, with data being preserved ` +
          `for the periods required by law.`,
      ],
    },
    {
      n: 6,
      titulo: 'OBLIGATIONS OF THE SERVICE PROVIDER',
      paragrafos: [
        `To make the platform and management dashboard available in accordance with the contracted plan; to use reasonable ` +
          `efforts to keep the service operational; to provide support through the channels indicated; and to process ` +
          `personal data in accordance with applicable law.`,
      ],
    },
    {
      n: 7,
      titulo: 'OBLIGATIONS OF THE CLIENT',
      paragrafos: [
        `To provide truthful information and keep it up to date; to use the platform lawfully; to be solely responsible for ` +
          `the content (text, images, products, offers, prices, and messages) that it publishes or sends through the ` +
          `platform; to respect the rights of third parties; to obtain its customers' consent for sending messages; and to ` +
          `make payments on time.`,
        `The CLIENT represents and warrants that the products advertised and sold are lawful and of legitimate origin, ` +
          `assuming full and exclusive civil, administrative, and criminal liability for their origin and sale.`,
      ],
    },
    {
      n: 8,
      titulo: 'PROHIBITED CONTENT AND CONDUCT',
      paragrafos: [
        `The CLIENT is expressly prohibited from publishing, disseminating, displaying, storing, or sending, through the ` +
          `platform or the channels linked to it (catalog, Customer Portal, WhatsApp, and related channels), any ` +
          `advertisement, image, video, audio, or text of a sexual, pornographic, erotic, or suggestive nature, whether ` +
          `explicit or implicit, involving adults, as well as offering, brokering, or advertising services of a sexual ` +
          `nature.`,
        `It is strictly forbidden, as it constitutes a criminal offense, to publish, transmit, or disseminate any content ` +
          `that involves, depicts, displays, suggests, simulates, or exploits a child or adolescent (a person under 18 years ` +
          `of age) in a sexual, erotic, or pornographic context, scene, or situation, even if implicit, simulated, or through ` +
          `image manipulation, pursuant to Brazilian Federal Law No. 8,069/1990 (the Child and Adolescent Statute).`,
        `The verification of any of the conduct prohibited under this Section shall give rise to the immediate deactivation ` +
          `of access and termination of this Agreement for cause, regardless of prior notice and without any right to a ` +
          `refund, without prejudice to reporting the matter to the competent authorities and to the CLIENT's exclusive ` +
          `civil and criminal liability; the CLIENT undertakes to hold harmless and indemnify the SERVICE PROVIDER for any ` +
          `damages, losses, fines, or claims arising therefrom.`,
      ],
    },
    {
      n: 9,
      titulo: 'DATA PROTECTION (LGPD)',
      paragrafos: [
        `The parties undertake to process personal data in accordance with Brazilian Federal Law No. 13,709/2018 (the ` +
          `Brazilian General Data Protection Law — LGPD). With respect to the end-customer data entered by the CLIENT, the ` +
          `CLIENT acts as the data CONTROLLER and the SERVICE PROVIDER as the data PROCESSOR, processing such data ` +
          `exclusively to perform this Agreement and in accordance with the CLIENT's instructions.`,
        `The CLIENT is responsible for having a valid legal basis for processing data and for sending communications to its ` +
          `customers.`,
      ],
    },
    {
      n: 10,
      titulo: 'INTELLECTUAL PROPERTY',
      paragrafos: [
        `The platform, brand, layout, and software of the SERVICE PROVIDER are its exclusive property, with only the license ` +
          `to use granted herein being conveyed to the CLIENT. Content and data entered by the CLIENT remain its own ` +
          `property.`,
      ],
    },
    {
      n: 11,
      titulo: 'ELECTRONIC ACCEPTANCE',
      paragrafos: [
        `The parties acknowledge the validity and legal effect of the electronic acceptance of this Agreement, given by the ` +
          `CLIENT, through its manager, by means of an affirmative action on the platform ("I have read and accept"), with ` +
          `the date, time, and IP address recorded, pursuant to Article 10, Paragraph 2, of Brazilian Provisional Measure ` +
          `No. 2,200-2/2001, physical signature being waived.`,
      ],
    },
    {
      n: 12,
      titulo: 'GOVERNING LAW AND VENUE',
      paragrafos: [
        `The parties elect the courts of the Judicial District (Comarca) of ${e.cidadeForo}, Brazil, to settle any questions ` +
          `or disputes arising from this Agreement, waiving any other venue, however privileged it may be.`,
      ],
    },
  ],
  es: (e, ct, valor) => [
    {
      n: 1,
      titulo: 'DEL OBJETO',
      paragrafos: [
        `El presente contrato tiene por objeto la concesión, por parte del PROVEEDOR, de una licencia de uso no exclusiva e ` +
          `intransferible de la plataforma ${e.produto} — sistema de gestión de ventas, relación con clientas (CRM), atención ` +
          `por WhatsApp, stock y catálogo/Portal de la Clienta —, alojada y puesta a disposición del CLIENTE en un entorno ` +
          `propio (${dominioRede(ct?.slug, 'es')}).`,
        `Los módulos y funcionalidades disponibles varían según el plan contratado (START, PRO o ELITE). El PROVEEDOR presta ` +
          `un servicio de tecnología y pone la plataforma a disposición, sin participar, intermediar o responsabilizarse por ` +
          `las ventas, negociaciones, entregas o pagos realizados entre el CLIENTE y sus propias clientas.`,
      ],
    },
    {
      n: 2,
      titulo: 'DE LA FORMA DE PRESTACIÓN DE LOS SERVICIOS',
      paragrafos: [
        `Los servicios se prestan íntegramente en línea. El CLIENTE accede a un panel de gestión para operar sus tiendas, ` +
          `vendedoras, stock y canales de atención, disponible mientras esté vigente y al día con este contrato.`,
        `El PROVEEDOR empleará sus mejores esfuerzos para mantener la plataforma disponible, pudiendo realizar mantenimientos ` +
          `programados e interrupciones técnicas eventuales, sin que ello configure incumplimiento contractual.`,
      ],
    },
    {
      n: 3,
      titulo: 'DEL PRECIO Y DE LA FORMA DE PAGO',
      paragrafos: [
        `Por la licencia y los servicios, el CLIENTE pagará al PROVEEDOR el valor mensual de ${valor}, mediante el proveedor ` +
          `de pagos integrado a la plataforma (Mercado Pago), bajo la modalidad de cobro recurrente.`,
        `El pago es anticipado y la renovación es automática cada 30 (treinta) días, mientras no haya cancelación. La falta ` +
          `de pago autoriza la suspensión del acceso hasta la regularización.`,
        `Los valores podrán ser reajustados por el PROVEEDOR mediante comunicación previa al CLIENTE, quien podrá rescindir ` +
          `el contrato si no está de acuerdo con el nuevo valor.`,
      ],
    },
    {
      n: 4,
      titulo: 'DE LA VIGENCIA',
      paragrafos: [
        `El presente contrato tiene vigencia por plazo indeterminado, en ciclos mensuales, iniciándose en la fecha de la ` +
          `aceptación electrónica y de la confirmación del primer pago, renovándose automáticamente cada período mientras el ` +
          `CLIENTE esté al día y no lo cancele ninguna de las partes.`,
      ],
    },
    {
      n: 5,
      titulo: 'DE LA CANCELACIÓN Y DE LA RESCISIÓN',
      paragrafos: [
        `El CLIENTE podrá cancelar el servicio en cualquier momento, directamente desde el panel de la plataforma. Adoptada ` +
          `la política de fin de ciclo, el acceso permanece disponible hasta el término del período mensual ya pagado, ` +
          `cesando las renovaciones siguientes, sin derecho a reembolso del período en curso.`,
        `El PROVEEDOR podrá rescindir el contrato en caso de falta de pago, uso indebido de la plataforma, o publicación de ` +
          `contenido ilícito o que viole estos términos, mediante la desactivación del acceso.`,
        `El PROVEEDOR podrá modificar los términos de este contrato, incluidas las reglas de conducta y de contenido, ` +
          `mediante aviso al CLIENTE y solicitud de una nueva aceptación electrónica. De no producirse la nueva aceptación ` +
          `dentro de los ${JANELA_REACEITE_DIAS} (treinta) días contados desde el aviso, el presente contrato se considerará ` +
          `rescindido de pleno derecho, cesando la renovación automática del cobro y finalizando el acceso a la plataforma al ` +
          `término del período de suscripción ya pagado, sin derecho a reembolso, conservándose los datos por los plazos ` +
          `legales.`,
      ],
    },
    {
      n: 6,
      titulo: 'DE LAS OBLIGACIONES DEL PROVEEDOR',
      paragrafos: [
        `Poner a disposición la plataforma y el panel de gestión conforme al plan contratado; realizar esfuerzos razonables ` +
          `para mantener el servicio en funcionamiento; prestar soporte por los canales informados; y tratar los datos ` +
          `personales conforme a la legislación aplicable.`,
      ],
    },
    {
      n: 7,
      titulo: 'DE LAS OBLIGACIONES DEL CLIENTE',
      paragrafos: [
        `Proporcionar información veraz y mantenerla actualizada; utilizar la plataforma de forma lícita; ser el único ` +
          `responsable por el contenido (textos, imágenes, productos, ofertas, precios y mensajes) que publique o envíe a ` +
          `través de la plataforma; respetar los derechos de terceros; obtener el consentimiento de sus clientas para el ` +
          `envío de mensajes; y efectuar los pagos en los plazos establecidos.`,
        `El CLIENTE declara y garantiza que los productos difundidos y comercializados son lícitos y de procedencia ` +
          `legítima, asumiendo responsabilidad civil, administrativa y penal íntegra y exclusiva por su origen y ` +
          `comercialización.`,
      ],
    },
    {
      n: 8,
      titulo: 'DE LAS PROHIBICIONES DE CONTENIDO Y DE CONDUCTA',
      paragrafos: [
        `Queda expresamente prohibido al CLIENTE publicar, difundir, exhibir, almacenar o enviar, a través de la plataforma o ` +
          `de los canales vinculados a ella (catálogo, Portal de la Clienta, WhatsApp y afines), cualquier anuncio, imagen, ` +
          `video, audio o texto de naturaleza sexual, pornográfica, erótica o sugerente, de forma explícita o implícita, que ` +
          `involucre a personas adultas, así como la oferta, intermediación o difusión de servicios de naturaleza sexual.`,
        `Queda terminantemente prohibida, por constituir un ilícito penal, la publicación, difusión o divulgación de ` +
          `cualquier contenido que involucre, represente, exhiba, sugiera, simule o explote a un niño, niña o adolescente ` +
          `(persona menor de 18 años) en un contexto, escena o situación de naturaleza sexual, erótica o pornográfica, aunque ` +
          `sea de forma implícita, simulada o mediante montaje, en los términos de la Ley brasileña nº 8.069/1990 (Estatuto ` +
          `de la Niñez y la Adolescencia).`,
        `La constatación de cualquiera de las conductas prohibidas en este apartado dará lugar a la desactivación inmediata ` +
          `del acceso y a la rescisión de este contrato por justa causa, independientemente de aviso previo y sin derecho a ` +
          `reembolso, sin perjuicio de la comunicación a las autoridades competentes y de la responsabilidad civil y penal ` +
          `exclusiva del CLIENTE, quien se obliga a eximir e indemnizar al PROVEEDOR por cualesquiera daños, pérdidas, multas ` +
          `o reclamaciones derivadas de ello.`,
      ],
    },
    {
      n: 9,
      titulo: 'DE LA PROTECCIÓN DE DATOS (LGPD)',
      paragrafos: [
        `Las partes se comprometen a tratar los datos personales de conformidad con la Ley brasileña nº 13.709/2018 (Ley ` +
          `General de Protección de Datos de Brasil — LGPD). En cuanto a los datos de las clientas finales ingresados por el ` +
          `CLIENTE, este actúa como RESPONSABLE del tratamiento y el PROVEEDOR como ENCARGADO, tratándolos exclusivamente ` +
          `para la ejecución de este contrato y conforme a las instrucciones del CLIENTE.`,
        `El CLIENTE es responsable de contar con base legal para el tratamiento y el envío de comunicaciones a sus clientas.`,
      ],
    },
    {
      n: 10,
      titulo: 'DE LA PROPIEDAD INTELECTUAL',
      paragrafos: [
        `La plataforma, marca, diseño y software del PROVEEDOR son de su propiedad exclusiva, concediéndose al CLIENTE ` +
          `únicamente la licencia de uso aquí pactada. El contenido y los datos ingresados por el CLIENTE siguen siendo de su ` +
          `titularidad.`,
      ],
    },
    {
      n: 11,
      titulo: 'DE LA ACEPTACIÓN ELECTRÓNICA',
      paragrafos: [
        `Las partes reconocen la validez y eficacia de la aceptación electrónica de este contrato, manifestada por el ` +
          `CLIENTE, a través de su gestor(a), mediante una acción afirmativa en la plataforma ("Leí y acepto"), con registro ` +
          `de fecha, hora y dirección IP, en los términos del art. 10, §2º, de la Medida Provisoria brasileña nº 2.200-2/2001, ` +
          `quedando dispensada la firma física.`,
      ],
    },
    {
      n: 12,
      titulo: 'DEL FUERO',
      paragrafos: [
        `Las partes eligen el fuero de la Comarca de ${e.cidadeForo}, Brasil, para dirimir cualquier duda o litigio derivado ` +
          `del presente contrato, con renuncia a cualquier otro, por más privilegiado que sea.`,
      ],
    },
  ],
}

export function montarContrato(input: ContratoInput = {}): ContratoMontado {
  const idioma = resolverIdioma(input.idioma)
  const e = EMPRESA
  const ct = input.contratante
  const plano = input.plano ?? null
  const valorBrl = brl(plano?.valor)
  const valor = valorBrl ? `${valorBrl} (plano ${plano!.nome})` : valorFallback(idioma)

  const qualificacao = QUALIFICACAO_BUILDERS[idioma](e, ct)
  const clausulas = CLAUSULA_BUILDERS[idioma](e, ct, valor)

  const aceite = input.aceite
    ? { aceitoEm: input.aceite.aceitoEm.toISOString(), ip: input.aceite.ip ?? null, versao: input.aceite.versao }
    : null

  return {
    versao: CONTRATO_VERSAO,
    idioma,
    titulo: TITULOS[idioma],
    empresa: e,
    contratante: ct ?? null,
    plano,
    qualificacao,
    clausulas,
    aceite,
  }
}

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

/** Dados cadastrais da CONTRATADA (ZAIEZE). */
export const EMPRESA = {
  nome: 'GEDEAN JOHN ASSESSORIA E CONSULTORIA EMPRESARIAL LTDA',
  cnpj: '43.391.734/0001-51',
  endereco: 'Rua Dinamarca, nº 689, apto 10, Jardim Europa, Goiânia/GO, CEP 74330-050',
  representante: 'GEDEAN JOHN GAZOLA, Sócio-Administrador, CPF 028.918.094-59',
  cidadeForo: 'Goiânia/GO',
  produto: 'Zaieze Sistemas Inteligentes para a Moda',
} as const

const PLACEHOLDER = '_________________________________'

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
}

export interface ClausulaContrato {
  n: number
  titulo: string
  paragrafos: string[]
}

export interface ContratoMontado {
  versao: string
  titulo: string
  empresa: typeof EMPRESA
  contratante: ContratanteData | null
  plano: { nome: string; valor: number } | null
  qualificacao: string[]
  clausulas: ClausulaContrato[]
  aceite: { aceitoEm: string; ip: string | null; versao: string } | null
}

function brl(v?: number) {
  if (v == null) return 'o valor do plano contratado'
  return `R$ ${v.toFixed(2).replace('.', ',')}`
}

function dominioRede(slug?: string) {
  return slug ? `${slug}.zaieze.com` : '[seu-endereço].zaieze.com'
}

export function montarContrato(input: ContratoInput = {}): ContratoMontado {
  const e = EMPRESA
  const ct = input.contratante
  const plano = input.plano ?? null
  const valor = plano ? `${brl(plano.valor)} (plano ${plano.nome})` : 'o valor do plano contratado'

  const qualificacao = [
    `CONTRATADA: ${e.nome}, inscrita no CNPJ sob o nº ${e.cnpj}, com sede em ${e.endereco}, neste ato representada na ` +
      `forma de seus atos constitutivos por ${e.representante}, doravante denominada simplesmente CONTRATADA.`,
    `CONTRATANTE: ${ct?.redeNome ?? PLACEHOLDER}, marca/estabelecimento responsável pela operação em ${dominioRede(ct?.slug)}, ` +
      `neste ato representada pelo(a) gestor(a) ${ct?.gestorNome ?? PLACEHOLDER}, e-mail ${ct?.gestorEmail ?? PLACEHOLDER}, ` +
      `doravante denominada simplesmente CONTRATANTE.`,
    `As partes acima qualificadas têm, entre si, justo e contratado o presente Contrato de Licença de Uso e Prestação de ` +
      `Serviços de Software como Serviço (SaaS), que se regerá pelas cláusulas e condições seguintes.`,
  ]

  const clausulas: ClausulaContrato[] = [
    {
      n: 1,
      titulo: 'DO OBJETO',
      paragrafos: [
        `O presente contrato tem por objeto a concessão, pela CONTRATADA, de licença de uso, não exclusiva e intransferível, ` +
          `da plataforma ${e.produto} — sistema de gestão de vendas, relacionamento (CRM), atendimento por WhatsApp, estoque e ` +
          `catálogo/Portal do Cliente —, hospedada e disponibilizada à CONTRATANTE em ambiente próprio (${dominioRede(ct?.slug)}).`,
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
  ]

  const aceite = input.aceite
    ? { aceitoEm: input.aceite.aceitoEm.toISOString(), ip: input.aceite.ip ?? null, versao: input.aceite.versao }
    : null

  return {
    versao: CONTRATO_VERSAO,
    titulo: 'CONTRATO DE LICENÇA DE USO E PRESTAÇÃO DE SERVIÇOS (SaaS)',
    empresa: e,
    contratante: ct ?? null,
    plano,
    qualificacao,
    clausulas,
    aceite,
  }
}

/**
 * Contrato de Credenciamento — plano "Corretor(a) de Moda". Aceito eletronicamente no
 * cadastro (checkout público), antes do pagamento.
 *
 * ⚠️ RASCUNHO — não revisado por advogado. Revise com jurídico antes de depender deste
 * texto para fins legais. Ao alterar de forma relevante, incremente CONTRATO_ASSESSOR_VERSAO.
 *
 * Ponto central pedido pelo negócio: a ZAIEZE é só a plataforma tecnológica (subdomínio,
 * vitrine, catálogo em PDF, painel de comissões) — não participa, não intermedeia e não se
 * responsabiliza pela relação comercial entre a corretora e as marcas que ela representa
 * (compra, venda, comissão combinada, entrega, qualidade, garantia, tributos etc.).
 */
import { EMPRESA } from '../contrato/contrato.template'

export const CONTRATO_ASSESSOR_VERSAO = '1.1-2026-07'

export interface ClausulaContratoAssessor {
  n: number
  titulo: string
  paragrafos: string[]
}

export interface ContratoAssessorMontado {
  versao: string
  titulo: string
  empresa: typeof EMPRESA
  qualificacao: string[]
  clausulas: ClausulaContratoAssessor[]
}

export function montarContratoAssessor(): ContratoAssessorMontado {
  return {
    versao: CONTRATO_ASSESSOR_VERSAO,
    titulo: 'Contrato de Credenciamento — Corretor(a) de Moda',
    empresa: EMPRESA,
    qualificacao: [
      `De um lado, ${EMPRESA.nome}, CNPJ ${EMPRESA.cnpj}, com sede em ${EMPRESA.endereco}, doravante "ZAIEZE".`,
      'De outro lado, a pessoa que aceita eletronicamente este contrato no ato do cadastro como Corretor(a) de Moda, doravante "CORRETOR(A)".',
    ],
    clausulas: [
      {
        n: 1,
        titulo: 'Objeto',
        paragrafos: [
          'A ZAIEZE disponibiliza à CORRETOR(A), mediante assinatura mensal, uma ferramenta de tecnologia composta por: um subdomínio próprio (endereço.zaieze.com), uma página pública ("vitrine") para apresentação e divulgação das marcas que a CORRETOR(A) representa, geração de catálogo em PDF com links de contato, e um painel para lançamento manual de vendas e comissões.',
          'O serviço da ZAIEZE limita-se à disponibilização dessa ferramenta. A ZAIEZE não é fornecedora, fabricante, distribuidora, representante comercial ou intermediária de nenhuma marca ou produto divulgado pela CORRETOR(A).',
        ],
      },
      {
        n: 2,
        titulo: 'Isenção quanto à relação comercial com as marcas representadas',
        paragrafos: [
          'A CORRETOR(A) reconhece que a relação de representação comercial, agenciamento ou parceria estabelecida entre ela e cada marca divulgada na sua vitrine é ajustada exclusivamente entre a CORRETOR(A) e a respectiva marca, por fora da plataforma.',
          'A ZAIEZE não participa, não intermedeia, não referenda e não se responsabiliza, em nenhuma hipótese, por: (i) a existência, validade ou os termos de qualquer acordo comercial ou percentual de comissão entre a CORRETOR(A) e as marcas; (ii) o pagamento, repasse ou eventual inadimplemento de comissões entre as partes; (iii) a qualidade, autenticidade, procedência, entrega ou garantia dos produtos das marcas divulgadas; (iv) tributos, emissão de notas fiscais ou qualquer obrigação fiscal decorrente das vendas realizadas pela CORRETOR(A) ou pelas marcas.',
          'Os valores de vendas e comissões lançados pela CORRETOR(A) no painel são de exclusiva responsabilidade dela, servindo apenas como registro pessoal — a ZAIEZE não audita, garante ou se responsabiliza pela exatidão desses lançamentos.',
        ],
      },
      {
        n: 3,
        titulo: 'Cadastro e conteúdo',
        paragrafos: [
          'A CORRETOR(A) é integralmente responsável pela veracidade das informações e imagens que cadastrar (perfil próprio e cartões de marca), inclusive por eventual uso indevido de marca, logotipo ou imagem de terceiros sem autorização.',
          'A ZAIEZE pode remover conteúdo ou suspender a conta em caso de uso indevido, denúncia procedente ou violação da lei ou deste contrato.',
        ],
      },
      {
        n: 4,
        titulo: 'Assinatura, pagamento e cancelamento',
        paragrafos: [
          'A assinatura é mensal, recorrente, sem fidelidade, processada via Mercado Pago. O valor vigente é informado no cadastro e pode ser reajustado mediante aviso prévio.',
          'A CORRETOR(A) pode cancelar a qualquer momento pelo próprio painel. O acesso à ferramenta permanece disponível até o fim do ciclo mensal já pago; não há reembolso proporcional.',
          'O não pagamento da mensalidade recorrente implica a suspensão do acesso à ferramenta ao fim do ciclo vigente.',
        ],
      },
      {
        n: 5,
        titulo: 'Disposições gerais',
        paragrafos: [
          'Este contrato não cria vínculo empregatício, societário ou de representação comercial entre a ZAIEZE e a CORRETOR(A) — a relação é estritamente de licenciamento de uso de uma ferramenta de tecnologia.',
          `Fica eleito o foro da comarca de ${EMPRESA.cidadeForo} para dirimir quaisquer controvérsias oriundas deste contrato.`,
        ],
      },
    ],
  }
}

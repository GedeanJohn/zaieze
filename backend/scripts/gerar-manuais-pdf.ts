/**
 * Gera os manuais em PDF no formato 16:9 (slide), um por papel (gestor, vendedora, gestor de estoque),
 * com a marca d'água ZAIEZE em todas as páginas. Rode com: npx tsx scripts/gerar-manuais-pdf.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'

const RAIZ = path.resolve(process.cwd(), '..')
const LOGO = path.join(RAIZ, 'frontend', 'public', 'zaieze-preto.png')
const FONTE = path.join(RAIZ, 'frontend', 'public', 'fonts', 'nusar.otf')
const SAIDA = path.join(RAIZ, 'manuais')

const W = 960, H = 540 // 16:9

interface Slide { titulo: string; subtitulo?: string; bullets?: string[]; nota?: string; capa?: boolean }
interface Deck { arquivo: string; papel: string; slides: Slide[] }

const decks: Deck[] = [
  {
    arquivo: 'Manual-Gestor-ZAIEZE.pdf', papel: 'Gestor',
    slides: [
      { capa: true, titulo: 'Manual do Gestor', subtitulo: 'Portal do Cliente · catálogo, funil de vendas e identidade da marca' },
      { titulo: '1. Coleções e liberação', bullets: [
        'A coleção agrupa as peças (modelo, estampa, tamanho).',
        'Em preparação: o gestor de estoque ainda cadastra — invisível para as vendedoras.',
        'Liberada: aparece para TODAS as vendedoras ao mesmo tempo (catálogo + PDV).',
      ], nota: 'Liberação simultânea = competição justa pelo estoque compartilhado.' },
      { titulo: '2. Catálogo e link da vendedora', bullets: [
        'Cada vendedora tem um link: suamarca.zaieze.com/nome-da-vendedora',
        'Ela distribui para a carteira de clientes dela.',
        'Quem abre cai no WhatsApp dela e vira uma oportunidade no funil.',
        'Você vê e copia todos os links em Funil de vendas → Links das vendedoras.',
      ] },
      { titulo: '3. Funil de atendimento & vendas', bullets: [
        'Cada ciclo de contato é uma oportunidade independente.',
        'Etapas: Entrou → Atendido → Negociando → Convertido / Perdido.',
        'Convertido é automático ao registrar a venda do cliente.',
        'Cliente que voltou após perder abre uma nova oportunidade.',
      ], nota: 'Acompanhe tudo no quadro Kanban com métricas (conversão, atrasados, tempo de resposta).' },
      { titulo: '4. SLA por etapa e redistribuição', bullets: [
        'Você define o tempo máximo em cada etapa (menu Marca).',
        'Estourou o prazo → o card fica "atrasado".',
        'Entrou sem resposta → redistribui (manual ou automático) para a mais ociosa.',
        'Redistribuir move a oportunidade e a carteira do cliente, e reinicia o prazo.',
      ] },
      { titulo: '5. Identidade da marca', bullets: [
        'Logo (PNG/JPG/WEBP/SVG, até 5 MB) e cores aparecem no catálogo público.',
        'Cor primária = botões/CTA; cor secundária = fundo.',
        'Configurado uma vez e vale para todas as lojas da marca.',
      ] },
    ],
  },
  {
    arquivo: 'Manual-Vendedora-ZAIEZE.pdf', papel: 'Vendedora',
    slides: [
      { capa: true, titulo: 'Manual da Vendedora', subtitulo: 'Seu catálogo, seus clientes, suas vendas' },
      { titulo: '1. Seu link do catálogo', bullets: [
        'Vá em Funil de vendas → Meu link do catálogo.',
        'Copie e envie para as suas clientes (WhatsApp, status, bio).',
        'Conecte o seu WhatsApp para receber os contatos.',
      ], nota: 'Quem abre o seu link entra na SUA carteira.' },
      { titulo: '2. Como a cliente entra', bullets: [
        'Ela abre o link e vê as coleções liberadas.',
        'Toca em "Falar com a vendedora" e cai no seu WhatsApp.',
        'Vira uma oportunidade no seu funil automaticamente.',
      ] },
      { titulo: '3. Atender = responder', bullets: [
        'Responda rápido: o cronômetro começa quando a cliente entra.',
        'Ao responder, a oportunidade passa para "Atendido".',
        'Se você demorar, o gestor pode passar a cliente para outra vendedora.',
      ], nota: 'Velocidade no primeiro contato é o que ganha a venda.' },
      { titulo: '4. Toque seu funil', bullets: [
        'Mova o card: Atendido → Negociando → Convertido / Perdido.',
        'Convertido acontece sozinho quando você registra a venda da cliente.',
        'Perdeu? Sem problema — se ela voltar, abre um novo ciclo.',
      ] },
      { titulo: '5. Vender da coleção', bullets: [
        'Só aparecem as coleções já liberadas pelo gestor de estoque.',
        'O estoque é compartilhado: quem fecha primeiro leva a peça.',
        'Registre a venda como Online (WhatsApp) para contar no seu resultado.',
      ] },
    ],
  },
  {
    arquivo: 'Manual-Gestor-de-Estoque-ZAIEZE.pdf', papel: 'Gestor de Estoque',
    slides: [
      { capa: true, titulo: 'Manual do Gestor de Estoque', subtitulo: 'Coleções: do cadastro à liberação' },
      { titulo: '1. Crie a coleção', bullets: [
        'Vá em Coleções → Nova coleção (ex.: "Verão 2026").',
        'Ela nasce "Em preparação".',
        'Nesse estado, ninguém da equipe de vendas a enxerga.',
      ] },
      { titulo: '2. Cadastre as peças', bullets: [
        'Vá em Produtos e cadastre cada modelo escolhendo a coleção.',
        'Monte a grade (cor × tamanho), preços e fotos.',
        'A referência e o SKU são sugeridos automaticamente.',
      ] },
      { titulo: '3. Por que não aparece ainda', bullets: [
        'Em preparação fica invisível para as vendedoras (catálogo e PDV).',
        'Isso evita que uma vendedora largue na frente.',
        'As vendedoras disputam o mesmo estoque — tem que ser justo.',
      ], nota: 'A coleção só "abre" quando você liberar.' },
      { titulo: '4. Libere a coleção', bullets: [
        'Em Coleções, clique em "liberar" na coleção pronta.',
        'Ela passa a aparecer para TODAS as vendedoras no mesmo instante.',
        'A partir daí elas podem mostrar no catálogo e vender no PDV.',
      ] },
      { titulo: '5. Precisa corrigir?', bullets: [
        'Use "recolher" para tirar a coleção do ar novamente.',
        'Ajuste as peças em Produtos e libere de novo quando estiver ok.',
      ] },
    ],
  },
]

function renderDeck(deck: Deck) {
  const doc = new PDFDocument({ size: [W, H], margin: 0 })
  const temFonte = fs.existsSync(FONTE)
  if (temFonte) doc.registerFont('NUSAR', FONTE)
  const fonteTitulo = temFonte ? 'NUSAR' : 'Helvetica-Bold'
  const temLogo = fs.existsSync(LOGO)

  doc.pipe(fs.createWriteStream(path.join(SAIDA, deck.arquivo)))

  deck.slides.forEach((s, i) => {
    if (i > 0) doc.addPage({ size: [W, H], margin: 0 })
    // Fundo branco
    doc.rect(0, 0, W, H).fill('#ffffff')

    // Marca d'água (logo central, bem suave)
    if (temLogo) {
      doc.save(); doc.opacity(s.capa ? 0.12 : 0.05)
      doc.image(LOGO, 0, 0, { fit: [s.capa ? 520 : 460, s.capa ? 320 : 300], align: 'center', valign: 'center' })
      doc.restore(); doc.opacity(1)
    }

    if (s.capa) {
      doc.fillColor('#111111').font(fonteTitulo).fontSize(46).text(s.titulo, 80, 250, { width: W - 160, align: 'center' })
      if (s.subtitulo) doc.font('Helvetica').fontSize(16).fillColor('#555').text(s.subtitulo, 80, 320, { width: W - 160, align: 'center' })
      doc.font('Helvetica').fontSize(11).fillColor('#999').text('ZAIEZE · Sistemas Inteligentes para a Moda', 0, H - 60, { width: W, align: 'center' })
      return
    }

    // Título + régua
    doc.fillColor('#111111').font(fonteTitulo).fontSize(32).text(s.titulo, 70, 64, { width: W - 140 })
    doc.moveTo(70, 120).lineTo(W - 70, 120).lineWidth(1).strokeColor('#111111').stroke()

    // Bullets
    let y = 160
    doc.font('Helvetica').fontSize(17).fillColor('#222')
    for (const b of s.bullets ?? []) {
      doc.fillColor('#111111').text('•', 70, y)
      const h = doc.heightOfString(b, { width: W - 170 })
      doc.fillColor('#222').text(b, 95, y, { width: W - 170 })
      y += h + 14
    }

    // Nota
    if (s.nota) {
      const ny = Math.max(y + 6, H - 110)
      doc.rect(70, ny, W - 140, 56).fill('#f2f2f2')
      doc.rect(70, ny, 4, 56).fill('#111111')
      doc.font('Helvetica-Oblique').fontSize(14).fillColor('#444').text(s.nota, 90, ny + 16, { width: W - 200 })
    }

    // Rodapé
    doc.font('Helvetica').fontSize(10).fillColor('#aaa')
      .text(`ZAIEZE · Manual do ${deck.papel}`, 70, H - 36)
      .text(`${i}/${deck.slides.length - 1}`, W - 120, H - 36, { width: 50, align: 'right' })
  })

  doc.end()
  return new Promise<void>((resolve) => doc.on('end', resolve))
}

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true })
  for (const deck of decks) {
    await renderDeck(deck)
    console.log(`✓ ${deck.arquivo}`)
  }
  console.log(`\nManuais gerados em: ${SAIDA}`)
}

main()

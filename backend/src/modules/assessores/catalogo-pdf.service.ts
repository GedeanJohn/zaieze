import PDFDocument from 'pdfkit'

export interface AssessorCapaPdf {
  nome: string
  bio: string | null
  whatsapp: string | null
  instagram: string | null
  site: string | null
}

export interface MarcaCatalogoPdf {
  nome: string
  descricao: string | null
  formasPagamento: string | null
  modoEnvio: string | null
  condicoesCompra: string | null
  tamanhos: string | null
  valores: string | null
  endereco: string | null
  cnpj: string | null
  instagram: string | null
  facebook: string | null
  whatsapp: string | null
  telegram: string | null
  tiktok: string | null
  site: string | null
}

const INK = '#1a1a1a', SOFT = '#666666', WINE = '#8a1f2b', LINE = '#dddddd'

function bullets(texto: string | null): string[] {
  return (texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
}

function linkWhatsapp(numero: string): string {
  return `https://wa.me/${numero.replace(/\D/g, '')}`
}

/** Gera o catálogo em PDF (A4, uma página por marca) com links clicáveis — capa de apresentação
 *  da assessora + um cartão por marca ativa, no mesmo padrão de campos da vitrine web. */
export function gerarCatalogoPdf(assessor: AssessorCapaPdf, marcas: MarcaCatalogoPdf[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const L = 40, R = 555

    // ── Capa: apresentação da assessora ──
    doc.font('Helvetica-Bold').fontSize(11).fillColor(WINE).text('ASSESSOR(A) DE MODA', L, 200, { width: R - L, align: 'center' })
    doc.font('Helvetica-Bold').fontSize(30).fillColor(INK).text(assessor.nome, L, doc.y + 8, { width: R - L, align: 'center' })
    if (assessor.bio) {
      doc.font('Helvetica').fontSize(12).fillColor(SOFT).text(assessor.bio, L + 60, doc.y + 20, { width: R - L - 120, align: 'center' })
    }
    let cy = doc.y + 30
    const contatos: { rot: string; url: string }[] = []
    if (assessor.whatsapp) contatos.push({ rot: 'WhatsApp', url: linkWhatsapp(assessor.whatsapp) })
    if (assessor.instagram) contatos.push({ rot: 'Instagram', url: assessor.instagram })
    if (assessor.site) contatos.push({ rot: 'Site', url: assessor.site })
    if (contatos.length) {
      const largura = (R - L) / contatos.length
      contatos.forEach((c, i) => {
        doc.font('Helvetica-Bold').fontSize(12).fillColor(WINE)
          .text(c.rot, L + i * largura, cy, { width: largura, align: 'center', link: c.url, underline: true })
      })
      cy += 24
    }
    doc.font('Helvetica').fontSize(9).fillColor('#bbbbbb').text('Catálogo · powered by ZAIEZE', L, 780, { width: R - L, align: 'center' })

    // ── Uma página por marca ──
    for (const m of marcas) {
      doc.addPage()
      let y = 50
      doc.font('Helvetica-Bold').fontSize(20).fillColor(INK).text(m.nome, L, y, { width: R - L })
      y = doc.y + 6
      doc.moveTo(L, y).lineTo(R, y).lineWidth(1.5).strokeColor(INK).stroke()
      y += 14

      const colEsqW = 300
      const yInicioColunas = y
      let yEsq = y

      const bloco = (titulo: string, itens: string[]) => {
        if (itens.length === 0) return
        doc.font('Helvetica-Bold').fontSize(9).fillColor(SOFT).text(titulo.toUpperCase(), L, yEsq, { width: colEsqW })
        yEsq = doc.y + 2
        doc.font('Helvetica').fontSize(11).fillColor(INK)
        for (const item of itens) {
          doc.text(`•  ${item}`, L, yEsq, { width: colEsqW })
          yEsq = doc.y + 2
        }
        yEsq += 10
      }
      bloco('Descrição', bullets(m.descricao))
      bloco('Formas de pagamento', bullets(m.formasPagamento))
      bloco('Modo de envio', bullets(m.modoEnvio))
      bloco('Condições de compra', bullets(m.condicoesCompra))

      let yDir = yInicioColunas
      const colDirX = L + colEsqW + 30
      const colDirW = R - colDirX
      const campo = (rot: string, valor: string | null) => {
        if (!valor) return
        doc.font('Helvetica-Bold').fontSize(9).fillColor(SOFT).text(rot.toUpperCase(), colDirX, yDir, { width: colDirW })
        doc.font('Helvetica').fontSize(11).fillColor(INK).text(valor, colDirX, doc.y + 2, { width: colDirW })
        yDir = doc.y + 12
      }
      campo('Tamanhos', m.tamanhos)
      campo('Valores', m.valores)
      campo('Endereço', m.endereco)
      campo('CNPJ', m.cnpj)

      // ── Botões de contato (clicáveis) no rodapé da página ──
      const botoes: { rot: string; url: string }[] = []
      if (m.whatsapp) botoes.push({ rot: 'WhatsApp', url: linkWhatsapp(m.whatsapp) })
      if (m.instagram) botoes.push({ rot: 'Instagram', url: m.instagram })
      if (m.facebook) botoes.push({ rot: 'Facebook', url: m.facebook })
      if (m.telegram) botoes.push({ rot: 'Telegram', url: m.telegram })
      if (m.tiktok) botoes.push({ rot: 'TikTok', url: m.tiktok })
      if (m.site) botoes.push({ rot: 'Site', url: m.site })

      let yBotoes = Math.max(yEsq, yDir, 700)
      if (yBotoes > 740) yBotoes = 740 // mantém os botões dentro da página, mesmo com texto longo
      doc.moveTo(L, yBotoes).lineTo(R, yBotoes).lineWidth(0.5).strokeColor(LINE).stroke()
      yBotoes += 12
      let bx = L
      const larguraBotao = 85
      for (const b of botoes) {
        doc.roundedRect(bx, yBotoes, larguraBotao, 26, 4).fill(b.rot === 'WhatsApp' ? '#25d366' : INK)
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
          .text(b.rot, bx, yBotoes + 8, { width: larguraBotao, align: 'center', link: b.url })
        bx += larguraBotao + 8
      }

      doc.font('Helvetica').fontSize(9).fillColor('#bbbbbb').text('powered by ZAIEZE', L, 780, { width: R - L, align: 'center' })
    }

    doc.end()
  })
}

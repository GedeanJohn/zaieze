import PDFDocument from 'pdfkit'

/** Formata como moeda BR sem depender de ICU/locale (R$ 1.234,56). */
function real(v: unknown): string {
  const [int, dec] = Number(v ?? 0).toFixed(2).split('.')
  return 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec
}
function dataBR(d: Date): string {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export interface VendaPdf {
  id: string
  createdAt: Date
  total: unknown
  desconto: unknown
  descontoPct: unknown
  atacado: boolean
  formaRecebimento: string
  observacao?: string | null
  cliente?: { nome: string; telefone: string } | null
  vendedora: { nome: string }
  loja: { nome: string; rede: { nome: string } }
  itens: { quantidade: number; precoUnitario: unknown; variacao: { cor: string; estampa: string; tamanho: string; produto: { nome: string; referencia: string | null } } }[]
}

const ROTULO_FORMA: Record<string, string> = {
  DINHEIRO: 'Dinheiro', PIX: 'Pix', DEBITO: 'Cartão de débito', CREDITO: 'Cartão de crédito', OUTRO: 'Outro',
}

const INK = '#1a1a1a', SOFT = '#666666', LINE = '#dddddd'

/** Gera o comprovante de pedido em PDF (A4) e devolve o Buffer. */
export function gerarPedidoPdf(v: VendaPdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const L = 40, R = 555 // margens de conteúdo (A4 = 595pt)
    const numero = v.id.slice(-6).toUpperCase()

    // ── Cabeçalho ──
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(22).text(v.loja.rede.nome.toUpperCase(), L, 44, { width: 320 })
    doc.font('Helvetica').fontSize(11).fillColor(SOFT).text(v.loja.nome, L, doc.y + 2, { width: 320 })

    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(`Pedido ${numero}`, R - 200, 46, { width: 200, align: 'right' })
    doc.font('Helvetica').fontSize(10).fillColor(SOFT).text(dataBR(v.createdAt), R - 200, doc.y + 1, { width: 200, align: 'right' })
    doc.font('Helvetica-Bold').fontSize(10).fillColor(v.atacado ? '#111111' : SOFT)
      .text(v.atacado ? 'ATACADO' : 'VAREJO', R - 200, doc.y + 2, { width: 200, align: 'right' })

    let y = 96
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1.5).strokeColor(INK).stroke()
    y += 16

    // ── Cliente / Vendedora ──
    doc.font('Helvetica').fontSize(8).fillColor(SOFT).text('CLIENTE', L, y)
    doc.text('VENDEDORA', L + 280, y)
    doc.font('Helvetica').fontSize(12).fillColor(INK).text(v.cliente?.nome ?? 'Consumidor avulso', L, y + 11, { width: 270 })
    doc.text(v.vendedora.nome, L + 280, y + 11, { width: 230 })
    if (v.cliente?.telefone) doc.font('Helvetica').fontSize(10).fillColor(SOFT).text(v.cliente.telefone, L, y + 27)
    y += 48

    // ── Tabela de itens ──
    const cX = { prod: L, var: 250, qtd: 380, preco: 430, sub: 495 }
    const cW = { prod: 200, var: 120, qtd: 40, preco: 60, sub: 60 }
    doc.font('Helvetica').fontSize(8).fillColor(SOFT)
    doc.text('PRODUTO', cX.prod, y)
    doc.text('VARIAÇÃO', cX.var, y)
    doc.text('QTD', cX.qtd, y, { width: cW.qtd, align: 'right' })
    doc.text('PREÇO', cX.preco, y, { width: cW.preco, align: 'right' })
    doc.text('SUBTOTAL', cX.sub, y, { width: cW.sub, align: 'right' })
    y += 12
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1).strokeColor(LINE).stroke()
    y += 8

    let bruto = 0, pecas = 0
    for (const it of v.itens) {
      const sub = Number(it.precoUnitario) * it.quantidade
      bruto += sub; pecas += it.quantidade
      const variacao = [it.variacao.cor, it.variacao.estampa, it.variacao.tamanho].filter(Boolean).join(' / ')
      const nome = it.variacao.produto.nome + (it.variacao.produto.referencia ? `\nRef. ${it.variacao.produto.referencia}` : '')

      doc.font('Helvetica').fontSize(10).fillColor(INK)
      const hNome = doc.heightOfString(nome, { width: cW.prod })
      const hVar = doc.heightOfString(variacao || '—', { width: cW.var })
      const hRow = Math.max(hNome, hVar, 16)

      // quebra de página
      if (y + hRow > 770) { doc.addPage(); y = 50 }

      doc.fillColor(INK).text(nome, cX.prod, y, { width: cW.prod })
      doc.fillColor(SOFT).text(variacao || '—', cX.var, y, { width: cW.var })
      doc.fillColor(INK).text(String(it.quantidade), cX.qtd, y, { width: cW.qtd, align: 'right' })
      doc.text(real(it.precoUnitario), cX.preco, y, { width: cW.preco, align: 'right' })
      doc.text(real(sub), cX.sub, y, { width: cW.sub, align: 'right' })
      y += hRow + 8
      doc.moveTo(L, y - 4).lineTo(R, y - 4).lineWidth(0.5).strokeColor('#f0f0f0').stroke()
    }

    // ── Totais ──
    y += 10
    const tx = 360, tw = R - tx
    const linhaTotal = (rot: string, val: string, neg = false) => {
      doc.font('Helvetica').fontSize(11).fillColor(neg ? '#c62828' : SOFT).text(rot, tx, y, { width: tw - 90 })
      doc.fillColor(neg ? '#c62828' : INK).text(val, tx, y, { width: tw, align: 'right' })
      y += 16
    }
    linhaTotal('Peças', String(pecas))
    linhaTotal('Subtotal', real(bruto))
    if (Number(v.desconto) > 0) linhaTotal(`Desconto (${Number(v.descontoPct)}%)`, '- ' + real(v.desconto), true)
    doc.moveTo(tx, y).lineTo(R, y).lineWidth(1.5).strokeColor(INK).stroke()
    y += 8
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text('Total', tx, y, { width: tw - 110 })
    doc.text(real(v.total), tx, y, { width: tw, align: 'right' })
    y += 24
    doc.font('Helvetica').fontSize(10).fillColor(SOFT)
      .text('Pagamento', tx, y, { width: tw - 110 })
      .text(ROTULO_FORMA[v.formaRecebimento] ?? v.formaRecebimento, tx, y, { width: tw, align: 'right' })
    y += 24

    // ── Observação ──
    if (v.observacao) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Observações:', L, y)
      doc.font('Helvetica').fillColor(SOFT).text(v.observacao, L, doc.y + 2, { width: R - L })
      y = doc.y
    }

    // ── Rodapé (logo após o conteúdo, na mesma página) ──
    doc.font('Helvetica').fontSize(9).fillColor('#bbbbbb')
      .text(`${v.loja.rede.nome} · powered by ZAIEZE`, L, y + 24, { width: R - L, align: 'center' })

    doc.end()
  })
}

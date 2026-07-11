import PDFDocument from 'pdfkit'
import ExcelJS from 'exceljs'

export interface LinhaVendaAssessora {
  data: Date
  marca: string
  valorVenda: number
  percentualComissao: number
  totalComissao: number
}

// timeZone: 'UTC' — `data` é um campo só-de-dia (guardado como meia-noite UTC); sem isso, em
// fusos atrás de UTC (ex.: Brasil) o dia exibido volta um dia perto da meia-noite local.
const dataBR = (d: Date) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
const real = (v: number) => {
  const [int, dec] = v.toFixed(2).split('.')
  return 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec
}

/** CSV separado por ; (padrão Excel-BR), campos entre aspas. */
export function exportarCsv(linhas: LinhaVendaAssessora[]): string {
  const cab = ['Data', 'Marca', 'Valor da Venda', 'Percentual de Comissão', 'Total de Comissão']
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const corpo = linhas.map((l) => [
    dataBR(l.data), esc(l.marca), l.valorVenda.toFixed(2).replace('.', ','),
    l.percentualComissao.toFixed(2).replace('.', ',') + '%', l.totalComissao.toFixed(2).replace('.', ','),
  ].join(';'))
  return '﻿' + [cab.join(';'), ...corpo].join('\r\n')
}

/** TXT tabulado (colunas alinhadas por tabulação — abre bem em qualquer editor/planilha). */
export function exportarTxt(linhas: LinhaVendaAssessora[]): string {
  const cab = ['Data', 'Marca', 'Valor da Venda', 'Percentual de Comissão', 'Total de Comissão']
  const corpo = linhas.map((l) => [
    dataBR(l.data), l.marca, real(l.valorVenda), `${l.percentualComissao.toFixed(2)}%`, real(l.totalComissao),
  ].join('\t'))
  return [cab.join('\t'), ...corpo].join('\r\n')
}

export async function exportarXlsx(linhas: LinhaVendaAssessora[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Vendas')
  ws.columns = [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Marca', key: 'marca', width: 28 },
    { header: 'Valor da Venda', key: 'valorVenda', width: 16 },
    { header: 'Percentual de Comissão', key: 'percentualComissao', width: 20 },
    { header: 'Total de Comissão', key: 'totalComissao', width: 16 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const l of linhas) {
    ws.addRow({
      data: dataBR(l.data), marca: l.marca,
      valorVenda: l.valorVenda, percentualComissao: l.percentualComissao / 100, totalComissao: l.totalComissao,
    })
  }
  ws.getColumn('valorVenda').numFmt = '"R$" #,##0.00'
  ws.getColumn('totalComissao').numFmt = '"R$" #,##0.00'
  ws.getColumn('percentualComissao').numFmt = '0.00%'
  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

const INK = '#1a1a1a', SOFT = '#666666', LINE = '#dddddd'

export function exportarPdf(linhas: LinhaVendaAssessora[], nomeAssessor: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const L = 40, R = 555
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Relatório de Vendas', L, 44)
    doc.font('Helvetica').fontSize(11).fillColor(SOFT).text(nomeAssessor, L, doc.y + 2)

    let y = 96
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1.5).strokeColor(INK).stroke()
    y += 14

    const cX = { data: L, marca: L + 70, valor: L + 260, pct: L + 360, total: L + 450 }
    doc.font('Helvetica').fontSize(8).fillColor(SOFT)
    doc.text('DATA', cX.data, y)
    doc.text('MARCA', cX.marca, y)
    doc.text('VALOR DA VENDA', cX.valor, y, { width: 90, align: 'right' })
    doc.text('% COMISSÃO', cX.pct, y, { width: 80, align: 'right' })
    doc.text('TOTAL COMISSÃO', cX.total, y, { width: R - cX.total, align: 'right' })
    y += 12
    doc.moveTo(L, y).lineTo(R, y).lineWidth(1).strokeColor(LINE).stroke()
    y += 8

    let totalGeral = 0
    for (const l of linhas) {
      if (y > 770) { doc.addPage(); y = 50 }
      doc.font('Helvetica').fontSize(10).fillColor(INK)
      doc.text(dataBR(l.data), cX.data, y, { width: 65 })
      doc.text(l.marca, cX.marca, y, { width: 185 })
      doc.text(real(l.valorVenda), cX.valor, y, { width: 90, align: 'right' })
      doc.text(`${l.percentualComissao.toFixed(2)}%`, cX.pct, y, { width: 80, align: 'right' })
      doc.text(real(l.totalComissao), cX.total, y, { width: R - cX.total, align: 'right' })
      totalGeral += l.totalComissao
      y += 18
      doc.moveTo(L, y - 4).lineTo(R, y - 4).lineWidth(0.5).strokeColor('#f0f0f0').stroke()
    }

    y += 10
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
      .text('Total de comissão no período', cX.marca, y, { width: 210 })
      .text(real(totalGeral), cX.total, y, { width: R - cX.total, align: 'right' })

    doc.font('Helvetica').fontSize(9).fillColor('#bbbbbb')
      .text('powered by ZAIEZE', L, 780, { width: R - L, align: 'center' })

    doc.end()
  })
}

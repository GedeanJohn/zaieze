import ExcelJS from 'exceljs'

export interface LinhaZaiezeLead {
  nome: string
  telefone: string | null
  cidade: string | null
  uf: string | null
  redeNome: string
  lojaNome: string
  vendedoraNome: string | null
  origemCanal: string | null
  segmento: string
  entradaEm: Date
}

const dataBR = (d: Date) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
const CABECALHO = ['Nome', 'Telefone', 'Cidade', 'UF', 'Marca', 'Loja', 'Vendedora', 'Canal', 'Segmento', 'Data de Entrada']
const linhaComo = (l: LinhaZaiezeLead) => [
  l.nome, l.telefone ?? '', l.cidade ?? '', l.uf ?? '', l.redeNome, l.lojaNome,
  l.vendedoraNome ?? '', l.origemCanal ?? '', l.segmento, dataBR(l.entradaEm),
]

/** CSV separado por ; (padrão Excel-BR), campos entre aspas. Mesmo padrão de exportar-vendas.ts. */
export function exportarCsv(linhas: LinhaZaiezeLead[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const corpo = linhas.map((l) => linhaComo(l).map(esc).join(';'))
  return '﻿' + [CABECALHO.join(';'), ...corpo].join('\r\n')
}

/** TXT tabulado (colunas alinhadas por tabulação). */
export function exportarTxt(linhas: LinhaZaiezeLead[]): string {
  const corpo = linhas.map((l) => linhaComo(l).join('\t'))
  return [CABECALHO.join('\t'), ...corpo].join('\r\n')
}

export async function exportarXlsx(linhas: LinhaZaiezeLead[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Leads ZAIEZE')
  ws.columns = [
    { header: 'Nome', key: 'nome', width: 26 },
    { header: 'Telefone', key: 'telefone', width: 16 },
    { header: 'Cidade', key: 'cidade', width: 20 },
    { header: 'UF', key: 'uf', width: 6 },
    { header: 'Marca', key: 'redeNome', width: 22 },
    { header: 'Loja', key: 'lojaNome', width: 22 },
    { header: 'Vendedora', key: 'vendedoraNome', width: 22 },
    { header: 'Canal', key: 'origemCanal', width: 18 },
    { header: 'Segmento', key: 'segmento', width: 14 },
    { header: 'Data de Entrada', key: 'entradaEm', width: 16 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const l of linhas) {
    ws.addRow({
      nome: l.nome, telefone: l.telefone ?? '', cidade: l.cidade ?? '', uf: l.uf ?? '',
      redeNome: l.redeNome, lojaNome: l.lojaNome, vendedoraNome: l.vendedoraNome ?? '',
      origemCanal: l.origemCanal ?? '', segmento: l.segmento, entradaEm: dataBR(l.entradaEm),
    })
  }
  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Formato "banco de dados" — CREATE TABLE + INSERT INTO prontos para rodar num Postgres (mesmo
 * shape da tabela `zaiezeleads` do próprio ZAIEZE). Não usa pg_dump (não instalado na imagem da
 * API) — monta os statements na aplicação mesmo.
 */
export function exportarSql(linhas: LinhaZaiezeLead[]): string {
  const criarTabela = `CREATE TABLE IF NOT EXISTS zaiezeleads (
  nome TEXT NOT NULL,
  telefone TEXT,
  cidade TEXT,
  uf TEXT,
  rede_nome TEXT NOT NULL,
  loja_nome TEXT NOT NULL,
  vendedora_nome TEXT,
  origem_canal TEXT,
  segmento TEXT NOT NULL,
  entrada_em DATE NOT NULL
);`
  const sqlStr = (v: string | null) => (v == null ? 'NULL' : `'${v.replace(/'/g, "''")}'`)
  const inserts = linhas.map((l) => {
    const valores = [
      sqlStr(l.nome), sqlStr(l.telefone), sqlStr(l.cidade), sqlStr(l.uf),
      sqlStr(l.redeNome), sqlStr(l.lojaNome), sqlStr(l.vendedoraNome), sqlStr(l.origemCanal),
      sqlStr(l.segmento), `'${new Date(l.entradaEm).toISOString().slice(0, 10)}'`,
    ].join(', ')
    return `INSERT INTO zaiezeleads (nome, telefone, cidade, uf, rede_nome, loja_nome, vendedora_nome, origem_canal, segmento, entrada_em) VALUES (${valores});`
  })
  return [criarTabela, '', ...inserts].join('\n')
}

import { prisma } from '../../lib/prisma'

const LOTE = 500

/**
 * Sincroniza a base de leads PRÓPRIA da ZAIEZE a partir de todo `Cliente` ativo (exceto o
 * "Consumidor Outro" sintético) de qualquer marca/rede — cópia agregada, cross-tenant, exportável
 * só pelo SUPER_ADMIN. Roda paginado (cursor por id) para não carregar a base toda em memória.
 * Idempotente: upsert por `clienteId`, então pode rodar de novo a qualquer momento (boot/24h/manual).
 */
export async function sincronizarZaiezeLeads(): Promise<number> {
  let cursor: string | undefined
  let total = 0

  for (;;) {
    const clientes = await prisma.cliente.findMany({
      where: { consumidorOutro: false, ativo: true },
      take: LOTE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true, nome: true, telefone: true, cidade: true, uf: true, segmento: true, createdAt: true,
        loja: { select: { nome: true, rede: { select: { nome: true } } } },
        vendedora: { select: { nome: true } },
        leads: { orderBy: { createdAt: 'asc' }, take: 1, select: { origem: true } },
      },
    })
    if (clientes.length === 0) break

    for (const c of clientes) {
      await prisma.zaiezeLead.upsert({
        where: { clienteId: c.id },
        create: {
          clienteId: c.id, nome: c.nome, telefone: c.telefone, cidade: c.cidade, uf: c.uf,
          redeNome: c.loja.rede.nome, lojaNome: c.loja.nome, vendedoraNome: c.vendedora?.nome ?? null,
          origemCanal: c.leads[0]?.origem ?? null, segmento: c.segmento, entradaEm: c.createdAt,
        },
        update: {
          nome: c.nome, telefone: c.telefone, cidade: c.cidade, uf: c.uf,
          redeNome: c.loja.rede.nome, lojaNome: c.loja.nome, vendedoraNome: c.vendedora?.nome ?? null,
          origemCanal: c.leads[0]?.origem ?? null, segmento: c.segmento,
        },
      })
      total += 1
    }

    cursor = clientes[clientes.length - 1].id
    if (clientes.length < LOTE) break
  }

  return total
}

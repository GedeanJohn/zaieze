// Migra a Vult Tênis (única Rede paga hoje, plano ELITE em cortesia) do modelo antigo
// (Assinatura por Rede) para o novo modelo de assento por vendedora — SEM alterar a experiência
// dela: cria a AssinaturaVendedora da vendedora dela já ATIVA, com o mesmo "grátis até"
// (cicloFimEm) que ela já tem hoje. A Assinatura antiga NÃO é apagada (fica só como histórico
// morto até a Fase 7 remover o model inteiro) — nada aqui depende de removê-la.
//
// Idempotente: se a vendedora já tiver uma AssinaturaVendedora, não duplica.
//
// Uso (a partir de backend/):
//   npx tsx scripts/migrar-vult-tenis.ts            → dry-run (só mostra o que faria)
//   npx tsx scripts/migrar-vult-tenis.ts --apply     → aplica de verdade
import { prisma } from '../src/lib/prisma'
import { cancelarPreapproval } from '../src/modules/assinaturas/mercadopago.service'

const SLUG = 'vulttenis'
const aplicar = process.argv.includes('--apply')

async function main() {
  const rede = await prisma.rede.findUnique({ where: { slug: SLUG } })
  if (!rede) throw new Error(`Rede de slug "${SLUG}" não encontrada.`)

  const assinaturaAntiga = await prisma.assinatura.findUnique({ where: { redeId: rede.id } })
  if (!assinaturaAntiga) throw new Error(`Rede "${rede.nome}" não tem Assinatura (plano) — nada a migrar.`)

  const vendedora = await prisma.usuario.findFirst({
    where: { role: 'VENDEDORA', loja: { redeId: rede.id } },
    orderBy: { createdAt: 'asc' },
  })
  if (!vendedora) throw new Error(`Rede "${rede.nome}" não tem nenhuma VENDEDORA — nada a migrar.`)

  const gestor = await prisma.usuario.findFirst({ where: { redeId: rede.id, role: 'GESTOR' }, orderBy: { createdAt: 'asc' } })
  if (!gestor) throw new Error(`Rede "${rede.nome}" não tem GESTOR — impossível preencher solicitadoPorId.`)

  const jaMigrada = await prisma.assinaturaVendedora.findFirst({ where: { vendedoraId: vendedora.id } })
  if (jaMigrada) {
    console.log(`Vendedora "${vendedora.nome}" (${vendedora.id}) já tem AssinaturaVendedora (${jaMigrada.id}) — nada a fazer.`)
    return
  }

  console.log('── Plano de migração ──')
  console.log(`Rede: ${rede.nome} (${rede.id})`)
  console.log(`Vendedora: ${vendedora.nome} (${vendedora.id})`)
  console.log(`Gestor (solicitadoPorId): ${gestor.nome} (${gestor.id})`)
  console.log('Assinatura antiga (Rede/plano):', {
    id: assinaturaAntiga.id, plano: assinaturaAntiga.plano, valor: assinaturaAntiga.valor.toString(),
    simulada: assinaturaAntiga.simulada, mpPreapprovalId: assinaturaAntiga.mpPreapprovalId,
    primeiraCobrancaEm: assinaturaAntiga.primeiraCobrancaEm, cicloFimEm: assinaturaAntiga.cicloFimEm,
  })
  console.log('Nova AssinaturaVendedora a criar:', {
    redeId: rede.id, vendedoraId: vendedora.id, status: 'ATIVA',
    valor: assinaturaAntiga.valor.toString(), // preserva o valor exato (cortesia = 0) — não usa o preço padrão do assento
    simulada: assinaturaAntiga.simulada, mpPreapprovalId: null,
    primeiraCobrancaEm: assinaturaAntiga.primeiraCobrancaEm, cicloFimEm: assinaturaAntiga.cicloFimEm,
    solicitadoPorId: gestor.id, aprovadoEm: 'now()',
  })

  if (!aplicar) {
    console.log('\nDRY-RUN — nada foi alterado. Rode de novo com --apply para aplicar.')
    return
  }

  await prisma.assinaturaVendedora.create({
    data: {
      redeId: rede.id, vendedoraId: vendedora.id, status: 'ATIVA',
      valor: assinaturaAntiga.valor, simulada: assinaturaAntiga.simulada, mpPreapprovalId: null,
      primeiraCobrancaEm: assinaturaAntiga.primeiraCobrancaEm, cicloFimEm: assinaturaAntiga.cicloFimEm,
      solicitadoPorId: gestor.id, aprovadoEm: new Date(),
    },
  })
  console.log('AssinaturaVendedora criada.')

  // Se por acaso a assinatura antiga tinha uma recorrência REAL no Mercado Pago, cancela — senão
  // ela continuaria sendo cobrada por uma recorrência órfã (não é o caso hoje: mpPreapprovalId
  // está vazio, mas o script cobre isso por segurança caso os dados mudem até a execução real).
  if (assinaturaAntiga.mpPreapprovalId) {
    console.log(`Cancelando preapproval órfão no Mercado Pago: ${assinaturaAntiga.mpPreapprovalId}`)
    await cancelarPreapproval(assinaturaAntiga.mpPreapprovalId).catch((e) => {
      console.error('Falha ao cancelar preapproval antigo (siga manualmente no painel do MP):', e)
    })
  }

  console.log('\n✅ Migração da Vult Tênis concluída.')
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())

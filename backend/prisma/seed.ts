/* Seed de desenvolvimento — hierarquia Rede (marca) → Gestor → Lojas → Gerente → Equipes → Vendedoras */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

type Forma = 'DINHEIRO' | 'PIX' | 'DEBITO' | 'CREDITO' | 'OUTRO'

async function registrarVenda(opts: {
  lojaId: string
  vendedoraId: string
  clienteId?: string
  atacado?: boolean
  formaRecebimento?: Forma
  diasAtras?: number
  itens: { variacaoId: string; quantidade: number; precoUnitario: number }[]
}) {
  const total = opts.itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0)
  const createdAt = new Date()
  createdAt.setDate(createdAt.getDate() - (opts.diasAtras ?? 0))
  createdAt.setHours(10 + Math.floor(Math.random() * 8))

  const venda = await prisma.venda.create({
    data: {
      lojaId: opts.lojaId,
      vendedoraId: opts.vendedoraId,
      clienteId: opts.clienteId,
      atacado: opts.atacado ?? false,
      formaRecebimento: opts.formaRecebimento ?? 'DINHEIRO',
      total,
      createdAt,
      itens: { create: opts.itens },
    },
  })
  for (const item of opts.itens) {
    await prisma.variacaoProduto.update({
      where: { id: item.variacaoId },
      data: { estoque: { decrement: item.quantidade } },
    })
    await prisma.movimentoEstoque.create({
      data: { variacaoId: item.variacaoId, tipo: 'SAIDA_VENDA', quantidade: -item.quantidade, vendaId: venda.id, motivo: 'Venda' },
    })
  }
  if (opts.clienteId) {
    await prisma.cliente.update({
      where: { id: opts.clienteId },
      data: { totalGasto: { increment: total }, ultimaCompraEm: createdAt },
    })
  }
  return venda
}

async function main() {
  console.log('🌱 Seed ModaCRM AI (hierarquia de rede)...')

  await prisma.usuario.upsert({
    where: { email: 'admin@modacrm.com.br' },
    update: {},
    create: {
      nome: 'Admin ModaCRM',
      email: 'admin@modacrm.com.br',
      senhaHash: await bcrypt.hash('admin123', 10),
      role: 'SUPER_ADMIN',
    },
  })

  if (await prisma.rede.findUnique({ where: { slug: 'luna-brand' } })) {
    console.log('Seed já aplicado — nada a fazer.')
    return
  }

  const senha = await bcrypt.hash('demo123', 10)

  // ── Rede (marca) + Gestor ──
  const rede = await prisma.rede.create({
    data: { nome: 'Luna Brand', slug: 'luna-brand', plano: 'ELITE' },
  })
  // Assinatura ativa da rede demo — permite testar online sem passar pelo checkout
  await prisma.assinatura.create({
    data: {
      redeId: rede.id, plano: 'ELITE', status: 'ATIVA', valor: 697, simulada: false,
      cicloFimEm: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    },
  })
  await prisma.usuario.create({
    data: {
      redeId: rede.id, nome: 'Gustavo Prado', email: 'gestor@lunabrand.com.br',
      senhaHash: await bcrypt.hash('gestor123', 10), role: 'GESTOR', telefone: '5562999990010',
    },
  })
  // Estoquista da rede — lança entradas de produção e ajusta o estoque das lojas
  await prisma.usuario.create({
    data: {
      redeId: rede.id, nome: 'Rafael Estoque', email: 'estoquista@lunabrand.com.br',
      senhaHash: await bcrypt.hash('estoque123', 10), role: 'ESTOQUISTA', telefone: '5562999990011',
    },
  })

  // ── Loja 1: Demo Moda (gerente Maria) ──
  const loja = await prisma.loja.create({
    data: { redeId: rede.id, nome: 'Loja Demo Moda', slug: 'loja-demo', telefone: '5562999990000' },
  })
  const maria = await prisma.usuario.create({
    data: {
      lojaId: loja.id, nome: 'Maria Souza', email: 'maria@lojademo.com.br',
      senhaHash: senha, role: 'GERENTE', telefone: '5562999990001',
    },
  })

  const equipeCentro = await prisma.equipe.create({ data: { lojaId: loja.id, nome: 'Equipe Centro' } })
  const equipeOnline = await prisma.equipe.create({ data: { lojaId: loja.id, nome: 'Equipe Online' } })

  const camila = await prisma.usuario.create({
    data: {
      lojaId: loja.id, equipeId: equipeCentro.id, nome: 'Camila Ribeiro', email: 'camila@lojademo.com.br',
      senhaHash: senha, role: 'VENDEDORA', telefone: '5562999990002',
      slugCatalogo: 'camila', metaMensal: 50000, comissaoPadrao: 4,
      waInstancia: 'camila-wa', waNumero: '5562999990002', waConectado: true,
    },
  })
  const ana = await prisma.usuario.create({
    data: {
      lojaId: loja.id, equipeId: equipeOnline.id, nome: 'Ana Lima', email: 'ana@lojademo.com.br',
      senhaHash: senha, role: 'VENDEDORA', telefone: '5562999990003',
      slugCatalogo: 'ana', metaMensal: 40000, comissaoPadrao: 4,
      waInstancia: 'ana-wa', waNumero: '5562999990003', waConectado: true,
    },
  })

  // ── Loja 2: Shopping (gerente Paula) — multi-lojas do plano Elite ──
  const loja2 = await prisma.loja.create({
    data: { redeId: rede.id, nome: 'Loja Shopping Flamboyant', slug: 'loja-shopping', telefone: '5562999990020' },
  })
  await prisma.usuario.create({
    data: {
      lojaId: loja2.id, nome: 'Paula Andrade', email: 'paula@lojashopping.com.br',
      senhaHash: senha, role: 'GERENTE', telefone: '5562999990021',
    },
  })
  const equipeShopping = await prisma.equipe.create({ data: { lojaId: loja2.id, nome: 'Equipe Shopping' } })
  const julia = await prisma.usuario.create({
    data: {
      lojaId: loja2.id, equipeId: equipeShopping.id, nome: 'Júlia Martins', email: 'julia@lojashopping.com.br',
      senhaHash: senha, role: 'VENDEDORA', telefone: '5562999990022',
      slugCatalogo: 'julia', metaMensal: 30000, comissaoPadrao: 4,
    },
  })

  // ── Clientes (Loja 1) ──
  // Todos entram como NOVO de propósito: o segmento "verdadeiro" emerge ao rodar
  // a segmentação automática (botão "Recalcular segmentação"), a partir do histórico abaixo.
  const [cAna, cBia, cCarla, cDani, cDuda] = await Promise.all(
    (
      [
        { nome: 'Ana Paula Castro', telefone: '5562988880001', vendedoraId: camila.id, consentimentoLgpd: true },
        { nome: 'Beatriz Nunes', telefone: '5562988880002', vendedoraId: camila.id, consentimentoLgpd: true },
        { nome: 'Carla Mendes', telefone: '5562988880003', vendedoraId: ana.id, consentimentoLgpd: false },
        { nome: 'Daniela Rocha', telefone: '5562988880004', vendedoraId: ana.id, consentimentoLgpd: true },
        { nome: 'Eduarda Farias (Sacoleira)', telefone: '5562988880005', vendedoraId: camila.id, consentimentoLgpd: true },
      ] as const
    ).map((c) => prisma.cliente.create({ data: { ...c, lojaId: loja.id, segmento: 'NOVO' } })),
  )

  const cShopping = await prisma.cliente.create({
    data: { nome: 'Fernanda Dias', telefone: '5562988880010', lojaId: loja2.id, vendedoraId: julia.id, segmento: 'NOVO', consentimentoLgpd: true },
  })

  // ── Produtos (Loja 1) ──
  const catVestidos = await prisma.categoria.create({ data: { lojaId: loja.id, nome: 'Vestidos' } })
  const catFitness = await prisma.categoria.create({ data: { lojaId: loja.id, nome: 'Fitness' } })
  const marca = await prisma.marca.create({ data: { lojaId: loja.id, nome: 'Luna Brand' } })
  // Coleção liberada (aparece no catálogo/PDV) + uma em preparação (demo do fluxo da estoquista)
  const colecao = await prisma.colecao.create({ data: { lojaId: loja.id, nome: 'Verão 2026', status: 'LIBERADA', liberadaEm: new Date() } })
  const colecaoInverno = await prisma.colecao.create({ data: { lojaId: loja.id, nome: 'Inverno 2026', descricao: 'Em montagem pela estoquista — ainda não liberada.' } })

  const entrada = (qtd: number) => ({ create: { tipo: 'ENTRADA' as const, quantidade: qtd, motivo: 'Estoque inicial' } })

  const luna = await prisma.produto.create({
    data: {
      lojaId: loja.id, referencia: 'LUNA', nome: 'Vestido Luna', genero: 'FEMININO',
      descricao: 'Vestido midi em viscose, modelagem evasê.',
      composicao: '95% viscose, 5% elastano', modelagem: 'Evasê',
      categoriaId: catVestidos.id, marcaId: marca.id, colecaoId: colecao.id,
      fotos: ['https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800', 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800'],
      precoVarejo: 189.9, precoAtacado: 129.9, custo: 78,
      variacoes: {
        create: [
          { cor: 'Preto', tamanho: 'P', estoque: 10, sku: 'LUNA-PRETO-P-0001', movimentos: entrada(10) },
          { cor: 'Branco', tamanho: 'P', estoque: 2, sku: 'LUNA-BRANCO-P-0001', movimentos: entrada(2) },
          { cor: 'Preto', tamanho: 'M', estoque: 40, sku: 'LUNA-PRETO-M-0001', movimentos: entrada(40) },
          { cor: 'Branco', tamanho: 'M', estoque: 8, sku: 'LUNA-BRANCO-M-0001', movimentos: entrada(8) },
        ],
      },
    },
    include: { variacoes: true },
  })

  const legging = await prisma.produto.create({
    data: {
      lojaId: loja.id, referencia: 'POWER', nome: 'Legging Power Fit', genero: 'FEMININO',
      descricao: 'Legging cintura alta com compressão.',
      composicao: '88% poliamida, 12% elastano', modelagem: 'Cintura alta',
      categoriaId: catFitness.id, marcaId: marca.id, colecaoId: colecao.id,
      fotos: ['https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=800'],
      precoVarejo: 119.9, precoAtacado: 79.9, custo: 42,
      variacoes: {
        create: [
          { cor: 'Preto', tamanho: 'P', estoque: 15, sku: 'POWER-PRETO-P-0001', movimentos: entrada(15) },
          { cor: 'Preto', tamanho: 'M', estoque: 20, sku: 'POWER-PRETO-M-0001', movimentos: entrada(20) },
          { cor: 'Grafite', tamanho: 'M', estoque: 1, sku: 'POWER-GRAF-M-0001', movimentos: entrada(1) },
        ],
      },
    },
    include: { variacoes: true },
  })

  const blazer = await prisma.produto.create({
    data: {
      lojaId: loja.id, referencia: 'BLAZER', nome: 'Blazer Alfaiataria Slim', genero: 'FEMININO',
      descricao: 'Blazer estruturado com forro.', modelagem: 'Slim',
      categoriaId: catVestidos.id, marcaId: marca.id, colecaoId: colecao.id,
      fotos: ['https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800'],
      precoVarejo: 299.9, precoAtacado: 209.9, custo: 130,
      variacoes: {
        create: [
          { cor: 'Caramelo', tamanho: 'M', estoque: 30, sku: 'BLAZER-CARAM-M-0001', movimentos: entrada(30) },
          { cor: 'Caramelo', tamanho: 'G', estoque: 4, sku: 'BLAZER-CARAM-G-0001', movimentos: entrada(4) },
        ],
      },
    },
    include: { variacoes: true },
  })

  // Peça da coleção EM PREPARAÇÃO (Inverno 2026): invisível para a vendedora até a estoquista liberar
  await prisma.produto.create({
    data: {
      lojaId: loja.id, referencia: 'TRENCH', nome: 'Trench Coat Clássico', genero: 'FEMININO',
      descricao: 'Trench coat impermeável com cinto.', modelagem: 'Reto',
      categoriaId: catVestidos.id, marcaId: marca.id, colecaoId: colecaoInverno.id,
      fotos: ['https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=800'],
      precoVarejo: 389.9, precoAtacado: 279.9, custo: 170,
      variacoes: {
        create: [
          { cor: 'Bege', tamanho: 'M', estoque: 12, sku: 'TRENCH-BEGE-M-0001', movimentos: entrada(12) },
          { cor: 'Bege', tamanho: 'G', estoque: 6, sku: 'TRENCH-BEGE-G-0001', movimentos: entrada(6) },
        ],
      },
    },
  })

  // Produto ENCALHADO (sem vendas) — alimenta o Radar de Oportunidades
  await prisma.produto.create({
    data: {
      lojaId: loja.id, referencia: 'SAIA', nome: 'Saia Midi Plissada', genero: 'FEMININO',
      descricao: 'Saia midi plissada acetinada.', modelagem: 'Midi',
      categoriaId: catVestidos.id, marcaId: marca.id, colecaoId: colecao.id,
      precoVarejo: 159.9, precoAtacado: 109.9, custo: 62,
      variacoes: {
        create: [
          { cor: 'Vinho', tamanho: 'M', estoque: 8, sku: 'SAIA-VINHO-M-0001', movimentos: entrada(8) },
          { cor: 'Preto', tamanho: 'M', estoque: 6, sku: 'SAIA-PRETO-M-0001', movimentos: entrada(6) },
        ],
      },
    },
  })

  // Produto na Loja 2
  const camisa2 = await prisma.produto.create({
    data: {
      lojaId: loja2.id, referencia: 'LINHO', nome: 'Camisa Linho Premium', genero: 'MASCULINO',
      descricao: 'Camisa de linho com caimento leve.', composicao: '100% linho',
      precoVarejo: 159.9, custo: 65,
      variacoes: {
        create: [
          { cor: 'Off-white', tamanho: 'M', estoque: 10, sku: 'LINHO-OFF-M-0001', movimentos: entrada(10) },
          { cor: 'Off-white', tamanho: 'G', estoque: 7, sku: 'LINHO-OFF-G-0001', movimentos: entrada(7) },
        ],
      },
    },
    include: { variacoes: true },
  })

  // ── Vendas do mês (alimentam o dashboard hierárquico) ──
  const v = (p: { variacoes: { id: string; cor: string; tamanho: string }[] }, cor: string, tam: string) =>
    p.variacoes.find((x) => x.cor === cor && x.tamanho === tam)!.id

  // Camila — Ana Paula → VIP: histórico em 3 meses, acumulado > R$ 3.000
  await registrarVenda({
    lojaId: loja.id, vendedoraId: camila.id, clienteId: cAna.id, diasAtras: 100, formaRecebimento: 'CREDITO',
    itens: [{ variacaoId: v(blazer, 'Caramelo', 'M'), quantidade: 4, precoUnitario: 299.9 }],
  })
  await registrarVenda({
    lojaId: loja.id, vendedoraId: camila.id, clienteId: cAna.id, diasAtras: 55, formaRecebimento: 'CREDITO',
    itens: [{ variacaoId: v(blazer, 'Caramelo', 'M'), quantidade: 4, precoUnitario: 299.9 }],
  })
  await registrarVenda({
    lojaId: loja.id, vendedoraId: camila.id, clienteId: cAna.id, diasAtras: 8, formaRecebimento: 'PIX',
    itens: [{ variacaoId: v(luna, 'Preto', 'M'), quantidade: 4, precoUnitario: 189.9 }],
  })

  // Camila — Beatriz → FREQUENTE: compras em 2 meses dentro de 90 dias, abaixo de R$ 3.000
  await registrarVenda({
    lojaId: loja.id, vendedoraId: camila.id, clienteId: cBia.id, diasAtras: 60, formaRecebimento: 'DEBITO',
    itens: [{ variacaoId: v(luna, 'Branco', 'M'), quantidade: 2, precoUnitario: 189.9 }],
  })
  await registrarVenda({
    lojaId: loja.id, vendedoraId: camila.id, clienteId: cBia.id, diasAtras: 12, formaRecebimento: 'PIX',
    itens: [{ variacaoId: v(luna, 'Preto', 'M'), quantidade: 1, precoUnitario: 189.9 }],
  })

  // Camila — Eduarda → ATACADO: compra no atacado
  await registrarVenda({
    lojaId: loja.id, vendedoraId: camila.id, clienteId: cDuda.id, atacado: true, diasAtras: 6, formaRecebimento: 'DINHEIRO',
    itens: [{ variacaoId: v(legging, 'Preto', 'M'), quantidade: 10, precoUnitario: 79.9 }],
  })

  // Ana — Carla → NOVO: primeira compra recente, sem recorrência
  await registrarVenda({
    lojaId: loja.id, vendedoraId: ana.id, clienteId: cCarla.id, diasAtras: 4, formaRecebimento: 'DEBITO',
    itens: [{ variacaoId: v(legging, 'Preto', 'P'), quantidade: 1, precoUnitario: 119.9 }],
  })

  // Ana — Daniela → INATIVO: última compra há mais de 90 dias (alvo de recuperação)
  await registrarVenda({
    lojaId: loja.id, vendedoraId: ana.id, clienteId: cDani.id, diasAtras: 120, formaRecebimento: 'CREDITO',
    itens: [{ variacaoId: v(luna, 'Preto', 'P'), quantidade: 1, precoUnitario: 189.9 }],
  })

  // Ana — venda avulsa recente (sem cliente) para compor o ranking do mês
  await registrarVenda({
    lojaId: loja.id, vendedoraId: ana.id, diasAtras: 3, formaRecebimento: 'DINHEIRO',
    itens: [{ variacaoId: v(luna, 'Preto', 'P'), quantidade: 2, precoUnitario: 189.9 }],
  })

  // Júlia (Loja Shopping) — Fernanda (NOVO)
  await registrarVenda({
    lojaId: loja2.id, vendedoraId: julia.id, clienteId: cShopping.id, diasAtras: 1, formaRecebimento: 'CREDITO',
    itens: [{ variacaoId: v(camisa2, 'Off-white', 'M'), quantidade: 2, precoUnitario: 159.9 }],
  })

  // ── Réguas de inatividade (Loja Demo Moda) ──
  await prisma.reguaInatividade.createMany({
    data: [
      { lojaId: loja.id, dias: 30, mensagemTemplate: 'Oi {primeiroNome}! 😊 Faz um tempinho que você não passa na {loja}. Chegaram novidades com a sua cara — quer ver? — {vendedora}' },
      { lojaId: loja.id, dias: 60, mensagemTemplate: 'Oi {primeiroNome}, que saudade! 🧡 Tem peça nova na {loja} e separei algumas pensando em você. — {vendedora}' },
      { lojaId: loja.id, dias: 90, mensagemTemplate: 'Oi {primeiroNome}! Já faz {diasSemCompra} dias 😢 Volta pra {loja} que tenho novidades e um mimo especial pra você! — {vendedora}' },
    ],
  })

  // ── Comissão (Loja Demo Moda): padrão 4% (6% na meta); Vestidos 5% (7% na meta); marca 4,5% ──
  await prisma.regraComissao.createMany({
    data: [
      { lojaId: loja.id, escopo: 'PADRAO', refId: '_PADRAO_', percentual: 4, percentualMeta: 6 },
      { lojaId: loja.id, escopo: 'CATEGORIA', refId: catVestidos.id, percentual: 5, percentualMeta: 7 },
      { lojaId: loja.id, escopo: 'MARCA', refId: marca.id, percentual: 4.5 },
    ],
  })

  // ── Mural de novidades ──
  await prisma.postMural.create({
    data: {
      lojaId: loja.id, autorId: maria.id,
      titulo: 'Chegou a Coleção Verão/Primavera 2026! 🌸',
      conteudo: 'Equipe, lançamos hoje a nova coleção! Destaque para o Vestido Luna e o Blazer Alfaiataria. Bora vender! 💪',
    },
  })

  console.log('✅ Seed concluído.')
  console.log('   Super Admin: admin@modacrm.com.br / admin123')
  console.log('   Gestor:      gestor@lunabrand.com.br / gestor123  (rede Luna Brand, ELITE)')
  console.log('   Estoquista:  estoquista@lunabrand.com.br / estoque123  (rede)')
  console.log('   Gerentes:    maria@lojademo.com.br | paula@lojashopping.com.br / demo123')
  console.log('   Vendedoras:  camila@ | ana@lojademo.com.br · julia@lojashopping.com.br / demo123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

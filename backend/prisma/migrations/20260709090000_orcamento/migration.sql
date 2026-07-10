-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO_DESCONTO', 'ENVIADO', 'ALTERACAO_SOLICITADA', 'CONVERTIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "tokenPublico" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'RASCUNHO',
    "atacado" BOOLEAN NOT NULL DEFAULT false,
    "descontoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "descontoSolicitadoPct" DECIMAL(5,2),
    "aprovadoDescontoPorId" TEXT,
    "observacao" TEXT,
    "mensagemCliente" TEXT,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vendaId" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "respondidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_orcamento" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "variacaoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itens_orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_tokenPublico_key" ON "orcamentos"("tokenPublico");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_vendaId_key" ON "orcamentos"("vendaId");

-- CreateIndex
CREATE INDEX "orcamentos_lojaId_status_idx" ON "orcamentos"("lojaId", "status");

-- CreateIndex
CREATE INDEX "orcamentos_clienteId_idx" ON "orcamentos"("clienteId");

-- CreateIndex
CREATE INDEX "orcamentos_vendedoraId_status_idx" ON "orcamentos"("vendedoraId", "status");

-- CreateIndex
CREATE INDEX "itens_orcamento_orcamentoId_idx" ON "itens_orcamento"("orcamentoId");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_aprovadoDescontoPorId_fkey" FOREIGN KEY ("aprovadoDescontoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_orcamento" ADD CONSTRAINT "itens_orcamento_variacaoId_fkey" FOREIGN KEY ("variacaoId") REFERENCES "variacoes_produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

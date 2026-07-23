-- AlterTable
ALTER TABLE "pedidos_catalogo" ADD COLUMN     "orcamentoId" TEXT;

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "comprovantePagamentoUrl" TEXT,
ADD COLUMN     "comprovanteEnviadoEm" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_catalogo_orcamentoId_key" ON "pedidos_catalogo"("orcamentoId");

-- AddForeignKey
ALTER TABLE "pedidos_catalogo" ADD CONSTRAINT "pedidos_catalogo_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

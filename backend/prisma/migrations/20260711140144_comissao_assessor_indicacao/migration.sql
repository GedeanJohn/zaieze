-- AlterTable
ALTER TABLE "assessores" ADD COLUMN     "cliquesIndicacao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "percentualComissaoIndicacao" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "redes" ADD COLUMN     "assessorOrigemId" TEXT;

-- CreateTable
CREATE TABLE "comissoes_assessor" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "redeNome" TEXT NOT NULL,
    "cicloEm" TIMESTAMP(3) NOT NULL,
    "valorBaseAssinatura" DECIMAL(12,2) NOT NULL,
    "percentualComissao" DECIMAL(5,2) NOT NULL,
    "valorComissao" DECIMAL(12,2) NOT NULL,
    "status" "StatusComissao" NOT NULL DEFAULT 'PENDENTE',
    "pagoEm" TIMESTAMP(3),
    "pagoPorId" TEXT,
    "observacaoPagamento" TEXT,
    "valorRetencaoFiscal" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissoes_assessor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comissoes_assessor_assessorId_status_idx" ON "comissoes_assessor"("assessorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_assessor_redeId_cicloEm_key" ON "comissoes_assessor"("redeId", "cicloEm");

-- AddForeignKey
ALTER TABLE "redes" ADD CONSTRAINT "redes_assessorOrigemId_fkey" FOREIGN KEY ("assessorOrigemId") REFERENCES "assessores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes_assessor" ADD CONSTRAINT "comissoes_assessor_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

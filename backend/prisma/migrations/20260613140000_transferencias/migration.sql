-- CreateEnum
CREATE TYPE "StatusTransferencia" AS ENUM ('EM_TRANSITO', 'RECEBIDA', 'CANCELADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'TRANSFERENCIA_SAIDA';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE 'TRANSFERENCIA_ENTRADA';

-- CreateTable
CREATE TABLE "transferencias" (
    "id" TEXT NOT NULL,
    "lojaOrigemId" TEXT NOT NULL,
    "lojaDestinoId" TEXT NOT NULL,
    "status" "StatusTransferencia" NOT NULL DEFAULT 'EM_TRANSITO',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recebidaEm" TIMESTAMP(3),

    CONSTRAINT "transferencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencia_itens" (
    "id" TEXT NOT NULL,
    "transferenciaId" TEXT NOT NULL,
    "origemVariacaoId" TEXT NOT NULL,
    "destinoVariacaoId" TEXT NOT NULL,
    "quantidadeEnviada" INTEGER NOT NULL,
    "quantidadeRecebida" INTEGER,

    CONSTRAINT "transferencia_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transferencias_lojaOrigemId_idx" ON "transferencias"("lojaOrigemId");

-- CreateIndex
CREATE INDEX "transferencias_lojaDestinoId_idx" ON "transferencias"("lojaDestinoId");

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_lojaOrigemId_fkey" FOREIGN KEY ("lojaOrigemId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_lojaDestinoId_fkey" FOREIGN KEY ("lojaDestinoId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_itens" ADD CONSTRAINT "transferencia_itens_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "transferencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_itens" ADD CONSTRAINT "transferencia_itens_origemVariacaoId_fkey" FOREIGN KEY ("origemVariacaoId") REFERENCES "variacoes_produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencia_itens" ADD CONSTRAINT "transferencia_itens_destinoVariacaoId_fkey" FOREIGN KEY ("destinoVariacaoId") REFERENCES "variacoes_produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


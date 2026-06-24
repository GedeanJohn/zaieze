-- DropForeignKey
ALTER TABLE "categorias" DROP CONSTRAINT "categorias_lojaId_fkey";

-- DropForeignKey
ALTER TABLE "colecoes" DROP CONSTRAINT "colecoes_lojaId_fkey";

-- DropForeignKey
ALTER TABLE "marcas" DROP CONSTRAINT "marcas_lojaId_fkey";

-- DropForeignKey
ALTER TABLE "produtos" DROP CONSTRAINT "produtos_lojaId_fkey";

-- DropForeignKey
ALTER TABLE "transferencia_itens" DROP CONSTRAINT "transferencia_itens_destinoVariacaoId_fkey";

-- DropForeignKey
ALTER TABLE "transferencia_itens" DROP CONSTRAINT "transferencia_itens_origemVariacaoId_fkey";

-- DropForeignKey
ALTER TABLE "transferencia_itens" DROP CONSTRAINT "transferencia_itens_transferenciaId_fkey";

-- DropForeignKey
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_lojaDestinoId_fkey";

-- DropForeignKey
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_lojaOrigemId_fkey";

-- DropIndex
DROP INDEX "categorias_lojaId_nome_key";

-- DropIndex
DROP INDEX "colecoes_lojaId_nome_key";

-- DropIndex
DROP INDEX "colecoes_lojaId_status_idx";

-- DropIndex
DROP INDEX "marcas_lojaId_nome_key";

-- DropIndex
DROP INDEX "produtos_lojaId_ativo_idx";

-- DropIndex
DROP INDEX "produtos_lojaId_referencia_key";

-- AlterTable
ALTER TABLE "categorias" DROP COLUMN "lojaId",
ADD COLUMN     "redeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "colecoes" DROP COLUMN "lojaId",
ADD COLUMN     "redeId" TEXT NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marcas" DROP COLUMN "lojaId",
ADD COLUMN     "redeId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "produtos" DROP COLUMN "lojaId",
ADD COLUMN     "redeId" TEXT NOT NULL;

-- DropTable
DROP TABLE "transferencia_itens";

-- DropTable
DROP TABLE "transferencias";

-- DropEnum
DROP TYPE "StatusTransferencia";

-- CreateTable
CREATE TABLE "colecao_loja" (
    "id" TEXT NOT NULL,
    "colecaoId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "colecao_loja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "colecao_loja_lojaId_idx" ON "colecao_loja"("lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "colecao_loja_colecaoId_lojaId_key" ON "colecao_loja"("colecaoId", "lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_redeId_nome_key" ON "categorias"("redeId", "nome");

-- CreateIndex
CREATE INDEX "colecoes_redeId_status_idx" ON "colecoes"("redeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "colecoes_redeId_nome_key" ON "colecoes"("redeId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "marcas_redeId_nome_key" ON "marcas"("redeId", "nome");

-- CreateIndex
CREATE INDEX "produtos_redeId_ativo_idx" ON "produtos"("redeId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_redeId_referencia_key" ON "produtos"("redeId", "referencia");

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcas" ADD CONSTRAINT "marcas_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecoes" ADD CONSTRAINT "colecoes_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecao_loja" ADD CONSTRAINT "colecao_loja_colecaoId_fkey" FOREIGN KEY ("colecaoId") REFERENCES "colecoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colecao_loja" ADD CONSTRAINT "colecao_loja_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


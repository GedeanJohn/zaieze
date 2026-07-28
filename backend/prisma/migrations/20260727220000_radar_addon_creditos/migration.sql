-- AlterEnum
ALTER TYPE "TipoAddon" ADD VALUE 'RADAR';

-- AlterTable
ALTER TABLE "config_addons" ADD COLUMN     "cotaCreditosMes" INTEGER;

-- AlterTable
-- redeId null = uso interno da ZAIEZE (Captador Leads Zaieze); preenchido = uso pago de um
-- tenant via o add-on RADAR (1 busca = 1 crédito de IA Captador).
ALTER TABLE "prospeccao_buscas" ADD COLUMN     "redeId" TEXT;

-- CreateIndex
CREATE INDEX "prospeccao_buscas_redeId_createdAt_idx" ON "prospeccao_buscas"("redeId", "createdAt");

-- AddForeignKey
ALTER TABLE "prospeccao_buscas" ADD CONSTRAINT "prospeccao_buscas_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

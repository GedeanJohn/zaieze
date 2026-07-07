-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "consumidorOutro" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "clientes_lojaId_consumidorOutro_idx" ON "clientes"("lojaId", "consumidorOutro");

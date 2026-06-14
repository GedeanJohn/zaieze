-- CreateEnum
CREATE TYPE "StatusAssinatura" AS ENUM ('PENDENTE', 'ATIVA', 'CANCELADA');

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "saldoCashback" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "senhaHash" TEXT;

-- AlterTable
ALTER TABLE "lojas" ADD COLUMN     "cashbackPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "cashbackGerado" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "assinaturas" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "plano" "Plano" NOT NULL,
    "status" "StatusAssinatura" NOT NULL DEFAULT 'PENDENTE',
    "valor" DECIMAL(12,2) NOT NULL,
    "mpPreapprovalId" TEXT,
    "simulada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_redeId_key" ON "assinaturas"("redeId");

-- AddForeignKey
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


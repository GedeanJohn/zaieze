-- CreateEnum
CREATE TYPE "Periodicidade" AS ENUM ('MENSAL', 'ANUAL');

-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN "periodicidade" "Periodicidade" NOT NULL DEFAULT 'MENSAL';

-- CreateTable (percentual de desconto do plano anual — SUPER_ADMIN edita sem deploy)
CREATE TABLE "config_assinatura" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "percentualDescontoAnual" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_assinatura_pkey" PRIMARY KEY ("id")
);

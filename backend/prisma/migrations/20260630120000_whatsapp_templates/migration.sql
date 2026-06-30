-- WhatsApp Cloud API — Fase 2: templates HSM

-- CreateEnum
CREATE TYPE "StatusTemplate" AS ENUM ('RASCUNHO', 'PENDENTE', 'APROVADO', 'REJEITADO', 'PAUSADO');

-- AlterTable: campanha (e modelo da marca) podem referenciar um template HSM
ALTER TABLE "campanhas" ADD COLUMN     "templateId" TEXT;
ALTER TABLE "campanhas_modelo" ADD COLUMN     "templateId" TEXT;

-- CreateTable: templates por marca
CREATE TABLE "templates_whatsapp" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "metaNome" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'pt_BR',
    "categoria" TEXT NOT NULL DEFAULT 'MARKETING',
    "corpo" TEXT NOT NULL,
    "variaveis" JSONB NOT NULL,
    "status" "StatusTemplate" NOT NULL DEFAULT 'RASCUNHO',
    "metaId" TEXT,
    "motivoRejeicao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_whatsapp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "templates_whatsapp_redeId_metaNome_idioma_key" ON "templates_whatsapp"("redeId", "metaNome", "idioma");
CREATE INDEX "templates_whatsapp_redeId_status_idx" ON "templates_whatsapp"("redeId", "status");

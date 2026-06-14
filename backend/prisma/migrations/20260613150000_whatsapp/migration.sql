-- CreateEnum
CREATE TYPE "DirecaoMensagem" AS ENUM ('ENVIADA', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('SIMULADA', 'ENVIADA', 'FALHA', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "OrigemMensagem" AS ENUM ('MANUAL', 'CAMPANHA', 'REGUA', 'ENTRADA');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "waConectado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waInstancia" TEXT,
ADD COLUMN     "waNumero" TEXT;

-- CreateTable
CREATE TABLE "campanhas" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "criadaPorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "segmentoAlvo" "SegmentoCliente",
    "mensagemTemplate" TEXT NOT NULL,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "simulados" INTEGER NOT NULL DEFAULT 0,
    "falhas" INTEGER NOT NULL DEFAULT 0,
    "semConsentimento" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campanhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_whatsapp" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "vendedoraId" TEXT NOT NULL,
    "campanhaId" TEXT,
    "direcao" "DirecaoMensagem" NOT NULL,
    "status" "StatusMensagem" NOT NULL,
    "origem" "OrigemMensagem" NOT NULL DEFAULT 'MANUAL',
    "telefone" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reguas_inatividade" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "dias" INTEGER NOT NULL,
    "mensagemTemplate" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reguas_inatividade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanhas_lojaId_createdAt_idx" ON "campanhas"("lojaId", "createdAt");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_clienteId_createdAt_idx" ON "mensagens_whatsapp"("clienteId", "createdAt");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_lojaId_createdAt_idx" ON "mensagens_whatsapp"("lojaId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reguas_inatividade_lojaId_dias_key" ON "reguas_inatividade"("lojaId", "dias");

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_campanhaId_fkey" FOREIGN KEY ("campanhaId") REFERENCES "campanhas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reguas_inatividade" ADD CONSTRAINT "reguas_inatividade_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


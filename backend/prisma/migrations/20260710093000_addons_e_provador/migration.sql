-- CreateEnum
CREATE TYPE "TipoAddon" AS ENUM ('PROVADOR');

-- CreateEnum
CREATE TYPE "StatusAddon" AS ENUM ('PENDENTE', 'ATIVA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusProvador" AS ENUM ('AGUARDANDO_FOTO', 'PENDENTE', 'PROCESSANDO_FOTO', 'FOTO_PRONTA', 'PROCESSANDO_VIDEO', 'CONCLUIDO', 'FALHOU', 'EXPIRADO');

-- CreateTable
CREATE TABLE "assinaturas_addon" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "tipo" "TipoAddon" NOT NULL,
    "status" "StatusAddon" NOT NULL DEFAULT 'PENDENTE',
    "valor" DECIMAL(12,2) NOT NULL,
    "mpPreapprovalId" TEXT,
    "simulada" BOOLEAN NOT NULL DEFAULT false,
    "cicloFimEm" TIMESTAMP(3),
    "cancelamentoSolicitadoEm" TIMESTAMP(3),
    "cancelamentoOrigem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_addon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_addons" (
    "tipo" "TipoAddon" NOT NULL,
    "preco" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_addons_pkey" PRIMARY KEY ("tipo")
);

-- CreateTable
CREATE TABLE "looks_provador" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "produtoBaseId" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "comVideo" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusProvador" NOT NULL DEFAULT 'AGUARDANDO_FOTO',
    "token" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "fotoClienteUrl" TEXT,
    "fotoClienteExpurgadaEm" TIMESTAMP(3),
    "consentLgpdEm" TIMESTAMP(3),
    "consentIp" TEXT,
    "fotoUrl" TEXT,
    "videoUrl" TEXT,
    "viaIa" BOOLEAN NOT NULL DEFAULT false,
    "creditos" INTEGER NOT NULL DEFAULT 0,
    "externalFotoId" TEXT,
    "externalVideoId" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "looks_provador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_addon_redeId_tipo_key" ON "assinaturas_addon"("redeId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "looks_provador_token_key" ON "looks_provador"("token");

-- CreateIndex
CREATE INDEX "looks_provador_status_idx" ON "looks_provador"("status");

-- CreateIndex
CREATE INDEX "looks_provador_redeId_createdAt_idx" ON "looks_provador"("redeId", "createdAt");

-- CreateIndex
CREATE INDEX "looks_provador_lojaId_createdAt_idx" ON "looks_provador"("lojaId", "createdAt");

-- AddForeignKey
ALTER TABLE "assinaturas_addon" ADD CONSTRAINT "assinaturas_addon_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "looks_provador" ADD CONSTRAINT "looks_provador_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "looks_provador" ADD CONSTRAINT "looks_provador_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "looks_provador" ADD CONSTRAINT "looks_provador_produtoBaseId_fkey" FOREIGN KEY ("produtoBaseId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "looks_provador" ADD CONSTRAINT "looks_provador_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

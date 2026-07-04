-- CreateEnum
CREATE TYPE "StatusComissao" AS ENUM ('PENDENTE', 'PAGA');

-- CreateTable
CREATE TABLE "config_afiliados" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "percentualPadrao" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_afiliados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afiliados" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "percentualComissao" DECIMAL(5,2),
    "chavePixTipo" TEXT,
    "chavePix" TEXT,
    "cliques" INTEGER NOT NULL DEFAULT 0,
    "aceiteTermosVersao" TEXT,
    "aceiteTermosEm" TIMESTAMP(3),
    "aceiteTermosIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "afiliados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "afiliados_usuarioId_key" ON "afiliados"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "afiliados_codigo_key" ON "afiliados"("codigo");

-- AddForeignKey
ALTER TABLE "afiliados" ADD CONSTRAINT "afiliados_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable (vínculo: rede indicada -> afiliado de origem)
ALTER TABLE "redes" ADD COLUMN "afiliadoId" TEXT;

-- AddForeignKey
ALTER TABLE "redes" ADD CONSTRAINT "redes_afiliadoId_fkey" FOREIGN KEY ("afiliadoId") REFERENCES "afiliados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "comissoes_afiliado" (
    "id" TEXT NOT NULL,
    "afiliadoId" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissoes_afiliado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_afiliado_redeId_cicloEm_key" ON "comissoes_afiliado"("redeId", "cicloEm");

-- CreateIndex
CREATE INDEX "comissoes_afiliado_afiliadoId_status_idx" ON "comissoes_afiliado"("afiliadoId", "status");

-- AddForeignKey
ALTER TABLE "comissoes_afiliado" ADD CONSTRAINT "comissoes_afiliado_afiliadoId_fkey" FOREIGN KEY ("afiliadoId") REFERENCES "afiliados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "campanhas" ADD COLUMN     "modeloId" TEXT;

-- CreateTable
CREATE TABLE "campanhas_modelo" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "criadaPorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mensagemTemplate" TEXT NOT NULL,
    "segmentoAlvo" "SegmentoCliente",
    "imagemUrl" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campanhas_modelo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campanhas_modelo_redeId_ativa_idx" ON "campanhas_modelo"("redeId", "ativa");

-- CreateIndex
CREATE INDEX "campanhas_modeloId_idx" ON "campanhas"("modeloId");

-- AddForeignKey
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "campanhas_modelo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas_modelo" ADD CONSTRAINT "campanhas_modelo_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campanhas_modelo" ADD CONSTRAINT "campanhas_modelo_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

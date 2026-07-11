-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ASSESSORA';

-- CreateTable
CREATE TABLE "assessores" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "whatsapp" TEXT,
    "instagram" TEXT,
    "site" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessor_marcas" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "redeId" TEXT,
    "nome" TEXT NOT NULL,
    "logoUrl" TEXT,
    "descricao" TEXT,
    "formasPagamento" TEXT,
    "modoEnvio" TEXT,
    "condicoesCompra" TEXT,
    "tamanhos" TEXT,
    "valores" TEXT,
    "endereco" TEXT,
    "cnpj" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "whatsapp" TEXT,
    "telegram" TEXT,
    "tiktok" TEXT,
    "site" TEXT,
    "percentualComissaoSugerido" DECIMAL(5,2),
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessor_marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendas_assessora" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "assessorMarcaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valorVenda" DECIMAL(12,2) NOT NULL,
    "percentualComissao" DECIMAL(5,2) NOT NULL,
    "totalComissao" DECIMAL(12,2) NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendas_assessora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessores_usuarioId_key" ON "assessores"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "assessores_slug_key" ON "assessores"("slug");

-- CreateIndex
CREATE INDEX "assessor_marcas_assessorId_ordem_idx" ON "assessor_marcas"("assessorId", "ordem");

-- CreateIndex
CREATE INDEX "vendas_assessora_assessorId_data_idx" ON "vendas_assessora"("assessorId", "data");

-- AddForeignKey
ALTER TABLE "assessores" ADD CONSTRAINT "assessores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessor_marcas" ADD CONSTRAINT "assessor_marcas_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessor_marcas" ADD CONSTRAINT "assessor_marcas_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_assessora" ADD CONSTRAINT "vendas_assessora_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas_assessora" ADD CONSTRAINT "vendas_assessora_assessorMarcaId_fkey" FOREIGN KEY ("assessorMarcaId") REFERENCES "assessor_marcas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

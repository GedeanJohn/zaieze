-- CreateTable
CREATE TABLE "config_assento_vendedora" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "preco" DECIMAL(10,2) NOT NULL DEFAULT 159.90,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_assento_vendedora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas_vendedora" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "vendedoraId" TEXT,
    "conviteId" TEXT,
    "status" "StatusAssinatura" NOT NULL DEFAULT 'PENDENTE',
    "valor" DECIMAL(10,2) NOT NULL,
    "mpPreapprovalId" TEXT,
    "simulada" BOOLEAN NOT NULL DEFAULT false,
    "reajustesAplicados" INTEGER NOT NULL DEFAULT 0,
    "primeiraCobrancaEm" TIMESTAMP(3),
    "cicloFimEm" TIMESTAMP(3),
    "cancelamentoSolicitadoEm" TIMESTAMP(3),
    "cancelamentoOrigem" TEXT,
    "solicitadoPorId" TEXT NOT NULL,
    "aprovadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_vendedora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_vendedora_conviteId_key" ON "assinaturas_vendedora"("conviteId");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_vendedora_mpPreapprovalId_key" ON "assinaturas_vendedora"("mpPreapprovalId");

-- CreateIndex
CREATE INDEX "assinaturas_vendedora_redeId_idx" ON "assinaturas_vendedora"("redeId");

-- CreateIndex
CREATE INDEX "assinaturas_vendedora_vendedoraId_idx" ON "assinaturas_vendedora"("vendedoraId");

-- AddForeignKey
ALTER TABLE "assinaturas_vendedora" ADD CONSTRAINT "assinaturas_vendedora_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_vendedora" ADD CONSTRAINT "assinaturas_vendedora_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_vendedora" ADD CONSTRAINT "assinaturas_vendedora_conviteId_fkey" FOREIGN KEY ("conviteId") REFERENCES "convites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_vendedora" ADD CONSTRAINT "assinaturas_vendedora_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

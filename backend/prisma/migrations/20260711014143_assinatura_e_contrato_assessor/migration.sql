-- CreateTable
CREATE TABLE "assinaturas_assessor" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "status" "StatusAssinatura" NOT NULL DEFAULT 'PENDENTE',
    "valor" DECIMAL(10,2) NOT NULL,
    "mpPreapprovalId" TEXT,
    "simulada" BOOLEAN NOT NULL DEFAULT false,
    "cicloFimEm" TIMESTAMP(3),
    "cancelamentoSolicitadoEm" TIMESTAMP(3),
    "cancelamentoOrigem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_assessor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aceites_contrato_assessor" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "assinanteNome" TEXT NOT NULL,
    "assinanteEmail" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_contrato_assessor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_assessor_assessorId_key" ON "assinaturas_assessor"("assessorId");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_assessor_mpPreapprovalId_key" ON "assinaturas_assessor"("mpPreapprovalId");

-- CreateIndex
CREATE INDEX "aceites_contrato_assessor_assessorId_idx" ON "aceites_contrato_assessor"("assessorId");

-- AddForeignKey
ALTER TABLE "assinaturas_assessor" ADD CONSTRAINT "assinaturas_assessor_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceites_contrato_assessor" ADD CONSTRAINT "aceites_contrato_assessor_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

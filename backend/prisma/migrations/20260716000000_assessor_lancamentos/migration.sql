-- CreateTable
CREATE TABLE "assessor_lancamentos" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "assessorMarcaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "preco" DECIMAL(12,2),
    "descricao" VARCHAR(300),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessor_lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessor_lancamentos_assessorId_ativo_idx" ON "assessor_lancamentos"("assessorId", "ativo");

-- AddForeignKey
ALTER TABLE "assessor_lancamentos" ADD CONSTRAINT "assessor_lancamentos_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessor_lancamentos" ADD CONSTRAINT "assessor_lancamentos_assessorMarcaId_fkey" FOREIGN KEY ("assessorMarcaId") REFERENCES "assessor_marcas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

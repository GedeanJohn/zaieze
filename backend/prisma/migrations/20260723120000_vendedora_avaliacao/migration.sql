-- CreateEnum
CREATE TYPE "StatusAvaliacaoVendedora" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA');

-- CreateTable
CREATE TABLE "vendedora_avaliacoes" (
    "id" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" VARCHAR(400),
    "nomeCliente" TEXT,
    "clienteId" TEXT,
    "status" "StatusAvaliacaoVendedora" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderadoEm" TIMESTAMP(3),

    CONSTRAINT "vendedora_avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendedora_avaliacoes_vendedoraId_status_idx" ON "vendedora_avaliacoes"("vendedoraId", "status");

-- CreateIndex
CREATE INDEX "vendedora_avaliacoes_clienteId_status_idx" ON "vendedora_avaliacoes"("clienteId", "status");

-- AddForeignKey
ALTER TABLE "vendedora_avaliacoes" ADD CONSTRAINT "vendedora_avaliacoes_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendedora_avaliacoes" ADD CONSTRAINT "vendedora_avaliacoes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "assessores" DROP COLUMN "statAvaliacao";

-- CreateEnum
CREATE TYPE "StatusAvaliacaoAssessor" AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA');

-- CreateTable
CREATE TABLE "assessor_avaliacoes" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" VARCHAR(400),
    "nomeCliente" TEXT,
    "status" "StatusAvaliacaoAssessor" NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderadoEm" TIMESTAMP(3),

    CONSTRAINT "assessor_avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessor_avaliacoes_assessorId_status_idx" ON "assessor_avaliacoes"("assessorId", "status");

-- AddForeignKey
ALTER TABLE "assessor_avaliacoes" ADD CONSTRAINT "assessor_avaliacoes_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

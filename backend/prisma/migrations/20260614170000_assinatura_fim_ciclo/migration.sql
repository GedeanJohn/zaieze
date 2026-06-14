-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN     "cancelamentoOrigem" TEXT,
ADD COLUMN     "cancelamentoSolicitadoEm" TIMESTAMP(3),
ADD COLUMN     "cicloFimEm" TIMESTAMP(3);


-- AlterTable: data da 1ª cobrança quando há período grátis (free trial)
ALTER TABLE "assinaturas" ADD COLUMN     "primeiraCobrancaEm" TIMESTAMP(3);

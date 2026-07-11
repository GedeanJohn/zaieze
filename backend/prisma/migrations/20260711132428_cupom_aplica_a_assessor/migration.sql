-- CreateEnum
CREATE TYPE "AplicacaoPromo" AS ENUM ('REDE', 'ASSESSOR');

-- AlterTable
ALTER TABLE "codigos_promocionais" ADD COLUMN     "aplicaA" "AplicacaoPromo" NOT NULL DEFAULT 'REDE';

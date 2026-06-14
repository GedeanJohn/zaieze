-- CreateEnum
CREATE TYPE "FormaRecebimento" AS ENUM ('DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'OUTRO');

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "formaRecebimento" "FormaRecebimento" NOT NULL DEFAULT 'DINHEIRO';

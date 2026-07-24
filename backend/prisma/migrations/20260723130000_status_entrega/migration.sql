-- CreateEnum
CREATE TYPE "StatusEntrega" AS ENUM ('SEPARANDO', 'TRANSPORTADORA', 'EM_TRANSITO', 'ENTREGUE');

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN "statusEntrega" "StatusEntrega" NOT NULL DEFAULT 'SEPARANDO',
ADD COLUMN "statusEntregaEm" TIMESTAMP(3);

-- Backfill: vendas já marcadas como separadas anteriormente entram direto em TRANSPORTADORA
-- (equivalente a "saiu da separação"), preservando o sentido do histórico existente.
UPDATE "vendas" SET "statusEntrega" = 'TRANSPORTADORA', "statusEntregaEm" = "separadoEm" WHERE "separado" = true;

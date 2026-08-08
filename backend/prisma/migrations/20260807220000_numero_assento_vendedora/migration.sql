-- AddColumn (nullable primeiro pra poder popular as linhas já existentes)
ALTER TABLE "assinaturas_vendedora" ADD COLUMN "numeroAssento" INTEGER;

-- Backfill: numera os assentos já existentes de cada rede na ordem em que foram criados —
-- preserva a ordem histórica em vez de reiniciar do zero.
WITH numerados AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "redeId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "assinaturas_vendedora"
)
UPDATE "assinaturas_vendedora" av
SET "numeroAssento" = numerados.rn
FROM numerados
WHERE av."id" = numerados."id";

-- AlterColumn (agora que toda linha tem valor)
ALTER TABLE "assinaturas_vendedora" ALTER COLUMN "numeroAssento" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_vendedora_redeId_numeroAssento_key" ON "assinaturas_vendedora"("redeId", "numeroAssento");

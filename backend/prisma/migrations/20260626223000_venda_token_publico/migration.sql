-- Token público do comprovante (link sem login para o cliente).
ALTER TABLE "vendas" ADD COLUMN "tokenPublico" TEXT;

-- Backfill dos pedidos já existentes com um token único.
UPDATE "vendas" SET "tokenPublico" = gen_random_uuid()::text WHERE "tokenPublico" IS NULL;

ALTER TABLE "vendas" ALTER COLUMN "tokenPublico" SET NOT NULL;

CREATE UNIQUE INDEX "vendas_tokenPublico_key" ON "vendas"("tokenPublico");

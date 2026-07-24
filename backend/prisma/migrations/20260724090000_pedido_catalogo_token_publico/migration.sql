-- AlterTable: adiciona a coluna opcional, preenche as linhas já existentes, depois trava NOT NULL + UNIQUE
ALTER TABLE "pedidos_catalogo" ADD COLUMN "tokenPublico" TEXT;

UPDATE "pedidos_catalogo" SET "tokenPublico" = md5(random()::text || clock_timestamp()::text || id) WHERE "tokenPublico" IS NULL;

ALTER TABLE "pedidos_catalogo" ALTER COLUMN "tokenPublico" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_catalogo_tokenPublico_key" ON "pedidos_catalogo"("tokenPublico");

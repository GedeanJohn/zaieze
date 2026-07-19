-- Contador de cliques nos links de contato de uma marca representada (metrica da Brand Partner).
ALTER TABLE "assessor_marcas" ADD COLUMN "cliques" INTEGER NOT NULL DEFAULT 0;

-- Hero banner da vitrine: produto em destaque (selo) e destaque especial (banner do topo).
ALTER TABLE "produtos" ADD COLUMN "destaque" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "produtos" ADD COLUMN "destaqueEspecial" BOOLEAN NOT NULL DEFAULT false;

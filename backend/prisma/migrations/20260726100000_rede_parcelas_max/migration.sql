-- Política de parcelamento da vitrine (varejo), configurável pelo gestor da marca.
ALTER TABLE "redes" ADD COLUMN "parcelasMax" INTEGER NOT NULL DEFAULT 1;

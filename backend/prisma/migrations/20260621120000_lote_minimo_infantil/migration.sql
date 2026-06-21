-- Lote mínimo de atacado para INFANTIL (default 12). Demais gêneros usam pedidoMinimoAtacado.
ALTER TABLE "redes" ADD COLUMN "pedidoMinimoInfantil" INTEGER NOT NULL DEFAULT 12;

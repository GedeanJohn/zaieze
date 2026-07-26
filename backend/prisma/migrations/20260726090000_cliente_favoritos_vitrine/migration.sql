-- Favoritos da vitrine sincronizados com o Cliente verificado por WhatsApp (Portal do Cliente).
ALTER TABLE "clientes" ADD COLUMN "favoritosVitrine" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

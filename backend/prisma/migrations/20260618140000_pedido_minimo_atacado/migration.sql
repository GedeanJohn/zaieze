-- AlterTable: classificação varejo×atacado por quantidade de peças no pedido (mínimo do atacado)
ALTER TABLE "redes" ADD COLUMN     "pedidoMinimoAtacado" INTEGER NOT NULL DEFAULT 6;

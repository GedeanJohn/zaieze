-- AlterTable: Outlet manual por coleção (+ desconto opcional aplicado à coleção inteira)
ALTER TABLE "colecoes" ADD COLUMN     "outlet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outletDesde" TIMESTAMP(3),
ADD COLUMN     "descontoOutletPct" INTEGER;

-- AlterTable: desconto de Outlet específico por peça (override do desconto da coleção)
ALTER TABLE "produtos" ADD COLUMN     "descontoOutletPct" INTEGER;

-- AlterTable
ALTER TABLE "assessor_marcas" ADD COLUMN     "bannerUrl" TEXT;

-- AlterTable
ALTER TABLE "assessores" ADD COLUMN     "disponivel" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "statAvaliacao" DECIMAL(2,1),
ADD COLUMN     "statClientes" INTEGER,
ADD COLUMN     "statProdutos" INTEGER,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "telefone" TEXT;

-- RenameIndex
ALTER INDEX "pedidos_marketplace_pendentes_redeId_marketplace_pedidoExt_key" RENAME TO "pedidos_marketplace_pendentes_redeId_marketplace_pedidoExte_key";

-- AlterTable
ALTER TABLE "assessor_marcas" ADD COLUMN     "bannerUrl" TEXT;

-- AlterTable
ALTER TABLE "assessores" ADD COLUMN     "disponivel" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "statAvaliacao" DECIMAL(2,1),
ADD COLUMN     "statClientes" INTEGER,
ADD COLUMN     "statProdutos" INTEGER,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "telefone" TEXT;

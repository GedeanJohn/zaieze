-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('FEMININO', 'MASCULINO', 'UNISSEX', 'INFANTIL');

-- AlterTable
ALTER TABLE "produtos" ADD COLUMN     "composicao" TEXT,
ADD COLUMN     "faixaEtaria" TEXT,
ADD COLUMN     "fornecedor" TEXT,
ADD COLUMN     "genero" "Genero" NOT NULL DEFAULT 'FEMININO',
ADD COLUMN     "modelagem" TEXT,
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "pesoGramas" INTEGER,
ADD COLUMN     "referencia" TEXT;

-- AlterTable
ALTER TABLE "variacoes_produto" ADD COLUMN     "codigoBarras" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "produtos_lojaId_referencia_key" ON "produtos"("lojaId", "referencia");

-- CreateIndex
CREATE UNIQUE INDEX "variacoes_produto_codigoBarras_key" ON "variacoes_produto"("codigoBarras");


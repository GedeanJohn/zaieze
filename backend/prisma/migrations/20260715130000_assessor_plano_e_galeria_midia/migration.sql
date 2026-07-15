-- CreateEnum
CREATE TYPE "PlanoAssessor" AS ENUM ('BASICO', 'AVANCADO');

-- CreateEnum
CREATE TYPE "TipoMidiaAssessorMarca" AS ENUM ('FOTO', 'VIDEO');

-- AlterTable
ALTER TABLE "assessores" ADD COLUMN     "plano" "PlanoAssessor" NOT NULL DEFAULT 'BASICO';

-- AlterTable (renomeia o preço único em 2 preços, um por plano)
ALTER TABLE "config_assessores" RENAME COLUMN "precoMensal" TO "precoMensalBasico";
ALTER TABLE "config_assessores" ADD COLUMN     "precoMensalAvancado" DECIMAL(10,2) NOT NULL DEFAULT 149.99;

-- CreateTable
CREATE TABLE "assessor_marca_midias" (
    "id" TEXT NOT NULL,
    "assessorMarcaId" TEXT NOT NULL,
    "tipo" "TipoMidiaAssessorMarca" NOT NULL,
    "url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessor_marca_midias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessor_marca_midias_assessorMarcaId_tipo_ordem_idx" ON "assessor_marca_midias"("assessorMarcaId", "tipo", "ordem");

-- AddForeignKey
ALTER TABLE "assessor_marca_midias" ADD CONSTRAINT "assessor_marca_midias_assessorMarcaId_fkey" FOREIGN KEY ("assessorMarcaId") REFERENCES "assessor_marcas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

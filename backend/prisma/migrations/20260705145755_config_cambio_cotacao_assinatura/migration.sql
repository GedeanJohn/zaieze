-- AlterTable
ALTER TABLE "assinaturas" ADD COLUMN     "cotacaoUsdDataFonte" DATE,
ADD COLUMN     "cotacaoUsdNaAssinatura" DECIMAL(10,6);

-- CreateTable
CREATE TABLE "config_cambio" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "usdPorBrl" DECIMAL(10,6),
    "dataCotacao" DATE,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_cambio_pkey" PRIMARY KEY ("id")
);

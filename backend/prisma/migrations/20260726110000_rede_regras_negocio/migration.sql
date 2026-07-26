-- Regras do Negócio da vitrine (informativas): Parcelamento condicionado + Entrega + Devolução.
ALTER TABLE "redes" ADD COLUMN "parcelasFormaPagamento" TEXT;
ALTER TABLE "redes" ADD COLUMN "parcelasMinPecas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "redes" ADD COLUMN "parcelasMinValor" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "redes" ADD COLUMN "entregaPrazoTexto" TEXT;
ALTER TABLE "redes" ADD COLUMN "entregaFreteGratisValor" DECIMAL(12,2);
ALTER TABLE "redes" ADD COLUMN "entregaTexto" TEXT;
ALTER TABLE "redes" ADD COLUMN "devolucaoPrazoDias" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "redes" ADD COLUMN "devolucaoTexto" TEXT;

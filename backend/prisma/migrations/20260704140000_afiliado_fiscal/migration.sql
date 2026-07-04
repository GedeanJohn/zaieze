-- AlterTable (enquadramento + saúde fiscal do afiliado — Reforma Tributária / LC 214-2025)
ALTER TABLE "afiliados" ADD COLUMN "taxStatus" TEXT;
ALTER TABLE "afiliados" ADD COLUMN "statusFiscal" TEXT NOT NULL DEFAULT 'NAO_VERIFICADO';
ALTER TABLE "afiliados" ADD COLUMN "statusFiscalVerificadoEm" TIMESTAMP(3);

-- AlterTable (retenção IBS/CBS registrada no repasse — informativo, sem cálculo automático)
ALTER TABLE "comissoes_afiliado" ADD COLUMN "valorRetencaoFiscal" DECIMAL(12,2);

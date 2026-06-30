-- Reajuste anual por IGP-M nos contratos existentes (por aniversário)

-- Contador de reajustes já aplicados ao contrato
ALTER TABLE "assinaturas" ADD COLUMN     "reajustesAplicados" INTEGER NOT NULL DEFAULT 0;

-- Tabela mensal do IGP-M acumulado (12m), lançada pelo admin
CREATE TABLE "indices_igpm" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "percentual" DECIMAL(6,3) NOT NULL,
    "registradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indices_igpm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "indices_igpm_ano_mes_key" ON "indices_igpm"("ano", "mes");

-- Auditoria dos reajustes aplicados por aniversário
CREATE TABLE "reajustes_assinatura" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "redeNome" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "percentual" DECIMAL(6,3) NOT NULL,
    "valorAntes" DECIMAL(12,2) NOT NULL,
    "valorDepois" DECIMAL(12,2) NOT NULL,
    "aplicadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reajustes_assinatura_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reajustes_assinatura_redeId_idx" ON "reajustes_assinatura"("redeId");
CREATE INDEX "reajustes_assinatura_aplicadoEm_idx" ON "reajustes_assinatura"("aplicadoEm");

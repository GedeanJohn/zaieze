-- Preço por plano (editável pelo admin) + histórico de reajustes (IGP-M).
CREATE TABLE "config_planos" (
    "plano" "Plano" NOT NULL,
    "preco" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "config_planos_pkey" PRIMARY KEY ("plano")
);

-- Seed com os preços atuais (em produção). O admin ajusta depois pela tela.
INSERT INTO "config_planos" ("plano","preco") VALUES ('START', 97), ('PRO', 297), ('ELITE', 697);

CREATE TABLE "reajustes_historico" (
    "id" TEXT NOT NULL,
    "indice" TEXT NOT NULL,
    "percentual" DECIMAL(6,3) NOT NULL,
    "detalhe" JSONB,
    "aplicadoPor" TEXT,
    "aplicadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reajustes_historico_pkey" PRIMARY KEY ("id")
);

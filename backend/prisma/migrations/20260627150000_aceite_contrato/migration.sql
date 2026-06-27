-- Registro de aceite eletrônico do contrato de prestação de serviços (por rede/GESTOR).
CREATE TABLE "aceites_contrato" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "assinante_nome" TEXT NOT NULL,
    "assinante_email" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "aceito_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_contrato_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "aceites_contrato_redeId_aceito_em_idx" ON "aceites_contrato"("redeId", "aceito_em");

ALTER TABLE "aceites_contrato" ADD CONSTRAINT "aceites_contrato_redeId_fkey"
    FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Registro de aceite eletrônico da Política de Privacidade (por rede/GESTOR).
CREATE TABLE "aceites_privacidade" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'pt',
    "assinante_nome" TEXT NOT NULL,
    "assinante_email" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "aceito_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_privacidade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "aceites_privacidade_redeId_aceito_em_idx" ON "aceites_privacidade"("redeId", "aceito_em");

ALTER TABLE "aceites_privacidade" ADD CONSTRAINT "aceites_privacidade_redeId_fkey"
    FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Registro de aceite eletrônico dos Termos de Uso e Responsabilidade (por rede/GESTOR).
CREATE TABLE "aceites_termos_uso" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'pt',
    "assinante_nome" TEXT NOT NULL,
    "assinante_email" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "aceito_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_termos_uso_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "aceites_termos_uso_redeId_aceito_em_idx" ON "aceites_termos_uso"("redeId", "aceito_em");

ALTER TABLE "aceites_termos_uso" ADD CONSTRAINT "aceites_termos_uso_redeId_fkey"
    FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Aceite eletrônico da Política de Privacidade pela Assessora (Brand Partner).
CREATE TABLE "aceites_privacidade_assessor" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'pt',
    "assinanteNome" TEXT NOT NULL,
    "assinanteEmail" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_privacidade_assessor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "aceites_privacidade_assessor_assessorId_idx" ON "aceites_privacidade_assessor"("assessorId");

ALTER TABLE "aceites_privacidade_assessor" ADD CONSTRAINT "aceites_privacidade_assessor_assessorId_fkey"
    FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Aceite eletrônico dos Termos de Uso e Responsabilidade pela Assessora (Brand Partner).
CREATE TABLE "aceites_termos_uso_assessor" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'pt',
    "assinanteNome" TEXT NOT NULL,
    "assinanteEmail" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_termos_uso_assessor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "aceites_termos_uso_assessor_assessorId_idx" ON "aceites_termos_uso_assessor"("assessorId");

ALTER TABLE "aceites_termos_uso_assessor" ADD CONSTRAINT "aceites_termos_uso_assessor_assessorId_fkey"
    FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

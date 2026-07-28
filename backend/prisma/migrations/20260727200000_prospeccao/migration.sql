-- CreateTable
-- Captador Leads Zaieze: prospecção de empresas novas (fora do SaaS) via Google Places API, uso do
-- time comercial da própria ZAIEZE. Não confundir com "leads"/"zaiezeleads" (já existentes).
CREATE TABLE "prospeccao_buscas" (
    "id" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "segmento" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "raioKm" INTEGER,
    "tipoEmpresa" TEXT,
    "perfilIdeal" TEXT,
    "quantidade" INTEGER NOT NULL,
    "simulada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospeccao_buscas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospeccao_empresas" (
    "id" TEXT NOT NULL,
    "buscaId" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "telefone" TEXT,
    "site" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "notaGoogle" DECIMAL(2,1),
    "totalAvaliacoes" INTEGER,
    "horarioFuncionamento" JSONB,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospeccao_empresas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prospeccao_empresas_buscaId_idx" ON "prospeccao_empresas"("buscaId");

-- AddForeignKey
ALTER TABLE "prospeccao_buscas" ADD CONSTRAINT "prospeccao_buscas_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospeccao_empresas" ADD CONSTRAINT "prospeccao_empresas_buscaId_fkey" FOREIGN KEY ("buscaId") REFERENCES "prospeccao_buscas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "verificacoes_telefone_publico" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verificacoes_telefone_publico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verificacoes_telefone_publico_lojaId_telefone_idx" ON "verificacoes_telefone_publico"("lojaId", "telefone");

-- CreateTable
CREATE TABLE "aceites_termo_cliente_publico" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "aceitoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceites_termo_cliente_publico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aceites_termo_cliente_publico_lojaId_telefone_idx" ON "aceites_termo_cliente_publico"("lojaId", "telefone");

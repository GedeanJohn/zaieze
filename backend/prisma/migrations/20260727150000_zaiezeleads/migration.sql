-- CreateTable
-- Base de leads própria da ZAIEZE (cross-tenant, uso exclusivo do SUPER_ADMIN) — cópia
-- desacoplada de Cliente, populada por job periódico (sem FK/cascade de propósito).
CREATE TABLE "zaiezeleads" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "redeNome" TEXT NOT NULL,
    "lojaNome" TEXT NOT NULL,
    "vendedoraNome" TEXT,
    "origemCanal" "OrigemLead",
    "segmento" "SegmentoCliente" NOT NULL,
    "entradaEm" TIMESTAMP(3) NOT NULL,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zaiezeleads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zaiezeleads_clienteId_key" ON "zaiezeleads"("clienteId");

-- CreateIndex
CREATE INDEX "zaiezeleads_entradaEm_idx" ON "zaiezeleads"("entradaEm");

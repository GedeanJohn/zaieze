-- CreateTable
CREATE TABLE "pedidos_catalogo" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "itens" JSONB NOT NULL,
    "pecas" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedidos_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pedidos_catalogo_leadId_idx" ON "pedidos_catalogo"("leadId");

-- AddForeignKey
ALTER TABLE "pedidos_catalogo" ADD CONSTRAINT "pedidos_catalogo_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

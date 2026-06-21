-- Régua de desconto + limites de autorização por rede.
ALTER TABLE "redes" ADD COLUMN "descontoRegua" JSONB;
ALTER TABLE "redes" ADD COLUMN "descontoAutoMaxPct" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "redes" ADD COLUMN "descontoSenhaMaxPct" INTEGER NOT NULL DEFAULT 15;

-- % de desconto aplicado na venda (complementa o valor já existente em "desconto").
ALTER TABLE "vendas" ADD COLUMN "descontoPct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Histórico de auditoria de descontos.
CREATE TABLE "auditoria_desconto" (
  "id" TEXT NOT NULL,
  "lojaId" TEXT NOT NULL,
  "vendaId" TEXT,
  "usuarioId" TEXT NOT NULL,
  "usuarioNome" TEXT NOT NULL,
  "pct" DECIMAL(5,2) NOT NULL,
  "valorBruto" DECIMAL(12,2) NOT NULL,
  "valorDesconto" DECIMAL(12,2) NOT NULL,
  "autorizadoPorId" TEXT,
  "autorizadoPorNome" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auditoria_desconto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auditoria_desconto_lojaId_createdAt_idx" ON "auditoria_desconto"("lojaId", "createdAt");

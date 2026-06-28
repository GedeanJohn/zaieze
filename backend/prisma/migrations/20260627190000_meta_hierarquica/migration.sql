-- Meta mensal hierárquica: marca (rede) → loja → vendedora (derivada).
ALTER TABLE "redes" ADD COLUMN "metaMensal" DECIMAL(12,2);
ALTER TABLE "redes" ADD COLUMN "metaModo" TEXT NOT NULL DEFAULT 'IGUAL';
ALTER TABLE "lojas" ADD COLUMN "metaMensal" DECIMAL(12,2);

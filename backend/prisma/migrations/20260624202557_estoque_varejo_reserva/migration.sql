-- Reserva exclusiva de varejo (peças únicas) por variação; atacado usa estoque - estoqueVarejo.
ALTER TABLE "variacoes_produto" ADD COLUMN "estoqueVarejo" INTEGER NOT NULL DEFAULT 0;

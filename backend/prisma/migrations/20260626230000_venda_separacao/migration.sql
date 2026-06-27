-- Separação física do pedido (gestor de estoque). Pedidos existentes ficam como separados
-- (não há trabalho pendente retroativo); novos pedidos nascem pendentes (default false).
ALTER TABLE "vendas" ADD COLUMN "separado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendas" ADD COLUMN "separadoEm" TIMESTAMP(3);

UPDATE "vendas" SET "separado" = true, "separadoEm" = "createdAt";

-- AlterTable
-- waNumero nunca era escrito em nenhum lugar do código (campo órfão desde a migração pra
-- WhatsApp Cloud API) — a vendedora usa `telefone` (mesmo já usado pra recuperação de senha)
-- pro deep link wa.me da vitrine.
ALTER TABLE "usuarios" DROP COLUMN "waNumero";

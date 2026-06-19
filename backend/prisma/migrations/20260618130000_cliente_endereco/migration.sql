-- AlterTable: endereço do cliente (filtros geográficos — R1). Preenchido via CEP (ViaCEP).
ALTER TABLE "clientes" ADD COLUMN     "cep" TEXT,
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "uf" TEXT;

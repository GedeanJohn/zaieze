-- AlterTable: registra quando a mídia da coleção foi apagada do R2 (limpeza por plano)
ALTER TABLE "colecoes" ADD COLUMN     "midiaExpiradaEm" TIMESTAMP(3);

-- AlterTable: texto padrão de disparo definido pelo gestor + se a vendedora pode editar
ALTER TABLE "redes" ADD COLUMN     "textoDisparoPadrao" TEXT,
ADD COLUMN     "disparoVendedoraEditavel" BOOLEAN NOT NULL DEFAULT true;

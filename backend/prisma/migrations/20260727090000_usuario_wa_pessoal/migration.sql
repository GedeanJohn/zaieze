-- AlterTable
-- WhatsApp pessoal via QR Code (Baileys) — conexão alternativa à Cloud API da marca, por vendedora.
ALTER TABLE "usuarios" ADD COLUMN     "waPessoalConectado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waPessoalConectadoEm" TIMESTAMP(3),
ADD COLUMN     "waPessoalNumero" TEXT;

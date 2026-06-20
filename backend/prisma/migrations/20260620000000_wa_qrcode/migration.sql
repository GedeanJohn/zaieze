-- AlterTable: QR (base64) recebido do Evolution via webhook, exibido até a vendedora conectar
ALTER TABLE "usuarios" ADD COLUMN     "waQrcode" TEXT;

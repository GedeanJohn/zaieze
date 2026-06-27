-- Mídia nas mensagens do Chat (áudio/PTT). tipoMidia null = texto puro.
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "tipoMidia" TEXT;
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "midiaUrl" TEXT;

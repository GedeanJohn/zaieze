-- Cutover do WhatsApp: Evolution API → WhatsApp Cloud API (oficial da Meta)

-- Enum StatusMensagem: recibos de entrega/leitura
ALTER TYPE "StatusMensagem" ADD VALUE IF NOT EXISTS 'ENTREGUE';
ALTER TYPE "StatusMensagem" ADD VALUE IF NOT EXISTS 'LIDA';

-- Rede: configuração da WABA (UM número por marca)
ALTER TABLE "redes"
  ADD COLUMN     "waPhoneNumberId" TEXT,
  ADD COLUMN     "waWabaId" TEXT,
  ADD COLUMN     "waNumeroExibicao" TEXT,
  ADD COLUMN     "waTokenCifrado" TEXT,
  ADD COLUMN     "waVerifyToken" TEXT,
  ADD COLUMN     "waAppSecret" TEXT,
  ADD COLUMN     "waConectado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "waConectadoEm" TIMESTAMP(3);

-- Cliente: timestamp da última mensagem recebida (janela de 24h)
ALTER TABLE "clientes" ADD COLUMN     "waUltimaEntradaEm" TIMESTAMP(3);

-- MensagemWhatsapp: wamid (correlação de status) + nome do template usado
ALTER TABLE "mensagens_whatsapp"
  ADD COLUMN     "waMessageId" TEXT,
  ADD COLUMN     "templateNome" TEXT;
CREATE INDEX "mensagens_whatsapp_waMessageId_idx" ON "mensagens_whatsapp"("waMessageId");

-- Usuario: remove instância/QR do Evolution (mantém waNumero p/ deep link wa.me)
ALTER TABLE "usuarios"
  DROP COLUMN "waInstancia",
  DROP COLUMN "waConectado",
  DROP COLUMN "waQrcode";

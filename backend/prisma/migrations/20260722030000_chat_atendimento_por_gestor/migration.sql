-- Chat de Atendimento passa a ser comprado pelo GESTOR (dono = Rede), que atribui/reatribui
-- qual vendedora cada assinatura atende — em vez de autoatendimento por vendedora.
ALTER TABLE "assinaturas_chat_atendimento" DROP CONSTRAINT "assinaturas_chat_atendimento_usuarioId_fkey";
DROP INDEX "assinaturas_chat_atendimento_usuarioId_key";

ALTER TABLE "assinaturas_chat_atendimento" RENAME COLUMN "usuarioId" TO "vendedoraId";
ALTER TABLE "assinaturas_chat_atendimento" ALTER COLUMN "vendedoraId" DROP NOT NULL;

ALTER TABLE "assinaturas_chat_atendimento" ADD COLUMN "redeId" TEXT;
-- Tabela ainda sem dados reais neste ambiente (só usada em teste de leitura) — sem backfill.
ALTER TABLE "assinaturas_chat_atendimento" ALTER COLUMN "redeId" SET NOT NULL;

ALTER TABLE "assinaturas_chat_atendimento" ADD CONSTRAINT "assinaturas_chat_atendimento_redeId_fkey"
    FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assinaturas_chat_atendimento" ADD CONSTRAINT "assinaturas_chat_atendimento_vendedoraId_fkey"
    FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "assinaturas_chat_atendimento_redeId_idx" ON "assinaturas_chat_atendimento"("redeId");
CREATE INDEX "assinaturas_chat_atendimento_vendedoraId_idx" ON "assinaturas_chat_atendimento"("vendedoraId");

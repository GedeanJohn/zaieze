-- Chat de Atendimento: marca quando o estado (chatAtendimentoStatus/chatAtendimentoRespostas)
-- foi tocado por último, pra expirar uma conversa EM_ANDAMENTO parada há mais de 12h (ver
-- motor.service.ts) em vez de deixá-la travada pra sempre.
ALTER TABLE "clientes" ADD COLUMN "chatAtendimentoAtualizadoEm" TIMESTAMP(3);

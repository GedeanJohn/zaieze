-- Novos valores de enum para identificar mensagens/leads do Chat de Atendimento.
ALTER TYPE "OrigemMensagem" ADD VALUE 'CHAT_ATENDIMENTO';
ALTER TYPE "OrigemLead" ADD VALUE 'CHAT_ATENDIMENTO';

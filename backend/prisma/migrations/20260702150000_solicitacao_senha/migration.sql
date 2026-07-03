-- "Esqueci minha senha" (fallback humano quando o usuário não tem WhatsApp cadastrado)
CREATE TABLE "solicitacoes_senha" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "atendidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacoes_senha_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "solicitacoes_senha_usuarioId_atendidaEm_idx" ON "solicitacoes_senha"("usuarioId", "atendidaEm");

ALTER TABLE "solicitacoes_senha" ADD CONSTRAINT "solicitacoes_senha_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

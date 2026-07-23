-- Chat de Atendimento: campos de estado do bot no Cliente.
ALTER TABLE "clientes" ADD COLUMN "chatAtendimentoStatus" TEXT;
ALTER TABLE "clientes" ADD COLUMN "chatAtendimentoRespostas" JSONB;

-- Preço vigente do add-on (linha única, id=1).
CREATE TABLE "config_chat_atendimento" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "preco" DECIMAL(10,2) NOT NULL DEFAULT 39,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_chat_atendimento_pkey" PRIMARY KEY ("id")
);

-- Assinatura do add-on, por vendedora (Usuario).
CREATE TABLE "assinaturas_chat_atendimento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "status" "StatusAssinatura" NOT NULL DEFAULT 'PENDENTE',
    "valor" DECIMAL(10,2) NOT NULL,
    "mpPreapprovalId" TEXT,
    "simulada" BOOLEAN NOT NULL DEFAULT false,
    "cicloFimEm" TIMESTAMP(3),
    "cancelamentoSolicitadoEm" TIMESTAMP(3),
    "cancelamentoOrigem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_chat_atendimento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assinaturas_chat_atendimento_usuarioId_key" ON "assinaturas_chat_atendimento"("usuarioId");
CREATE UNIQUE INDEX "assinaturas_chat_atendimento_mpPreapprovalId_key" ON "assinaturas_chat_atendimento"("mpPreapprovalId");

ALTER TABLE "assinaturas_chat_atendimento" ADD CONSTRAINT "assinaturas_chat_atendimento_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Perfil de negócio da marca (1:1 com Rede) — cache gerado por IA (job periódico).
CREATE TABLE "perfil_negocio_rede" (
    "redeId" TEXT NOT NULL,
    "instagramStatus" TEXT NOT NULL DEFAULT 'nao_conectado',
    "perfilNegocio" JSONB,
    "roteiro" JSONB,
    "fonteDados" JSONB,
    "geradoEm" TIMESTAMP(3),
    "proximaAtualizacaoEm" TIMESTAMP(3),

    CONSTRAINT "perfil_negocio_rede_pkey" PRIMARY KEY ("redeId")
);

ALTER TABLE "perfil_negocio_rede" ADD CONSTRAINT "perfil_negocio_rede_redeId_fkey"
    FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

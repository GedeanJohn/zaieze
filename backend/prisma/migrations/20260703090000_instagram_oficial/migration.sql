-- Cliente.telefone vira opcional (cliente pode chegar só pelo Instagram, sem telefone)
ALTER TABLE "clientes" ALTER COLUMN "telefone" DROP NOT NULL;

-- Instagram oficial (Meta) no cliente: chave de roteamento + janela de 24h
ALTER TABLE "clientes" ADD COLUMN     "igScopedId" TEXT,
ADD COLUMN     "igUltimaEntradaEm" TIMESTAMP(3);

CREATE UNIQUE INDEX "clientes_lojaId_igScopedId_key" ON "clientes"("lojaId", "igScopedId");

-- Instagram oficial (Meta) na rede: config manual por marca, espelha os campos wa*
ALTER TABLE "redes" ADD COLUMN     "igBusinessAccountId" TEXT,
ADD COLUMN     "igPageId" TEXT,
ADD COLUMN     "igUsername" TEXT,
ADD COLUMN     "igTokenCifrado" TEXT,
ADD COLUMN     "igVerifyToken" TEXT,
ADD COLUMN     "igAppSecret" TEXT,
ADD COLUMN     "igConectado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "igConectadoEm" TIMESTAMP(3);

-- DMs do Instagram (espelha mensagens_whatsapp)
CREATE TABLE "mensagens_instagram" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "vendedoraId" TEXT NOT NULL,
    "direcao" "DirecaoMensagem" NOT NULL,
    "status" "StatusMensagem" NOT NULL,
    "origem" "OrigemMensagem" NOT NULL DEFAULT 'MANUAL',
    "igScopedId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "tipoMidia" TEXT,
    "midiaUrl" TEXT,
    "igMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_instagram_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mensagens_instagram_clienteId_createdAt_idx" ON "mensagens_instagram"("clienteId", "createdAt");
CREATE INDEX "mensagens_instagram_lojaId_createdAt_idx" ON "mensagens_instagram"("lojaId", "createdAt");
CREATE INDEX "mensagens_instagram_igMessageId_idx" ON "mensagens_instagram"("igMessageId");

ALTER TABLE "mensagens_instagram" ADD CONSTRAINT "mensagens_instagram_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mensagens_instagram" ADD CONSTRAINT "mensagens_instagram_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

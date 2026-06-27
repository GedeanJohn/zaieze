-- Foto de perfil da vendedora (exibida no cabeçalho do Chat Zaieze).
ALTER TABLE "usuarios" ADD COLUMN "fotoUrl" TEXT;

-- Disparo originado de um grupo de transmissão (lista interna).
ALTER TABLE "mensagens_whatsapp" ADD COLUMN "grupoId" TEXT;

-- Grupos de transmissão: a vendedora junta clientes da carteira; uma mensagem sai
-- individual a cada membro (a API oficial da Meta não suporta grupos nativos).
CREATE TABLE "grupos_transmissao" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grupos_transmissao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "grupos_membros" (
    "grupoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupos_membros_pkey" PRIMARY KEY ("grupoId","clienteId")
);

CREATE INDEX "grupos_transmissao_lojaId_vendedoraId_idx" ON "grupos_transmissao"("lojaId", "vendedoraId");

CREATE INDEX "grupos_membros_clienteId_idx" ON "grupos_membros"("clienteId");

CREATE INDEX "mensagens_whatsapp_grupoId_createdAt_idx" ON "mensagens_whatsapp"("grupoId", "createdAt");

ALTER TABLE "grupos_transmissao" ADD CONSTRAINT "grupos_transmissao_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grupos_transmissao" ADD CONSTRAINT "grupos_transmissao_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grupos_membros" ADD CONSTRAINT "grupos_membros_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "grupos_transmissao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grupos_membros" ADD CONSTRAINT "grupos_membros_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "grupos_transmissao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

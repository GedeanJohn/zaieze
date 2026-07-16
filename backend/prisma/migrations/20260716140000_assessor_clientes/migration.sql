-- Vitrine da assessora: botão "Ligar" passa a usar o mesmo número do WhatsApp — remove o campo
-- de telefone separado (não é mais usado por nada).
ALTER TABLE "assessores" DROP COLUMN "telefone";

-- "Clientes" deixa de ser um número autodeclarado — vira contagem de AssessorCliente.
ALTER TABLE "assessores" DROP COLUMN "statClientes";

-- CreateTable
CREATE TABLE "assessor_clientes" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessor_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessor_clientes_assessorId_idx" ON "assessor_clientes"("assessorId");

-- AddForeignKey
ALTER TABLE "assessor_clientes" ADD CONSTRAINT "assessor_clientes_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

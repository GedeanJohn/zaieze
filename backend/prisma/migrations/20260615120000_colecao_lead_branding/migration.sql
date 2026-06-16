-- CreateEnum
CREATE TYPE "StatusColecao" AS ENUM ('EM_PREPARACAO', 'LIBERADA');

-- CreateEnum
CREATE TYPE "StatusLead" AS ENUM ('ENTROU', 'ATENDIDO', 'NEGOCIANDO', 'CONVERTIDO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "OrigemLead" AS ENUM ('CATALOGO');

-- AlterTable: ciclo de vida da coleção
ALTER TABLE "colecoes" ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "status" "StatusColecao" NOT NULL DEFAULT 'EM_PREPARACAO',
ADD COLUMN     "liberadaEm" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Coleções pré-existentes já eram visíveis: mantém como liberadas.
UPDATE "colecoes" SET "status" = 'LIBERADA', "liberadaEm" = CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "colecoes_lojaId_status_idx" ON "colecoes"("lojaId", "status");

-- AlterTable: identidade visual da marca + SLA por etapa do funil (nível rede)
ALTER TABLE "redes" ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "corPrimaria" TEXT NOT NULL DEFAULT '#111111',
ADD COLUMN     "corSecundaria" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "slaEntrouMin" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "slaAtendidoMin" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "slaNegociandoMin" INTEGER NOT NULL DEFAULT 4320,
ADD COLUMN     "slaAutoRedistribuir" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "vendedoraId" TEXT NOT NULL,
    "clienteId" TEXT,
    "nome" TEXT,
    "telefone" TEXT,
    "origem" "OrigemLead" NOT NULL DEFAULT 'CATALOGO',
    "status" "StatusLead" NOT NULL DEFAULT 'ENTROU',
    "slugCatalogo" TEXT,
    "produtoId" TEXT,
    "etapaDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prazoEm" TIMESTAMP(3) NOT NULL,
    "atendidoEm" TIMESTAMP(3),
    "fechadoEm" TIMESTAMP(3),
    "motivoPerda" TEXT,
    "vendaId" TEXT,
    "redistribuidoEm" TIMESTAMP(3),
    "redistribuicoes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_lojaId_status_idx" ON "leads"("lojaId", "status");

-- CreateIndex
CREATE INDEX "leads_vendedoraId_status_idx" ON "leads"("vendedoraId", "status");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

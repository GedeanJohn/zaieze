-- Marca representada passa a permitir varios numeros de WhatsApp (ex.: "Atendimento", "Vendas")
-- em vez de um unico campo AssessorMarca.whatsapp.

-- CreateTable
CREATE TABLE "assessor_marca_whatsapps" (
    "id" TEXT NOT NULL,
    "assessorMarcaId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "rotulo" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessor_marca_whatsapps_pkey" PRIMARY KEY ("id")
);

-- Migra os numeros ja cadastrados (AssessorMarca.whatsapp) pra tabela nova antes de derrubar a coluna.
-- Usa 'mig_' || id da propria marca como id da linha migrada: cada marca contribui no maximo 1 linha
-- aqui, entao e unico sem precisar de extensao de geracao de uuid.
INSERT INTO "assessor_marca_whatsapps" ("id", "assessorMarcaId", "numero", "ordem", "createdAt")
SELECT 'mig_' || id, id, whatsapp, 0, now()
FROM "assessor_marcas"
WHERE whatsapp IS NOT NULL AND whatsapp <> '';

-- CreateIndex
CREATE INDEX "assessor_marca_whatsapps_assessorMarcaId_ordem_idx" ON "assessor_marca_whatsapps"("assessorMarcaId", "ordem");

-- AddForeignKey
ALTER TABLE "assessor_marca_whatsapps" ADD CONSTRAINT "assessor_marca_whatsapps_assessorMarcaId_fkey" FOREIGN KEY ("assessorMarcaId") REFERENCES "assessor_marcas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "assessor_marcas" DROP COLUMN "whatsapp";

-- AlterTable
ALTER TABLE "assessores" ADD COLUMN     "seguirAgenda" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "assessor_horarios" (
    "id" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "inicio" TEXT NOT NULL,
    "fim" TEXT NOT NULL,

    CONSTRAINT "assessor_horarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessor_horarios_assessorId_diaSemana_idx" ON "assessor_horarios"("assessorId", "diaSemana");

-- AddForeignKey
ALTER TABLE "assessor_horarios" ADD CONSTRAINT "assessor_horarios_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "assessores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

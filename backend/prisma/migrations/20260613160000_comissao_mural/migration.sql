-- CreateEnum
CREATE TYPE "EscopoComissao" AS ENUM ('PRODUTO', 'CATEGORIA', 'MARCA', 'PADRAO');

-- CreateTable
CREATE TABLE "regras_comissao" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "escopo" "EscopoComissao" NOT NULL,
    "refId" TEXT,
    "percentual" DECIMAL(5,2) NOT NULL,
    "percentualMeta" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regras_comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts_mural" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "imagemUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_mural_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "regras_comissao_lojaId_idx" ON "regras_comissao"("lojaId");

-- CreateIndex
CREATE UNIQUE INDEX "regras_comissao_lojaId_escopo_refId_key" ON "regras_comissao"("lojaId", "escopo", "refId");

-- CreateIndex
CREATE INDEX "posts_mural_lojaId_createdAt_idx" ON "posts_mural"("lojaId", "createdAt");

-- AddForeignKey
ALTER TABLE "regras_comissao" ADD CONSTRAINT "regras_comissao_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts_mural" ADD CONSTRAINT "posts_mural_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts_mural" ADD CONSTRAINT "posts_mural_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


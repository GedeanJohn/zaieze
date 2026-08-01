-- AlterTable
ALTER TABLE "mensagens_whatsapp" ADD COLUMN     "produtoId" TEXT,
ADD COLUMN     "variacaoId" TEXT;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_variacaoId_fkey" FOREIGN KEY ("variacaoId") REFERENCES "variacoes_produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

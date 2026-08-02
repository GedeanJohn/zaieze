-- Cupom de assento de vendedora ganha período de desconto (duracaoCiclos) e passa a ser
-- rastreado na própria assinatura (precoCheio/descontoCiclosRestantes), pra reverter ao preço
-- cheio automaticamente quando o prazo do desconto acabar.

-- AlterTable
ALTER TABLE "assinaturas_vendedora" ADD COLUMN     "codigoPromoId" TEXT,
ADD COLUMN     "descontoCiclosRestantes" INTEGER,
ADD COLUMN     "precoCheio" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "codigos_promocionais" ADD COLUMN     "duracaoCiclos" INTEGER;

-- AddForeignKey
ALTER TABLE "assinaturas_vendedora" ADD CONSTRAINT "assinaturas_vendedora_codigoPromoId_fkey" FOREIGN KEY ("codigoPromoId") REFERENCES "codigos_promocionais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

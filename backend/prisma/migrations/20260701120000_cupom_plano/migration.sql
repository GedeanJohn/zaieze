-- Cupom pode fixar um plano (oferta completa; link fica só ?cupom=). Null = qualquer plano.
ALTER TABLE "codigos_promocionais" ADD COLUMN     "plano" "Plano";

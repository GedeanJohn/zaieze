-- O assento da Duda Costa (rede "Aqui Tênis") nasceu em 2026-08-07 00:35, sob o modelo de
-- cobrança ANTIGO (por assento individual). Às 22:59 do mesmo dia a migração
-- 20260807230000_cobranca_consolidada_vendedora trocou o modelo para cobrança consolidada por
-- marca e deixou esse registro órfão: status PENDENTE com aprovadoEm já preenchido — combinação
-- que o código atual nunca produz sozinho (hoje os dois campos sempre mudam juntos) e que não
-- tinha como reprocessar pela tela (não aparece em pendentes-aprovacao, que exige aprovadoEm
-- nulo; "aprovar" rejeitaria com "já foi aprovada"; cupom exige status ATIVA).
--
-- O gestor (que criou o assento diretamente, GESTOR não precisa de aprovação de terceiros) nunca
-- soube que faltava pagar: o ConvidarModal daquela hora descartava o link de pagamento do
-- Mercado Pago da resposta da API — só passou a exibi-lo no commit 8d9758f, às 22:07, também do
-- mesmo dia (ver "Trava acesso de vendedora sem assento pago e conserta fluxo de cobranca").
--
-- Libera com o cupom promocional NOVAFASE (100%, ativo, nunca usado) em vez de gerar uma
-- cobrança real que ninguém pediu.
UPDATE "assinaturas_vendedora"
SET status = 'ATIVA', valor = 0, "codigoPromoId" = (SELECT id FROM "codigos_promocionais" WHERE codigo = 'NOVAFASE')
WHERE id = 'cmsi7qltz003imf01aq1zi7p3' AND status = 'PENDENTE';

UPDATE "codigos_promocionais" SET usos = usos + 1
WHERE codigo = 'NOVAFASE' AND EXISTS (
  SELECT 1 FROM "assinaturas_vendedora"
  WHERE id = 'cmsi7qltz003imf01aq1zi7p3' AND "codigoPromoId" = (SELECT id FROM "codigos_promocionais" WHERE codigo = 'NOVAFASE')
);

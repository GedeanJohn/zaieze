-- Exclusão de Rede precisa cascatear até registros que referenciam Usuario (vendedora/autor/
-- criador), senão prisma.rede.delete() falha com violação de FK assim que a rede tiver qualquer
-- venda, mensagem, campanha, post ou look ligado a alguma vendedora/usuário dela.

ALTER TABLE "vendas" DROP CONSTRAINT "vendas_vendedoraId_fkey";
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pedidos_reserva" DROP CONSTRAINT "pedidos_reserva_vendedoraId_fkey";
ALTER TABLE "pedidos_reserva" ADD CONSTRAINT "pedidos_reserva_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orcamentos" DROP CONSTRAINT "orcamentos_vendedoraId_fkey";
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campanhas" DROP CONSTRAINT "campanhas_criadaPorId_fkey";
ALTER TABLE "campanhas" ADD CONSTRAINT "campanhas_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campanhas_modelo" DROP CONSTRAINT "campanhas_modelo_criadaPorId_fkey";
ALTER TABLE "campanhas_modelo" ADD CONSTRAINT "campanhas_modelo_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mensagens_whatsapp" DROP CONSTRAINT "mensagens_whatsapp_vendedoraId_fkey";
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mensagens_instagram" DROP CONSTRAINT "mensagens_instagram_vendedoraId_fkey";
ALTER TABLE "mensagens_instagram" ADD CONSTRAINT "mensagens_instagram_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "posts_mural" DROP CONSTRAINT "posts_mural_autorId_fkey";
ALTER TABLE "posts_mural" ADD CONSTRAINT "posts_mural_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "looks_provador" DROP CONSTRAINT "looks_provador_criadoPorId_fkey";
ALTER TABLE "looks_provador" ADD CONSTRAINT "looks_provador_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assinaturas_vendedora" DROP CONSTRAINT "assinaturas_vendedora_solicitadoPorId_fkey";
ALTER TABLE "assinaturas_vendedora" ADD CONSTRAINT "assinaturas_vendedora_solicitadoPorId_fkey" FOREIGN KEY ("solicitadoPorId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

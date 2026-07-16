-- Recebimento das vendas: dados que o gestor cadastra pra loja receber diretamente do cliente
-- (PIX ou link de cobrança externo por cartão) — usado pela Vendedora ZAIEZE ao fechar venda.
ALTER TABLE "redes" ADD COLUMN "chavePixTipo" TEXT;
ALTER TABLE "redes" ADD COLUMN "chavePix" TEXT;
ALTER TABLE "redes" ADD COLUMN "linkPagamentoCartao" TEXT;

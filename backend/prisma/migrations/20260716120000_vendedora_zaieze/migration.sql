-- Vendedora ZAIEZE: arquitetura base (vendedora sintética, loja padrão da rede,
-- addon pago, origem de lead, conferência de pagamento).

-- Usuario: marca o Usuario sintético que representa a Vendedora ZAIEZE numa loja.
ALTER TABLE "usuarios" ADD COLUMN "ehAgenteIa" BOOLEAN NOT NULL DEFAULT false;

-- Rede: loja padrão onde a Vendedora ZAIEZE lança as vendas que fecha.
ALTER TABLE "redes" ADD COLUMN "lojaVendedoraIaId" TEXT;

-- TipoAddon: novo valor de enum.
ALTER TYPE "TipoAddon" ADD VALUE IF NOT EXISTS 'VENDEDORA_ZAIEZE';

-- OrigemLead: novo valor de enum.
ALTER TYPE "OrigemLead" ADD VALUE IF NOT EXISTS 'VENDEDORA_IA';

-- Venda: conferência do recebimento (bater com o extrato bancário) antes da separação física.
ALTER TABLE "vendas" ADD COLUMN "pagamentoConferido" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendas" ADD COLUMN "pagamentoConferidoEm" TIMESTAMP(3);

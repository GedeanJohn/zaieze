-- Estampa/padronagem na variação (ex.: Paisley, Floral). Vazio = liso/sem estampa.
ALTER TABLE "variacoes_produto" ADD COLUMN "estampa" TEXT NOT NULL DEFAULT '';

-- Unicidade da grade passa a considerar a estampa: (produto, cor, estampa, tamanho).
DROP INDEX "variacoes_produto_produtoId_cor_tamanho_key";
CREATE UNIQUE INDEX "variacoes_produto_produtoId_cor_estampa_tamanho_key"
  ON "variacoes_produto"("produtoId", "cor", "estampa", "tamanho");

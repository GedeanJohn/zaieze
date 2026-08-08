-- Cobrança de vendedora deixa de ser por assento individual e passa a ser CONSOLIDADA por marca,
-- com desconto por volume (ver faixas_desconto_vendedora). assinaturas_vendedora continua
-- existindo só como registro de MEMBRO (quem ocupa a vaga) — ver assinatura-vendedora-rede.service.ts.

-- CreateTable
CREATE TABLE "faixas_desconto_vendedora" (
    "id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "valorTotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faixas_desconto_vendedora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "faixas_desconto_vendedora_quantidade_key" ON "faixas_desconto_vendedora"("quantidade");

-- CreateTable
CREATE TABLE "assinaturas_vendedora_rede" (
    "id" TEXT NOT NULL,
    "redeId" TEXT NOT NULL,
    "status" "StatusAssinatura" NOT NULL DEFAULT 'PENDENTE',
    "valor" DECIMAL(10,2) NOT NULL,
    "valorProximoCiclo" DECIMAL(10,2),
    "qtdPaga" INTEGER NOT NULL DEFAULT 0,
    "mpPreapprovalId" TEXT,
    "simulada" BOOLEAN NOT NULL DEFAULT false,
    "cicloFimEm" TIMESTAMP(3),
    "cancelamentoSolicitadoEm" TIMESTAMP(3),
    "cancelamentoOrigem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_vendedora_rede_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_vendedora_rede_redeId_key" ON "assinaturas_vendedora_rede"("redeId");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_vendedora_rede_mpPreapprovalId_key" ON "assinaturas_vendedora_rede"("mpPreapprovalId");

-- AddForeignKey
ALTER TABLE "assinaturas_vendedora_rede" ADD CONSTRAINT "assinaturas_vendedora_rede_redeId_fkey" FOREIGN KEY ("redeId") REFERENCES "redes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed inicial das faixas (valores combinados com o usuário: 1->559,90, 2->900, 3->1200).
INSERT INTO "faixas_desconto_vendedora" ("id", "quantidade", "valorTotal", "updatedAt") VALUES
  ('faixa_1', 1, 559.90, now()),
  ('faixa_2', 2, 900.00, now()),
  ('faixa_3', 3, 1200.00, now())
ON CONFLICT ("quantidade") DO NOTHING;

-- Backfill: cria a cobrança consolidada (PENDENTE, sem preapproval real ainda) pra qualquer rede
-- que já tenha assento ATIVA e pago (valor > 0) hoje. Na base atual nenhuma rede se enquadra
-- (o único assento pago que existe está PENDENTE, não ATIVA), então este INSERT não afeta nada
-- agora — é só pra não deixar uma rede paga órfã de cobrança consolidada se isso mudar até o
-- deploy. Acima da maior faixa cadastrada, extrapola com o incremento entre as duas últimas.
WITH contagem AS (
  SELECT "redeId", COUNT(*) AS qtd
  FROM "assinaturas_vendedora"
  WHERE status = 'ATIVA' AND valor > 0
  GROUP BY "redeId"
),
maxfaixa AS (
  SELECT quantidade AS qmax, "valorTotal" AS vmax FROM "faixas_desconto_vendedora" ORDER BY quantidade DESC LIMIT 1
),
penultfaixa AS (
  SELECT quantidade AS qpen, "valorTotal" AS vpen FROM "faixas_desconto_vendedora" ORDER BY quantidade DESC OFFSET 1 LIMIT 1
)
INSERT INTO "assinaturas_vendedora_rede" ("id", "redeId", "status", "valor", "qtdPaga", "updatedAt")
SELECT
  'mig_' || c."redeId",
  c."redeId",
  'PENDENTE',
  COALESCE(f."valorTotal", m.vmax + (m.vmax - COALESCE(p.vpen, m.vmax)) * (c.qtd - m.qmax)),
  c.qtd,
  now()
FROM contagem c
LEFT JOIN "faixas_desconto_vendedora" f ON f.quantidade = c.qtd
CROSS JOIN maxfaixa m
LEFT JOIN penultfaixa p ON true
WHERE c.qtd > 0;

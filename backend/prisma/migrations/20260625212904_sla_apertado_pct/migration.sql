-- Regra do "laranja" do funil: % do prazo restante para considerar apertado.
ALTER TABLE "redes" ADD COLUMN "slaApertadoPct" INTEGER NOT NULL DEFAULT 20;

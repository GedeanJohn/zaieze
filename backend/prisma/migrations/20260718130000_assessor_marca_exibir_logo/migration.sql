-- Card da vitrine: mostrar a logo da marca (contida, centralizada) no lugar do nome + foto de fundo.
ALTER TABLE "assessor_marcas" ADD COLUMN "exibirLogo" BOOLEAN NOT NULL DEFAULT false;

-- Cor de cada foto (alinhado por índice com fotos; '' = serve para todas as cores).
ALTER TABLE "produtos" ADD COLUMN "fotosCores" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable (idioma preferencial da interface — escolhido no cadastro, editável em "Minha conta")
ALTER TABLE "usuarios" ADD COLUMN "idioma" TEXT NOT NULL DEFAULT 'pt';

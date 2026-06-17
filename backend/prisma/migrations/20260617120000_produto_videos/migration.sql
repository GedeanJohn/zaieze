-- AlterTable: URLs de vídeo do produto (Cloudflare R2 / cdn.zaieze.com)
ALTER TABLE "produtos" ADD COLUMN     "videos" TEXT[] DEFAULT ARRAY[]::TEXT[];

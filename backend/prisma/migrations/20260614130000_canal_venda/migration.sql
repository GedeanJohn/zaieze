-- CreateEnum
CREATE TYPE "CanalVenda" AS ENUM ('BALCAO', 'ONLINE');

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "canal" "CanalVenda" NOT NULL DEFAULT 'BALCAO';


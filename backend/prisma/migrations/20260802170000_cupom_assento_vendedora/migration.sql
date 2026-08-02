-- AlterEnum
BEGIN;
CREATE TYPE "AplicacaoPromo_new" AS ENUM ('VENDEDORA', 'ASSESSOR');
ALTER TABLE "public"."codigos_promocionais" ALTER COLUMN "aplicaA" DROP DEFAULT;
ALTER TABLE "codigos_promocionais" ALTER COLUMN "aplicaA" TYPE "AplicacaoPromo_new" USING ("aplicaA"::text::"AplicacaoPromo_new");
ALTER TYPE "AplicacaoPromo" RENAME TO "AplicacaoPromo_old";
ALTER TYPE "AplicacaoPromo_new" RENAME TO "AplicacaoPromo";
DROP TYPE "public"."AplicacaoPromo_old";
ALTER TABLE "codigos_promocionais" ALTER COLUMN "aplicaA" SET DEFAULT 'VENDEDORA';
COMMIT;

-- AlterEnum
ALTER TYPE "TipoPromocao" ADD VALUE 'VALOR_FIXO';

-- AlterTable
ALTER TABLE "codigos_promocionais" DROP COLUMN "plano",
ADD COLUMN     "valorFixo" DECIMAL(10,2),
ALTER COLUMN "aplicaA" SET DEFAULT 'VENDEDORA';

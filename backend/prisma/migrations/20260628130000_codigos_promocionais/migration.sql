-- Códigos promocionais (descontos por tempo / % na mensalidade).
CREATE TYPE "TipoPromocao" AS ENUM ('DIAS_GRATIS', 'PERCENTUAL');

CREATE TABLE "codigos_promocionais" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "TipoPromocao" NOT NULL,
    "dias" INTEGER,
    "percentual" DECIMAL(5,2),
    "descricao" TEXT,
    "validadeAte" TIMESTAMP(3),
    "maxUsos" INTEGER,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "codigos_promocionais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "codigos_promocionais_codigo_key" ON "codigos_promocionais"("codigo");

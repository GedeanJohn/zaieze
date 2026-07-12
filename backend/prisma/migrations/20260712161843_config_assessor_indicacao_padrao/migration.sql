-- CreateTable
CREATE TABLE "config_assessor_indicacao" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "percentualPadrao" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_assessor_indicacao_pkey" PRIMARY KEY ("id")
);

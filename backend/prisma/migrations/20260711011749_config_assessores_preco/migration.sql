-- CreateTable
CREATE TABLE "config_assessores" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "precoMensal" DECIMAL(10,2) NOT NULL DEFAULT 89.99,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_assessores_pkey" PRIMARY KEY ("id")
);

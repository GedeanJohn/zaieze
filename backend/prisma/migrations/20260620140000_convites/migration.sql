-- CreateTable: convites por link (onboarding — a pessoa cria a própria senha ao aceitar)
CREATE TABLE "convites" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "role" "Role" NOT NULL,
    "redeId" TEXT,
    "lojaId" TEXT,
    "equipeId" TEXT,
    "criadoPorId" TEXT,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "convites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convites_token_key" ON "convites"("token");
CREATE INDEX "convites_redeId_usado_idx" ON "convites"("redeId", "usado");

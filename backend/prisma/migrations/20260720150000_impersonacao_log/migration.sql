-- CreateTable: auditoria de "entrar como" (SUPER_ADMIN ou GESTOR operando a sessao de outro usuario)
CREATE TABLE "impersonacao_log" (
    "id" TEXT NOT NULL,
    "operadorId" TEXT NOT NULL,
    "operadorNome" TEXT NOT NULL,
    "operadorRole" "Role" NOT NULL,
    "usuarioAlvoId" TEXT NOT NULL,
    "usuarioAlvoNome" TEXT NOT NULL,
    "usuarioAlvoRole" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "impersonacao_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "impersonacao_log_usuarioAlvoId_createdAt_idx" ON "impersonacao_log"("usuarioAlvoId", "createdAt");

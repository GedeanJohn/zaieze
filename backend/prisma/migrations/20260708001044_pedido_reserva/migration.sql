-- CreateEnum
CREATE TYPE "StatusPedidoReserva" AS ENUM ('PENDENTE', 'DISPONIVEL', 'CONVERTIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "pedidos_reserva" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "vendedoraId" TEXT NOT NULL,
    "variacaoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(12,2) NOT NULL,
    "atacado" BOOLEAN NOT NULL DEFAULT false,
    "status" "StatusPedidoReserva" NOT NULL DEFAULT 'PENDENTE',
    "observacao" TEXT,
    "vendaId" TEXT,
    "disponivelEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_reserva_vendaId_key" ON "pedidos_reserva"("vendaId");

-- CreateIndex
CREATE INDEX "pedidos_reserva_lojaId_status_idx" ON "pedidos_reserva"("lojaId", "status");

-- CreateIndex
CREATE INDEX "pedidos_reserva_variacaoId_status_idx" ON "pedidos_reserva"("variacaoId", "status");

-- CreateIndex
CREATE INDEX "pedidos_reserva_vendedoraId_status_idx" ON "pedidos_reserva"("vendedoraId", "status");

-- AddForeignKey
ALTER TABLE "pedidos_reserva" ADD CONSTRAINT "pedidos_reserva_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "lojas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_reserva" ADD CONSTRAINT "pedidos_reserva_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_reserva" ADD CONSTRAINT "pedidos_reserva_vendedoraId_fkey" FOREIGN KEY ("vendedoraId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_reserva" ADD CONSTRAINT "pedidos_reserva_variacaoId_fkey" FOREIGN KEY ("variacaoId") REFERENCES "variacoes_produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_reserva" ADD CONSTRAINT "pedidos_reserva_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

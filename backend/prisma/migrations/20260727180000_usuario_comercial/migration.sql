-- AlterTable
-- Distingue o login "Gestor Comercial do Sistema" do "Gestor Administrador do Sistema" — ambos
-- são Role.SUPER_ADMIN (mesmas atribuições); só o rótulo exibido muda.
ALTER TABLE "usuarios" ADD COLUMN     "comercial" BOOLEAN NOT NULL DEFAULT false;

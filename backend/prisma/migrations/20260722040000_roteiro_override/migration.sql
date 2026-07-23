-- Personalização manual do roteiro do Chat de Atendimento (tem prioridade sobre o gerado por IA).
ALTER TABLE "perfil_negocio_rede" ADD COLUMN "roteiroOverride" JSONB;

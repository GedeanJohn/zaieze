/**
 * Termo de responsabilidade do cliente público (sem login) no "Meus pedidos" do perfil da
 * vendedora — aceito no momento em que ele confirma o código de verificação por WhatsApp.
 * Ao alterar o texto de forma relevante, incremente TERMO_CLIENTE_VERSAO (aceites antigos ficam
 * registrados com a versão que valia na hora — ver AceiteTermoClientePublico.versao).
 */
export const TERMO_CLIENTE_VERSAO = '1.0-2026-07'

export const TERMO_CLIENTE_TEXTO =
  'Ao confirmar o código recebido, declaro que sou responsável pelo número de WhatsApp informado ' +
  'e por qualquer acesso de terceiros a partir dele — inclusive se eu compartilhar o código ou ' +
  'deixar este aparelho conectado. Autorizo a loja a me identificar por este número e mostrar os ' +
  'pedidos vinculados a ele.'

/** Normaliza um telefone/WhatsApp para só dígitos (com DDI) — permite busca exata no banco. */
export function normalizarTelefone(v: string): string {
  return v.replace(/\D/g, '')
}

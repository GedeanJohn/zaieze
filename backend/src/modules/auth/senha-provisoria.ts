import crypto from 'node:crypto'

// Sem 0/O/1/I/L — evita confusão na hora de digitar a senha lida no WhatsApp.
const ALFABETO_SENHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Gera uma senha provisória aleatória e fácil de digitar (usada no "esqueci minha senha"). */
export function gerarSenhaProvisoria(tamanho = 8): string {
  let s = ''
  for (let i = 0; i < tamanho; i++) s += ALFABETO_SENHA[crypto.randomInt(ALFABETO_SENHA.length)]
  return s
}

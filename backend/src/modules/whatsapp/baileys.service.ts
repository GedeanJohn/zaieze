import path from 'node:path'
import fs from 'node:fs/promises'
import type { StatusMensagem } from '@prisma/client'
import type { ConnectionState } from 'baileys'
import { prisma } from '../../lib/prisma'
import { env } from '../../env'
import { registrarMensagemRecebida } from './whatsapp.service'

/**
 * WhatsApp PESSOAL via QR Code — conexão alternativa à Cloud API da marca, por VENDEDORA
 * individual. Usa Baileys direto (protocolo não-oficial do WhatsApp Web; sem Evolution no meio).
 *
 * O pacote `baileys` é ESM-only; o projeto compila para CommonJS — por isso todo acesso passa
 * por `await import('baileys')` (nunca `require` estático), carregado 1x e cacheado.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WASocket = any

interface Sessao {
  sock: WASocket
}

const sessoes = new Map<string, Sessao>()

let baileysMod: typeof import('baileys') | null = null
async function carregarBaileys() {
  if (!baileysMod) baileysMod = await import('baileys')
  return baileysMod
}

function sessionDir(usuarioId: string): string {
  return path.resolve(process.cwd(), env.WA_SESSIONS_DIR, usuarioId)
}

/** Extrai só os dígitos do número a partir de um JID do Baileys (ex.: "5562999...:12@s.whatsapp.net"). */
function numeroDoJid(jid?: string | null): string | null {
  if (!jid) return null
  return jid.split('@')[0].split(':')[0].replace(/\D/g, '') || null
}

async function marcarConectado(usuarioId: string, numero: string | null): Promise<void> {
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { waPessoalConectado: true, waPessoalConectadoEm: new Date(), waPessoalNumero: numero },
  })
}

async function marcarDesconectado(usuarioId: string): Promise<void> {
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { waPessoalConectado: false, waPessoalConectadoEm: null, waPessoalNumero: null },
  })
}

/** Encaminha uma mensagem recebida no WhatsApp pessoal — o dono já é conhecido (a própria vendedora
 * da sessão), sem a ambiguidade de roteamento que o webhook da Meta (número por marca) precisa resolver. */
async function encaminharRecebida(usuarioId: string, numero: string, texto: string, nome?: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { lojaId: true } })
  if (!usuario?.lojaId) return
  const cliente = await prisma.cliente.upsert({
    where: { lojaId_telefone: { lojaId: usuario.lojaId, telefone: numero } },
    create: {
      lojaId: usuario.lojaId, telefone: numero, nome: nome?.trim() || 'Cliente do WhatsApp',
      vendedoraId: usuarioId, consentimentoLgpd: true, observacoes: 'Entrou pelo WhatsApp pessoal da vendedora',
    },
    update: {},
    select: { id: true, lojaId: true, vendedoraId: true, chatAtendimentoStatus: true, loja: { select: { redeId: true } } },
  })
  if (!cliente.vendedoraId) return
  await registrarMensagemRecebida({ cliente: { ...cliente, vendedoraId: cliente.vendedoraId }, numero, texto, nome })
    .catch((e) => console.error('[baileys] falha ao registrar mensagem recebida', usuarioId, e))
}

/**
 * Abre (ou restaura) a sessão do WhatsApp pessoal da vendedora. Resolve assim que houver um QR
 * pra mostrar OU a conexão abrir sozinha (sessão salva restaurada sem precisar de novo QR) —
 * mesmo contrato do antigo `conectarInstancia` do Evolution: o chamador recebe o QR (base64)
 * direto na resposta, sem depender de webhook.
 */
export async function iniciarConexao(usuarioId: string): Promise<{ qrCode?: string; conectado?: boolean }> {
  const existente = sessoes.get(usuarioId)
  if (existente?.sock?.user) return { conectado: true }

  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = await carregarBaileys()
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(usuarioId))
  const sock = makeWASocket({ auth: state })
  sessoes.set(usuarioId, { sock })

  return new Promise((resolve) => {
    let resolvido = false
    const resolver = (r: { qrCode?: string; conectado?: boolean }) => {
      if (resolvido) return
      resolvido = true
      clearTimeout(timeout)
      resolve(r)
    }
    const timeout = setTimeout(() => resolver({}), 20_000)

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, qr, lastDisconnect } = update
      if (qr) {
        const { default: QRCode } = await import('qrcode')
        resolver({ qrCode: await QRCode.toDataURL(qr) })
      }
      if (connection === 'open') {
        const numero = numeroDoJid(state.creds.me?.id)
        await marcarConectado(usuarioId, numero)
        resolver({ conectado: true })
      }
      if (connection === 'close') {
        sessoes.delete(usuarioId)
        const status = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
        if (status !== DisconnectReason.loggedOut) {
          // Sessão ainda válida (queda de rede, etc.) — reconecta sozinho com as credenciais salvas.
          iniciarConexao(usuarioId).catch((e) => console.error('[baileys] falha ao reconectar', usuarioId, e))
        } else {
          await marcarDesconectado(usuarioId)
          await fs.rm(sessionDir(usuarioId), { recursive: true, force: true }).catch(() => {})
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[]; type: string }) => {
      if (type !== 'notify') return
      for (const m of messages) {
        if (m.key?.fromMe) continue
        const numero = numeroDoJid(m.key?.remoteJid)
        const texto = m.message?.conversation ?? m.message?.extendedTextMessage?.text
        if (!numero || !texto) continue
        await encaminharRecebida(usuarioId, numero, texto, m.pushName ?? undefined)
      }
    })
  })
}

/** Desconecta e apaga a sessão (fluxo "Trocar número" — o próximo `iniciarConexao` gera um QR novo). */
export async function desconectar(usuarioId: string): Promise<void> {
  const sessao = sessoes.get(usuarioId)
  sessoes.delete(usuarioId)
  if (sessao?.sock) {
    try { await sessao.sock.logout() } catch { /* pode já estar desconectado do lado da Meta */ }
  }
  await fs.rm(sessionDir(usuarioId), { recursive: true, force: true }).catch(() => {})
  await marcarDesconectado(usuarioId)
}

/** true se a vendedora tem uma sessão Baileys ativa neste processo agora. */
export function estaConectado(usuarioId: string): boolean {
  return Boolean(sessoes.get(usuarioId)?.sock?.user)
}

/** Envia texto pelo WhatsApp pessoal da vendedora. Sem sessão ativa → SIMULADA. */
export async function enviarTextoBaileys(usuarioId: string, telefone: string, texto: string): Promise<{ status: StatusMensagem; waMessageId?: string; erro?: string }> {
  const sessao = sessoes.get(usuarioId)
  if (!sessao?.sock?.user) return { status: 'SIMULADA' }
  try {
    const jid = `${telefone.replace(/\D/g, '')}@s.whatsapp.net`
    const r = await sessao.sock.sendMessage(jid, { text: texto })
    return { status: 'ENVIADA', waMessageId: r?.key?.id ?? undefined }
  } catch (e) {
    return { status: 'FALHA', erro: String(e) }
  }
}

/**
 * Restaura, no boot do servidor, as sessões que estavam conectadas antes do restart (o container
 * pode subir de novo a qualquer momento — as credenciais persistidas no volume `wa-sessions`
 * bastam pra reabrir sem exigir um novo QR). Falhas de restauração (sessão invalidada remotamente)
 * já caem no fluxo normal de `connection.update`/`close`, que marca desconectado no banco.
 */
export async function restaurarConexoes(): Promise<void> {
  const usuarios = await prisma.usuario.findMany({ where: { waPessoalConectado: true }, select: { id: true } })
  for (const u of usuarios) {
    iniciarConexao(u.id).catch((e) => console.error('[baileys] falha ao restaurar sessão', u.id, e))
  }
}

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

// QR mais recente por usuário (data URL). O WhatsApp ROTACIONA o QR sozinho a cada ~20-60s
// enquanto ninguém escaneia — sem isso, a tela ficava com uma imagem parada/vencida, a câmera lia
// normalmente mas o pareamento falhava (WhatsApp pedia "escaneie novamente" em loop, porque o
// código lido já não era mais o atual do lado do servidor).
const qrsAtuais = new Map<string, string>()

/** QR code (data URL) mais recente pro usuário, se ainda estiver no meio do pareamento. */
export function obterQrAtual(usuarioId: string): string | null {
  return qrsAtuais.get(usuarioId) ?? null
}

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

/** Tipo de mídia recebida (imagem/áudio/vídeo) — só pra rotular a mensagem no Chat Zaieze.
 * Decisão de produto: NÃO baixar/guardar o arquivo (a vendedora já vê a mídia no próprio celular,
 * que é o dono real da conversa no WhatsApp pessoal) — evita gasto de memória/storage à toa.
 * Diferente do canal oficial (Cloud API), onde não existe celular nenhum por trás do número. */
function tipoDaMidiaBaileys(m: any): string | null {
  const conteudo = m.message ?? {}
  if (conteudo.imageMessage) return 'IMAGEM'
  if (conteudo.audioMessage) return 'AUDIO'
  if (conteudo.videoMessage) return 'VIDEO'
  return null
}

/** Texto exibível no Chat Zaieze pra qualquer tipo de mensagem recebida (não só texto puro). */
function textoDaMensagemBaileys(m: any): string | null {
  const conteudo = m.message ?? {}
  if (conteudo.conversation) return conteudo.conversation
  if (conteudo.extendedTextMessage?.text) return conteudo.extendedTextMessage.text
  if (conteudo.imageMessage) return conteudo.imageMessage.caption || '[imagem]'
  if (conteudo.videoMessage) return conteudo.videoMessage.caption || '[vídeo]'
  if (conteudo.audioMessage) return '[áudio]'
  if (conteudo.stickerMessage) return '[figurinha]'
  if (conteudo.documentMessage) return conteudo.documentMessage.fileName || '[documento]'
  return null
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
 * da sessão), sem a ambiguidade de roteamento que o webhook da Meta (número por marca) precisa resolver.
 * Mídia (imagem/áudio/vídeo) vira só uma etiqueta na conversa — sem baixar o arquivo (ver `tipoDaMidiaBaileys`). */
async function encaminharRecebida(usuarioId: string, numero: string, m: any, nome?: string) {
  const texto = textoDaMensagemBaileys(m)
  if (!texto) return // tipo de mensagem sem texto/mídia tratado (ex.: reação, enquete) — ignora

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
  await registrarMensagemRecebida({
    cliente: { ...cliente, vendedoraId: cliente.vendedoraId }, numero, texto, nome,
    tipoMidia: tipoDaMidiaBaileys(m),
  }).catch((e) => console.error('[baileys] falha ao registrar mensagem recebida', usuarioId, e))
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

  const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = await carregarBaileys()
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(usuarioId))
  // A versão do protocolo do WhatsApp Web embutida no pacote `baileys` fica desatualizada com o
  // tempo — a Meta passa a rejeitar a conexão ("Connection Failure" no handshake de registro,
  // QR nunca chega a ser emitido). Buscar a versão mais recente a cada conexão evita esse problema
  // se autoatualizar sozinho, em vez de depender de fixar manualmente um número de versão (como
  // era preciso no antigo Evolution — ver zaieze-evolution-qr-quebrado, memória histórica).
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({ auth: state, version })
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
        const dataUrl = await QRCode.toDataURL(qr)
        qrsAtuais.set(usuarioId, dataUrl) // sempre atualiza, mesmo depois do 1º QR (rotação)
        resolver({ qrCode: dataUrl })
      }
      if (connection === 'open') {
        qrsAtuais.delete(usuarioId)
        const numero = numeroDoJid(state.creds.me?.id)
        await marcarConectado(usuarioId, numero)
        resolver({ conectado: true })
      }
      if (connection === 'close') {
        sessoes.delete(usuarioId)
        const status = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode
        if (status === DisconnectReason.loggedOut) {
          qrsAtuais.delete(usuarioId)
          await marcarDesconectado(usuarioId)
          await fs.rm(sessionDir(usuarioId), { recursive: true, force: true }).catch(() => {})
        } else if (state.creds.registered) {
          // Sessão já tinha pareado antes (queda de rede, etc.) — reconecta sozinho com as credenciais salvas.
          iniciarConexao(usuarioId).catch((e) => console.error('[baileys] falha ao reconectar', usuarioId, e))
        } else {
          // Falhou ANTES de completar o pareamento (ex.: handshake rejeitado) — não retenta sozinho
          // pra não empilhar tentativas idênticas em loop; resolve agora pro chamador (tela de QR)
          // mostrar o erro e deixar o usuário decidir se tenta de novo.
          console.error('[baileys] falha ao parear (sem QR/login concluído)', usuarioId, lastDisconnect?.error)
          resolver({})
        }
      }
    })

    sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[]; type: string }) => {
      if (type !== 'notify') return
      for (const m of messages) {
        if (m.key?.fromMe) continue
        const numero = numeroDoJid(m.key?.remoteJid)
        if (!numero) continue
        await encaminharRecebida(usuarioId, numero, m, m.pushName ?? undefined)
      }
    })
  })
}

/** Desconecta e apaga a sessão (fluxo "Trocar número" — o próximo `iniciarConexao` gera um QR novo). */
export async function desconectar(usuarioId: string): Promise<void> {
  const sessao = sessoes.get(usuarioId)
  sessoes.delete(usuarioId)
  qrsAtuais.delete(usuarioId)
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

/** Envia áudio (PTT/mensagem de voz) pelo WhatsApp pessoal da vendedora. Sem sessão ativa → SIMULADA. */
export async function enviarAudioBaileys(usuarioId: string, telefone: string, buffer: Buffer): Promise<{ status: StatusMensagem; waMessageId?: string; erro?: string }> {
  const sessao = sessoes.get(usuarioId)
  if (!sessao?.sock?.user) return { status: 'SIMULADA' }
  try {
    const jid = `${telefone.replace(/\D/g, '')}@s.whatsapp.net`
    const r = await sessao.sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true })
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

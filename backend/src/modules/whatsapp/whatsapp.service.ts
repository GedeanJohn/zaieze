import { enviarTexto, uploadMidia, enviarMidia, type EnvioResultado, type RedeWA } from './meta.service'
import { estaConectado as baileysConectado, enviarTextoBaileys, enviarAudioBaileys } from './baileys.service'
import { prisma } from '../../lib/prisma'
import { garantirCicloAberto } from '../leads/leads.service'
import { usuarioEhAgenteIa, responderVendedoraZaieze } from '../vendedora-zaieze/vendedora-zaieze.service'
import { chatAtendimentoAtivo } from '../chat-atendimento/assinatura-chat-atendimento.service'
import { responderChatAtendimento } from '../chat-atendimento/motor.service'

export interface DadosTemplate {
  nome: string
  loja: string
  vendedora: string
  totalGasto?: number
  diasSemCompra?: number | null
  segmento?: string
  /** Link público do catálogo da vendedora (Portal do Cliente). Vazio quando o plano não inclui o portal. */
  link?: string
}

/** Substitui os placeholders do template pela informação do cliente. */
export function aplicarTemplate(template: string, d: DadosTemplate): string {
  const primeiro = d.nome.trim().split(/\s+/)[0] ?? d.nome
  const real = (v?: number) => `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  return template
    .replaceAll('{nome}', d.nome)
    .replaceAll('{primeiroNome}', primeiro)
    .replaceAll('{loja}', d.loja)
    .replaceAll('{vendedora}', d.vendedora)
    .replaceAll('{totalGasto}', real(d.totalGasto))
    .replaceAll('{diasSemCompra}', d.diasSemCompra != null ? String(d.diasSemCompra) : '—')
    .replaceAll('{segmento}', d.segmento ?? '')
    .replaceAll('{link}', d.link ?? '')
}

/**
 * Envia uma mensagem de TEXTO. Se a vendedora tiver o WhatsApp pessoal conectado (Baileys/QR
 * Code), envia por ali com PRIORIDADE (é o motivo de existir a conexão pessoal — o cliente vê a
 * mensagem vindo do número real da vendedora). Senão cai no número OFICIAL da marca (Cloud API);
 * sem a marca configurada (Rede.wa*) → modo SIMULADO (registra mas não envia).
 *
 * Atenção à janela de 24h (só se aplica ao caminho Cloud API): a Meta só aceita texto livre até
 * 24h após a última mensagem RECEBIDA do cliente. Fora da janela, o envio falha na Meta — use
 * template. O chamador (chat) valida a janela antes; campanhas migram para template.
 */
export async function enviarWhatsapp(opts: { rede: RedeWA; telefone: string; texto: string; vendedoraId?: string | null }): Promise<EnvioResultado> {
  if (opts.vendedoraId && baileysConectado(opts.vendedoraId)) {
    return enviarTextoBaileys(opts.vendedoraId, opts.telefone, opts.texto)
  }
  return enviarTexto({ rede: opts.rede, telefone: opts.telefone, texto: opts.texto })
}

/**
 * Mensagem de voz (PTT). Mesma prioridade do texto: WhatsApp pessoal (Baileys) primeiro se
 * conectado, senão Cloud API da marca — sobe o áudio (OGG/Opus) como mídia e envia (tipo audio).
 * Cloud API só dentro da janela de 24h (áudio é mensagem de sessão). Sem config nenhuma → SIMULADA.
 */
export async function enviarWhatsappAudio(opts: { rede: RedeWA; telefone: string; buffer: Buffer; vendedoraId?: string | null }): Promise<EnvioResultado> {
  if (opts.vendedoraId && baileysConectado(opts.vendedoraId)) {
    return enviarAudioBaileys(opts.vendedoraId, opts.telefone, opts.buffer)
  }
  const mediaId = await uploadMidia({ rede: opts.rede, buffer: opts.buffer, mime: 'audio/ogg', filename: 'audio.ogg' })
  if (!mediaId) return { status: 'SIMULADA' } // sem WABA (ou upload indisponível) → registra simulado
  return enviarMidia({ rede: opts.rede, telefone: opts.telefone, tipo: 'audio', mediaId })
}

/** Cliente já resolvido (dono da conversa) — mesmo shape usado pelo roteamento do webhook da Meta. */
export interface ClienteParaRoteamento {
  id: string
  lojaId: string
  vendedoraId: string
  chatAtendimentoStatus: string | null
  loja: { redeId: string | null }
}

/**
 * Registra uma mensagem RECEBIDA para um cliente/vendedora JÁ RESOLVIDOS (atualiza a janela de
 * 24h, garante um ciclo/lead aberto e dispara a resposta automática quando aplicável). Compartilhado
 * pelos dois canais de entrada: o webhook oficial da Meta (que antes resolve o cliente por
 * telefone/ref de catálogo/Vendedora ZAIEZE) e o WhatsApp pessoal via Baileys (onde o dono já é
 * conhecido de cara — é a própria vendedora da sessão, sem ambiguidade de roteamento).
 */
export async function registrarMensagemRecebida(params: {
  cliente: ClienteParaRoteamento
  numero: string
  texto: string
  nome?: string | null
}): Promise<{ roteado: true; mensagemId: string; lojaId: string; novoLead: boolean }> {
  const { cliente } = params

  // Janela de 24h: marca o instante da última entrada do cliente.
  await prisma.cliente.update({ where: { id: cliente.id }, data: { waUltimaEntradaEm: new Date() } })

  const atendidoPelaIa = await usuarioEhAgenteIa(cliente.vendedoraId)
  // Chat de Atendimento: vendedora HUMANA (não a IA), cliente ainda não passou pelo bot (1º
  // contato) e ela tem o add-on ativo — pré-qualifica antes de cair como lead cru na carteira.
  const chatAtendimentoVaiRodar = !atendidoPelaIa && cliente.chatAtendimentoStatus === null && (await chatAtendimentoAtivo(cliente.vendedoraId))

  const ciclo = await garantirCicloAberto({
    lojaId: cliente.lojaId, vendedoraId: cliente.vendedoraId, redeId: cliente.loja.redeId,
    clienteId: cliente.id, telefone: params.numero, nome: params.nome,
    origem: atendidoPelaIa ? 'VENDEDORA_IA' : chatAtendimentoVaiRodar ? 'CHAT_ATENDIMENTO' : undefined,
  })
  const msg = await prisma.mensagemWhatsapp.create({
    data: {
      lojaId: cliente.lojaId, clienteId: cliente.id, vendedoraId: cliente.vendedoraId,
      direcao: 'RECEBIDA', status: 'RECEBIDA', origem: 'ENTRADA', telefone: params.numero, texto: params.texto,
    },
  })

  // Dispara a resposta automática sem atrasar o retorno do webhook/evento; falha vira log.
  if (atendidoPelaIa) {
    const clienteId = cliente.id
    responderVendedoraZaieze({ clienteId, canal: 'WHATSAPP' }).catch((e) => console.error('[vendedora-zaieze]', e))
  } else if (chatAtendimentoVaiRodar) {
    responderChatAtendimento({ clienteId: cliente.id, texto: params.texto, canal: 'WHATSAPP' }).catch((e) => console.error('[chat-atendimento]', e))
  }

  return { roteado: true, mensagemId: msg.id, lojaId: cliente.lojaId, novoLead: ciclo.novo }
}

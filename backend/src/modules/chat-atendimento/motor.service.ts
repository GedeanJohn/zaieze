import { prisma } from '../../lib/prisma'
import { enviarTexto } from '../whatsapp/meta.service'
import { enviarTextoIg } from '../instagram/instagram.service'
import { garantirCicloAberto } from '../leads/leads.service'
import { roteiroEfetivoDaRede, MENSAGEM_CONCLUSAO_PADRAO, MENSAGEM_HANDOFF_PADRAO, type Roteiro } from './perfil-negocio.service'

/**
 * Motor de regras do Chat de Atendimento — 100% roteirizado, SEM chamar IA durante a
 * conversa (ver roteiro_schema.md). Consome o `Roteiro` cacheado (gerado 1x/semana por
 * `perfil-negocio.service.ts`) e decide a próxima mensagem por palavra-chave/estado.
 *
 * Intercepta o 1º contato (Cliente.chatAtendimentoStatus == null) e continua enquanto
 * EM_ANDAMENTO; para de atuar assim que conclui/desiste (CONCLUIDO) — nunca mais roda pra esse
 * cliente. Se ficar EM_ANDAMENTO por mais de 12h sem resposta (EXPIRACAO_MS), a próxima
 * mensagem é tratada como um novo 1º contato em vez de retomar de onde parou.
 */

const MAX_TURNOS = 5
// Conversa EM_ANDAMENTO parada por mais de 12h sem resposta do cliente: a próxima mensagem
// é tratada como um novo 1º contato em vez de continuar de onde a qualificação parou.
const EXPIRACAO_MS = 12 * 60 * 60 * 1000

interface Respostas {
  peca?: string
  tamanho?: string
  faixaPreco?: string
  _turnos?: number
}

const TAMANHOS = ['pp', 'p', 'm', 'g', 'gg', 'xg', 'xgg', '34', '36', '38', '40', '42', '44', '46', '48', 'único', 'unico']

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function extrairCampos(textoNorm: string, roteiro: Roteiro, atual: Respostas): Respostas {
  const novo = { ...atual }
  if (!novo.peca) {
    const achou = roteiro.palavrasChaveSegmento.find((p) => textoNorm.includes(normalizar(p)))
    if (achou) novo.peca = achou
  }
  if (!novo.tamanho) {
    const palavras = textoNorm.split(/[^a-z0-9]+/)
    const achou = palavras.find((p) => TAMANHOS.includes(p))
    if (achou) novo.tamanho = achou.toUpperCase()
  }
  if (!novo.faixaPreco) {
    const m = textoNorm.match(/r?\$?\s?(\d{2,4})/)
    if (m) novo.faixaPreco = `R$ ${m[1]}`
  }
  return novo
}

function bateGatilhoHandoff(textoNorm: string, roteiro: Roteiro): boolean {
  return roteiro.gatilhosHandoffDireto.some((g) => textoNorm.includes(normalizar(g)))
}

function proximaPergunta(roteiro: Roteiro, respostas: Respostas): string | null {
  for (const q of roteiro.perguntasQualificacao) {
    if (q.opcional) continue
    if (!respostas[q.campo]) return q.pergunta
  }
  return null
}

function resumoRespostas(respostas: Respostas): string {
  const partes: string[] = []
  if (respostas.peca) partes.push(`peça: ${respostas.peca}`)
  if (respostas.tamanho) partes.push(`tamanho: ${respostas.tamanho}`)
  if (respostas.faixaPreco) partes.push(`faixa de preço: ${respostas.faixaPreco}`)
  return partes.length ? partes.join(', ') : 'sem detalhes coletados'
}

interface ResultadoMotor { texto: string; concluido: boolean }

/** Roda o motor para UMA mensagem recebida. Não envia nem persiste — só decide. */
function processar(texto: string, nomeLoja: string, nomeVendedora: string, roteiro: Roteiro, statusAtual: string | null, respostasAtuais: Respostas): { resultado: ResultadoMotor; novoStatus: string; novasRespostas: Respostas } {
  const primeiroContato = statusAtual === null
  const textoNorm = normalizar(texto)
  let respostas: Respostas = { ...respostasAtuais, _turnos: (respostasAtuais._turnos ?? 0) + 1 }

  if (bateGatilhoHandoff(textoNorm, roteiro)) {
    return {
      resultado: { texto: mensagemHandoff(roteiro, nomeVendedora), concluido: true },
      novoStatus: 'CONCLUIDO',
      novasRespostas: respostas,
    }
  }

  respostas = extrairCampos(textoNorm, roteiro, respostas)

  // 1º contato e ainda nada extraído: só saudação (não pergunta ainda, evita soar interrogatório).
  if (primeiroContato && !respostas.peca && !respostas.tamanho && !respostas.faixaPreco) {
    const saudacao = (roteiro.saudacao?.mensagem || roteiro.saudacaoFallback).replace('{nome_loja}', nomeLoja)
    return { resultado: { texto: saudacao, concluido: false }, novoStatus: 'EM_ANDAMENTO', novasRespostas: respostas }
  }

  const faltaObrigatorio = proximaPergunta(roteiro, respostas)
  const excedeuTurnos = (respostas._turnos ?? 0) >= MAX_TURNOS

  if (!faltaObrigatorio || excedeuTurnos) {
    return {
      resultado: { texto: mensagemEntrega(roteiro, nomeVendedora), concluido: true },
      novoStatus: 'CONCLUIDO',
      novasRespostas: respostas,
    }
  }

  return { resultado: { texto: faltaObrigatorio, concluido: false }, novoStatus: 'EM_ANDAMENTO', novasRespostas: respostas }
}

// Mensagens de conclusão/handoff vêm do roteiro (editável pelo gestor, ver
// perfil-negocio.service.ts / roteiroParaEdicao) — nunca mais fixas no código.
function mensagemHandoff(roteiro: Roteiro, nomeVendedora: string): string {
  return (roteiro.mensagemHandoffHumano || MENSAGEM_HANDOFF_PADRAO).replace('{nome_vendedora}', nomeVendedora)
}

function mensagemEntrega(roteiro: Roteiro, nomeVendedora: string): string {
  return (roteiro.mensagemConclusao || MENSAGEM_CONCLUSAO_PADRAO).replace('{nome_vendedora}', nomeVendedora)
}

/**
 * Ponto de entrada chamado pelos webhooks (WhatsApp/Instagram) no lugar de só logar a
 * mensagem, quando o cliente é novo e a vendedora dona tem o add-on ativo. Nunca lança —
 * falha vira log e a mensagem segue o fluxo normal (cai como lead cru, sem o bot).
 */
export async function responderChatAtendimento(params: { clienteId: string; texto: string; canal: 'WHATSAPP' | 'INSTAGRAM' }): Promise<void> {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: params.clienteId },
      select: {
        id: true, telefone: true, igScopedId: true, vendedoraId: true,
        chatAtendimentoStatus: true, chatAtendimentoRespostas: true, chatAtendimentoAtualizadoEm: true,
        loja: { select: { id: true, redeId: true, nome: true, rede: true } },
        vendedora: { select: { nome: true } },
      },
    })
    if (!cliente || !cliente.vendedoraId || !cliente.loja.redeId) return

    const nomeLoja = cliente.loja.rede.nome || cliente.loja.nome
    const nomeVendedora = cliente.vendedora?.nome ?? 'a vendedora'
    const roteiro = await roteiroEfetivoDaRede(cliente.loja.redeId)

    const expirou = cliente.chatAtendimentoStatus === 'EM_ANDAMENTO'
      && cliente.chatAtendimentoAtualizadoEm != null
      && Date.now() - cliente.chatAtendimentoAtualizadoEm.getTime() > EXPIRACAO_MS
    const statusEfetivo = expirou ? null : cliente.chatAtendimentoStatus
    const respostasAtuais = expirou ? {} : ((cliente.chatAtendimentoRespostas as Respostas | null) ?? {})

    const { resultado, novoStatus, novasRespostas } = processar(
      params.texto, nomeLoja, nomeVendedora, roteiro, statusEfetivo, respostasAtuais,
    )

    await prisma.cliente.update({
      where: { id: cliente.id },
      data: {
        chatAtendimentoStatus: novoStatus,
        chatAtendimentoRespostas: novasRespostas as never,
        chatAtendimentoAtualizadoEm: new Date(),
        ...(novoStatus === 'CONCLUIDO' ? { observacoes: `Chat de Atendimento: ${resumoRespostas(novasRespostas)}` } : {}),
      },
    })

    if (params.canal === 'WHATSAPP' && cliente.telefone) {
      const r = await enviarTexto({ rede: cliente.loja.rede, telefone: cliente.telefone, texto: resultado.texto })
      await prisma.mensagemWhatsapp.create({
        data: {
          lojaId: cliente.loja.id, clienteId: cliente.id, vendedoraId: cliente.vendedoraId,
          direcao: 'ENVIADA', status: r.status, origem: 'CHAT_ATENDIMENTO', telefone: cliente.telefone, texto: resultado.texto,
          waMessageId: r.waMessageId ?? null,
        },
      })
    } else if (params.canal === 'INSTAGRAM' && cliente.igScopedId) {
      const r = await enviarTextoIg({ rede: cliente.loja.rede, igScopedId: cliente.igScopedId, texto: resultado.texto })
      await prisma.mensagemInstagram.create({
        data: {
          lojaId: cliente.loja.id, clienteId: cliente.id, vendedoraId: cliente.vendedoraId,
          direcao: 'ENVIADA', status: r.status, origem: 'CHAT_ATENDIMENTO', igScopedId: cliente.igScopedId, texto: resultado.texto,
          igMessageId: r.igMessageId ?? null,
        },
      })
    }

    // Ao concluir, garante que o lead está aberto no funil dela (idempotente — já pode existir).
    if (resultado.concluido) {
      await garantirCicloAberto({
        lojaId: cliente.loja.id, vendedoraId: cliente.vendedoraId, redeId: cliente.loja.redeId,
        clienteId: cliente.id, origem: 'CHAT_ATENDIMENTO',
      })
    }
  } catch (e) {
    console.error('[chat-atendimento]', e)
  }
}

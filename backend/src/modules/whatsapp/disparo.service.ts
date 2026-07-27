import type { OrigemMensagem } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { aplicarTemplate, enviarWhatsapp } from './whatsapp.service'
import { enviarTemplate } from './meta.service'
import { garantirSlugCatalogo, urlCatalogoPublica } from '../catalogo/catalogo.routes'
import { planoInclui } from '../../plugins/planos'

const num = (v: unknown) => Number(v ?? 0)

export interface ClienteAlvo {
  id: string
  nome: string
  telefone: string | null
  consentimentoLgpd: boolean
  segmento: string
  totalGasto: unknown
  ultimaCompraEm: Date | null
  vendedoraId: string | null
}

export interface ResultadoDisparo {
  alcance: number
  enviados: number
  simulados: number
  falhas: number
  semConsentimento: number
  semVendedora: number
  semTelefone: number
}

/**
 * Envia um template para uma lista de clientes, roteando pela vendedora dona da
 * carteira (ou pelo fallback informado). Respeita o consentimento LGPD e registra
 * cada mensagem (status ENVIADA/SIMULADA/FALHA).
 */
export async function dispararParaClientes(opts: {
  lojaId: string
  template: string
  origem: OrigemMensagem
  campanhaId?: string
  grupoId?: string
  templateId?: string // template HSM (Cloud API): envia por template aprovado (fora da janela de 24h)
  clientes: ClienteAlvo[]
  vendedoraFallbackId?: string
}): Promise<ResultadoDisparo> {
  const loja = await prisma.loja.findUniqueOrThrow({
    where: { id: opts.lojaId },
    select: { nome: true, redeId: true, rede: { select: { slug: true, plano: true, waPhoneNumberId: true, waTokenCifrado: true } } },
  })
  // Número oficial da marca (Cloud API). Sem config → envio SIMULADO.
  const redeWA = { waPhoneNumberId: loja.rede.waPhoneNumberId, waTokenCifrado: loja.rede.waTokenCifrado }

  // Template HSM (quando informado): usa o corpo do template e envia por template (params posicionais).
  const tpl = opts.templateId
    ? await prisma.templateWhatsapp.findUnique({ where: { id: opts.templateId }, select: { metaNome: true, idioma: true, corpo: true, variaveis: true } })
    : null
  const variaveis = Array.isArray(tpl?.variaveis) ? (tpl!.variaveis as string[]) : []
  const corpoBase = tpl?.corpo ?? opts.template

  const res: ResultadoDisparo = { alcance: opts.clientes.length, enviados: 0, simulados: 0, falhas: 0, semConsentimento: 0, semVendedora: 0, semTelefone: 0 }

  const ids = [...new Set(opts.clientes.map((c) => c.vendedoraId ?? opts.vendedoraFallbackId).filter((v): v is string => !!v))]
  const vendedoras = new Map(
    (await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, slugCatalogo: true } })).map((v) => [v.id, v]),
  )

  // Link do catálogo de cada vendedora (Portal do Cliente). Só existe se o plano da marca inclui o portal.
  const portalAtivo = planoInclui(loja.rede.plano, 'portal_cliente')
  const links = new Map<string, string>()
  if (portalAtivo) {
    for (const v of vendedoras.values()) {
      const slug = await garantirSlugCatalogo(v, loja.redeId)
      links.set(v.id, urlCatalogoPublica(loja.rede.slug, slug))
    }
  }

  for (const c of opts.clientes) {
    if (!c.consentimentoLgpd) {
      res.semConsentimento += 1
      continue
    }
    const vId = c.vendedoraId ?? opts.vendedoraFallbackId ?? null
    const vend = vId ? vendedoras.get(vId) : undefined
    if (!vend) {
      res.semVendedora += 1
      continue
    }
    if (!c.telefone) {
      res.semTelefone += 1
      continue
    }

    const dias = c.ultimaCompraEm ? Math.floor((Date.now() - c.ultimaCompraEm.getTime()) / 86_400_000) : null
    const link = links.get(vend.id) ?? ''
    const dados = { nome: c.nome, loja: loja.nome, vendedora: vend.nome, totalGasto: num(c.totalGasto), diasSemCompra: dias, segmento: c.segmento, link }
    let texto = aplicarTemplate(corpoBase, dados)
    // Sem template: garante o link na mensagem mesmo quando o corpo não usa {link} (texto livre).
    if (!tpl && link && !corpoBase.includes('{link}')) texto = `${texto}\n\n👉 Veja o catálogo: ${link}`

    // Com template HSM → envia por template (params posicionais na ordem das variáveis); entrega
    // fora da janela de 24h. Sem template → texto livre (só entrega dentro da janela; senão SIMULADA/FALHA).
    const r = tpl
      ? await enviarTemplate({ rede: redeWA, telefone: c.telefone, templateNome: tpl.metaNome, idioma: tpl.idioma, params: variaveis.map((v) => ({ texto: aplicarTemplate(`{${v}}`, dados) })) })
      : await enviarWhatsapp({ rede: redeWA, telefone: c.telefone, texto, vendedoraId: vend.id })
    const status = r.status

    await prisma.mensagemWhatsapp.create({
      data: {
        lojaId: opts.lojaId,
        clienteId: c.id,
        vendedoraId: vend.id,
        campanhaId: opts.campanhaId,
        grupoId: opts.grupoId,
        direcao: 'ENVIADA',
        status,
        origem: opts.origem,
        telefone: c.telefone,
        texto,
        waMessageId: r.waMessageId ?? null,
        templateNome: tpl?.metaNome ?? null,
      },
    })

    if (status === 'ENVIADA') res.enviados += 1
    else if (status === 'SIMULADA') res.simulados += 1
    else res.falhas += 1
  }

  return res
}

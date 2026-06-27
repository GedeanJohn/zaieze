import type { OrigemMensagem } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { aplicarTemplate, enviarWhatsapp } from './whatsapp.service'
import { garantirSlugCatalogo, urlCatalogoPublica } from '../catalogo/catalogo.routes'
import { planoInclui } from '../../plugins/planos'

const num = (v: unknown) => Number(v ?? 0)

export interface ClienteAlvo {
  id: string
  nome: string
  telefone: string
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
  clientes: ClienteAlvo[]
  vendedoraFallbackId?: string
}): Promise<ResultadoDisparo> {
  const loja = await prisma.loja.findUniqueOrThrow({
    where: { id: opts.lojaId },
    select: { nome: true, redeId: true, rede: { select: { slug: true, plano: true } } },
  })
  const res: ResultadoDisparo = { alcance: opts.clientes.length, enviados: 0, simulados: 0, falhas: 0, semConsentimento: 0, semVendedora: 0 }

  const ids = [...new Set(opts.clientes.map((c) => c.vendedoraId ?? opts.vendedoraFallbackId).filter((v): v is string => !!v))]
  const vendedoras = new Map(
    (await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, waInstancia: true, slugCatalogo: true } })).map((v) => [v.id, v]),
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

    const dias = c.ultimaCompraEm ? Math.floor((Date.now() - c.ultimaCompraEm.getTime()) / 86_400_000) : null
    const link = links.get(vend.id) ?? ''
    let texto = aplicarTemplate(opts.template, {
      nome: c.nome,
      loja: loja.nome,
      vendedora: vend.nome,
      totalGasto: num(c.totalGasto),
      diasSemCompra: dias,
      segmento: c.segmento,
      link,
    })
    // Garante que o link da vendedora vá na mensagem mesmo quando o template não usa {link}.
    if (link && !opts.template.includes('{link}')) texto = `${texto}\n\n👉 Veja o catálogo: ${link}`
    const status = await enviarWhatsapp({ instancia: vend.waInstancia, telefone: c.telefone, texto })

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
      },
    })

    if (status === 'ENVIADA') res.enviados += 1
    else if (status === 'SIMULADA') res.simulados += 1
    else res.falhas += 1
  }

  return res
}

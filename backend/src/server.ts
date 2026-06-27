import { buildApp } from './app'
import { env } from './env'
import { segmentarTodasAsLojas } from './modules/clientes/segmentacao'
import { redistribuirAtrasados } from './modules/leads/leads.service'
import { limparMidiaExpirada, limparAudiosAntigos } from './modules/midia/limpeza.service'

const UM_DIA_MS = 24 * 60 * 60 * 1000

async function main() {
  const app = await buildApp()
  try {
    await app.listen({ port: env.PORT, host: env.HOST })

    // SLA dos leads: a cada minuto, redistribui os atrasados das redes com auto-redistribuição ligada.
    setInterval(() => {
      redistribuirAtrasados()
        .then((n) => { if (n > 0) app.log.info(`Leads redistribuídos por SLA: ${n}`) })
        .catch((err) => app.log.error({ err }, 'Falha na redistribuição automática de leads'))
    }, 60_000).unref()

    // Limpeza de mídia por plano (R2): roda no boot e a cada 24h. Apaga a mídia das
    // coleções cuja retenção (START 6m / PRO 12m) venceu desde a liberação. ELITE nunca.
    const limpar = () => limparMidiaExpirada()
      .then((n) => { if (n > 0) app.log.info(`Coleções com mídia expirada limpas no R2: ${n}`) })
      .catch((err) => app.log.error({ err }, 'Falha na limpeza de mídia expirada'))
    limpar()
    setInterval(limpar, UM_DIA_MS).unref()

    // Expurgo das mensagens de voz com mais de 7 dias (apaga o áudio; mantém o histórico). Boot + 24h.
    const limparAudios = () => limparAudiosAntigos()
      .then((n) => { if (n > 0) app.log.info(`Mensagens de voz expiradas (7 dias) expurgadas: ${n}`) })
      .catch((err) => app.log.error({ err }, 'Falha no expurgo de áudios antigos'))
    limparAudios()
    setInterval(limparAudios, UM_DIA_MS).unref()

    // Segmentação automática: em produção roda via agendamento diário (cron).
    // No boot só roda se SEGMENTAR_BOOT=true — assim, em dev/demo, o recálculo
    // fica a cargo do botão "Recalcular segmentação" (efeito visível na carteira).
    if (process.env.SEGMENTAR_BOOT === 'true') {
      segmentarTodasAsLojas()
        .then(() => app.log.info('Segmentação de clientes recalculada no boot'))
        .catch((err) => app.log.error({ err }, 'Falha ao segmentar clientes no boot'))
    }
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main()

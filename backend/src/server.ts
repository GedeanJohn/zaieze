import { buildApp } from './app'
import { env } from './env'
import { segmentarTodasAsLojas } from './modules/clientes/segmentacao'
import { redistribuirAtrasados } from './modules/leads/leads.service'

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

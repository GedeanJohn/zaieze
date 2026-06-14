import { buildApp } from './app'
import { env } from './env'
import { segmentarTodasAsLojas } from './modules/clientes/segmentacao'

async function main() {
  const app = await buildApp()
  try {
    await app.listen({ port: env.PORT, host: env.HOST })
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

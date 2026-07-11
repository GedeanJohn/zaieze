import { buildApp } from './app'
import { env } from './env'
import { segmentarTodasAsLojas } from './modules/clientes/segmentacao'
import { redistribuirAtrasados } from './modules/leads/leads.service'
import { limparMidiaExpirada, limparAudiosAntigos, limparLooksAntigos } from './modules/midia/limpeza.service'
import { iniciarWorkerProvador } from './modules/provador/provador.worker'
import { encerrarAssinaturasVencidas } from './modules/assinaturas/assinatura.service'
import { encerrarAssessorasVencidas } from './modules/assessores/assinatura-assessor.service'
import { aplicarReajustesIgpm } from './modules/assinaturas/igpm.service'
import { aplicarDistratoTermos } from './modules/contrato/contrato.service'
import { atualizarCotacaoUsd } from './modules/cambio/cambio.service'

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

    // Provador virtual: worker (poller) que avança os looks pela FASHN (foto → vídeo).
    iniciarWorkerProvador(app.log)

    // Expurgo das mídias do provador (foto/vídeo) além da retenção (env.PROVADOR_RETENCAO_DIAS). Boot + 24h.
    const limparLooks = () => limparLooksAntigos()
      .then((n) => { if (n > 0) app.log.info(`Looks do provador expurgados (retenção): ${n}`) })
      .catch((err) => app.log.error({ err }, 'Falha no expurgo de looks do provador'))
    limparLooks()
    setInterval(limparLooks, UM_DIA_MS).unref()

    // Termos/distrato + encerramento de assinaturas: roda no boot e a cada 24h.
    // 1) distrata quem não aceitou os termos no prazo (cancela recorrência + fim de ciclo);
    // 2) encerra as assinaturas cujo ciclo pago já venceu.
    const aplicarTermos = () => aplicarDistratoTermos()
      .then((d) => { if (d > 0) app.log.info(`Distrato por não-aceite dos termos: ${d} rede(s)`) })
      .then(() => encerrarAssinaturasVencidas())
      .then((e) => { if (e > 0) app.log.info(`Assinaturas encerradas (ciclo vencido): ${e}`) })
      .then(() => encerrarAssessorasVencidas())
      .then((e) => { if (e > 0) app.log.info(`Assinaturas de assessor(a) encerradas (ciclo vencido): ${e}`) })
      .catch((err) => app.log.error({ err }, 'Falha no job de termos/assinaturas'))
    aplicarTermos()
    setInterval(aplicarTermos, UM_DIA_MS).unref()

    // Reajuste anual por IGP-M nos contratos existentes: no aniversário de cada contrato aplica
    // a taxa do mês anterior (12º mês do contrato), se já lançada na tabela. Boot + 24h.
    const reajustarIgpm = () => aplicarReajustesIgpm()
      .then((n) => { if (n > 0) app.log.info(`Reajustes IGP-M aplicados (aniversário): ${n}`) })
      .catch((err) => app.log.error({ err }, 'Falha no reajuste IGP-M por aniversário'))
    reajustarIgpm()
    setInterval(reajustarIgpm, UM_DIA_MS).unref()

    // Cotação BRL→USD para exibição informativa no site (Mercado Pago segue 100% em BRL).
    // Fonte: Frankfurter (gratuita, sem chave). Falha não derruba o boot — mantém o cache. Boot + 24h.
    const atualizarCambio = () => atualizarCotacaoUsd()
      .then(() => app.log.info('Cotação BRL→USD atualizada (Frankfurter)'))
      .catch((err) => app.log.error({ err }, 'Falha ao atualizar cotação BRL→USD — mantendo último valor em cache'))
    atualizarCambio()
    setInterval(atualizarCambio, UM_DIA_MS).unref()

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

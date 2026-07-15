const FUSO = 'America/Sao_Paulo'
const DIA_SEMANA_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export interface Periodo {
  diaSemana: number
  inicio: string
  fim: string
}

/** Dia da semana (0=domingo..6=sábado) e horário atual "HH:mm" no fuso do Brasil,
 *  independente do fuso do servidor (produção roda em UTC). */
export function agoraNoBrasil(base = new Date()): { diaSemana: number; hhmm: string } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(base)
  const weekday = partes.find((p) => p.type === 'weekday')!.value
  const hour = partes.find((p) => p.type === 'hour')!.value
  const minute = partes.find((p) => p.type === 'minute')!.value
  return { diaSemana: DIA_SEMANA_MAP[weekday], hhmm: `${hour}:${minute}` }
}

/** Calcula se está "Disponível" agora: dia da semana atual tem algum período cadastrado que
 *  cubra o horário atual. Um dia pode ter vários períodos (ex.: manhã e tarde); sem nenhum
 *  período cadastrado pro dia = Offline o dia todo. */
export function calcularDisponivelPorAgenda(periodos: Periodo[], base = new Date()): boolean {
  const { diaSemana, hhmm } = agoraNoBrasil(base)
  return periodos.some((p) => p.diaSemana === diaSemana && hhmm >= p.inicio && hhmm <= p.fim)
}

export interface DiaComPeriodos {
  diaSemana: number
  periodos: { inicio: string; fim: string }[]
}

/** Agrupa os períodos (linhas soltas) nas 7 linhas fixas (domingo a sábado) que o painel edita —
 *  dia sem período cadastrado vem com array vazio (fechado). */
export function agruparPorDia(periodos: Periodo[]): DiaComPeriodos[] {
  return Array.from({ length: 7 }, (_, diaSemana) => ({
    diaSemana,
    periodos: periodos
      .filter((p) => p.diaSemana === diaSemana)
      .map((p) => ({ inicio: p.inicio, fim: p.fim })),
  }))
}

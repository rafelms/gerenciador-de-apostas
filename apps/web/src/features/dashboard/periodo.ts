// Período do dashboard (seção 11.7): mês atual por padrão; um mês escolhido, 3 meses, ano,
// tudo ou personalizado. Fica na URL (?periodo=escolher&mes=2026-10) como os filtros da lista.

export const PERIODOS = ['mes', 'escolher', '3m', 'ano', 'tudo', 'personalizado'] as const
export type Periodo = (typeof PERIODOS)[number]

export const rotulosPeriodo: Record<Periodo, string> = {
  mes: 'Este mês',
  escolher: 'Escolher mês',
  '3m': 'Últimos 3 meses',
  ano: 'Este ano',
  tudo: 'Tudo',
  personalizado: 'Personalizado',
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]
const DATA = /^\d{4}-\d{2}-\d{2}$/
const MES = /^\d{4}-(0[1-9]|1[0-2])$/

export interface FiltrosDashboard {
  periodo: Periodo
  /** yyyy-mm-dd, só no personalizado. */
  de?: string
  ate?: string
  /** yyyy-mm, só no "escolher mês". */
  mes?: string
  modalidade?: string
}

export interface Intervalo {
  /** yyyy-mm-dd inclusivo; null = sem limite. */
  inicio: string | null
  fim: string | null
  /** "novembro de 2026", "set. a nov. de 2026"… */
  rotulo: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate()
const formatarBr = (iso: string) => iso.split('-').reverse().join('/')

/** Primeiro dia do mês `deslocamento` meses antes de (ano, mes 1–12). */
function inicioDoMes(ano: number, mes: number, deslocamento = 0) {
  const d = new Date(Date.UTC(ano, mes - 1 - deslocamento, 1))
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }
}

export function filtrosDashboardDaUrl(p: URLSearchParams): FiltrosDashboard {
  const periodo = (PERIODOS as readonly string[]).includes(p.get('periodo') ?? '')
    ? (p.get('periodo') as Periodo)
    : 'mes'
  const de = DATA.test(p.get('de') ?? '') ? p.get('de')! : undefined
  const ate = DATA.test(p.get('ate') ?? '') ? p.get('ate')! : undefined
  const mes = MES.test(p.get('mes') ?? '') ? p.get('mes')! : undefined
  return {
    periodo,
    ...(periodo === 'personalizado' && { de, ate }),
    ...(periodo === 'escolher' && { mes }),
    modalidade: p.get('modalidade') || undefined,
  }
}

export function filtrosDashboardParaUrl(f: FiltrosDashboard): URLSearchParams {
  const p = new URLSearchParams()
  if (f.periodo !== 'mes') p.set('periodo', f.periodo)
  if (f.periodo === 'personalizado') {
    if (f.de) p.set('de', f.de)
    if (f.ate) p.set('ate', f.ate)
  }
  if (f.periodo === 'escolher' && f.mes) p.set('mes', f.mes)
  if (f.modalidade) p.set('modalidade', f.modalidade)
  return p
}

/** Datas do período em relação a `hoje` (yyyy-mm-dd, no fuso de São Paulo). */
export function intervaloDoPeriodo(f: FiltrosDashboard, hoje: string): Intervalo {
  const [ano, mes] = hoje.split('-').map(Number) as [number, number]
  const fimDoMes = `${ano}-${pad(mes)}-${pad(ultimoDia(ano, mes))}`
  switch (f.periodo) {
    case 'escolher': {
      // Sem mês válido na URL, vale o mês atual.
      const [a, m] = (f.mes && MES.test(f.mes) ? f.mes : hoje.slice(0, 7))
        .split('-')
        .map(Number) as [number, number]
      return {
        inicio: `${a}-${pad(m)}-01`,
        fim: `${a}-${pad(m)}-${pad(ultimoDia(a, m))}`,
        rotulo: `${MESES[m - 1]} de ${a}`,
      }
    }
    case 'mes':
      return {
        inicio: `${ano}-${pad(mes)}-01`,
        fim: fimDoMes,
        rotulo: `${MESES[mes - 1]} de ${ano}`,
      }
    case '3m': {
      const i = inicioDoMes(ano, mes, 2)
      const de = MESES[i.mes - 1]!.slice(0, 3)
      return {
        inicio: `${i.ano}-${pad(i.mes)}-01`,
        fim: fimDoMes,
        rotulo:
          i.ano === ano
            ? `${de}. a ${MESES[mes - 1]!.slice(0, 3)}. de ${ano}`
            : `${de}. de ${i.ano} a ${MESES[mes - 1]!.slice(0, 3)}. de ${ano}`,
      }
    }
    case 'ano':
      return { inicio: `${ano}-01-01`, fim: `${ano}-12-31`, rotulo: String(ano) }
    case 'tudo':
      return { inicio: null, fim: null, rotulo: 'todo o período' }
    case 'personalizado': {
      // Datas trocadas viram o intervalo certo, sem erro.
      const [inicio, fim] =
        f.de && f.ate && f.de > f.ate ? [f.ate, f.de] : [f.de ?? null, f.ate ?? null]
      const rotulo =
        inicio && fim
          ? `${formatarBr(inicio)} a ${formatarBr(fim)}`
          : inicio
            ? `desde ${formatarBr(inicio)}`
            : fim
              ? `até ${formatarBr(fim)}`
              : 'todo o período'
      return { inicio, fim, rotulo }
    }
  }
}

/** O mês `delta` meses depois de `mes` (yyyy-mm). */
export function mesVizinho(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const d = inicioDoMes(a, m, -delta)
  return `${d.ano}-${pad(d.mes)}`
}

/** Os `qtd` meses até o de `hoje`, do mais recente para o mais antigo, para o seletor. */
export function mesesParaEscolher(hoje: string, qtd = 36): { valor: string; rotulo: string }[] {
  const atual = hoje.slice(0, 7)
  return Array.from({ length: qtd }, (_, i) => {
    const valor = mesVizinho(atual, -i)
    const [a, m] = valor.split('-').map(Number) as [number, number]
    return { valor, rotulo: `${MESES[m - 1]} de ${a}` }
  })
}

export interface PontoMensal {
  /** yyyy-mm-01 */
  mes: string
  gasto: number
  recuperado: number
}

export interface PontoSerie extends PontoMensal {
  /** "out./26" */
  rotulo: string
  /** Saldo somado desde o 1º mês da série. */
  saldoAcumulado: number
}

/**
 * Completa os meses sem apostas com zero (a linha não pula meses) e acumula o saldo.
 * Vai do início do período (ou do 1º mês com dados) até o fim do período, sem passar
 * do mês atual.
 */
export function serieMensal(
  pontos: PontoMensal[],
  intervalo: Pick<Intervalo, 'inicio' | 'fim'>,
  hoje: string,
): PontoSerie[] {
  const porMes = new Map(pontos.map((p) => [p.mes.slice(0, 7), p]))
  const meses = [...porMes.keys()].sort()
  const mesAtual = hoje.slice(0, 7)
  const primeiro = intervalo.inicio?.slice(0, 7) ?? meses[0]
  const fimPeriodo = intervalo.fim?.slice(0, 7) ?? mesAtual
  const ultimo = [fimPeriodo < mesAtual ? fimPeriodo : mesAtual, meses.at(-1) ?? ''].sort().at(-1)!
  if (!primeiro || primeiro > ultimo) return []

  const serie: PontoSerie[] = []
  let [a, m] = primeiro.split('-').map(Number) as [number, number]
  let acumulado = 0
  for (;;) {
    const chave = `${a}-${pad(m)}`
    if (chave > ultimo) break
    const p = porMes.get(chave)
    const gasto = p?.gasto ?? 0
    const recuperado = p?.recuperado ?? 0
    acumulado += recuperado - gasto
    serie.push({
      mes: `${chave}-01`,
      rotulo: `${MESES[m - 1]!.slice(0, 3)}./${String(a).slice(2)}`,
      gasto,
      recuperado,
      saldoAcumulado: acumulado,
    })
    if (++m > 12) {
      m = 1
      a++
    }
  }
  return serie
}

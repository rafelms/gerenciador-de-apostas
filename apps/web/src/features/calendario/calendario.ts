// Calendário (seção 11.8): grade do mês (desktop) e semanas (mobile). Datas em
// yyyy-mm-dd, sem fuso (são datas puras do banco); a semana começa no domingo.

import { supabase } from '@/lib/supabase'

export type TipoEvento = 'aposta' | 'sorteio' | 'premio' | 'prazo'

export interface Evento {
  data: string
  tipo: TipoEvento
  modalidadeSlug: string
  modalidadeNome: string
  modalidadeCor: string | null
  concurso: number
  apostaId: string | null
  premioId: string | null
  valorCentavos: number | null
  qtd: number
  sorteado: boolean | null
  estimada: boolean
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
export const DIAS_SEMANA = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.']
const DIAS_SEMANA_LONGOS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

const pad = (n: number) => String(n).padStart(2, '0')
const paraIso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const deIso = (iso: string) => new Date(`${iso}T00:00:00Z`)
const somarDias = (iso: string, dias: number) => {
  const d = deIso(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return paraIso(d)
}

/** "2026-11" válido da URL, ou o mês de hoje. */
export function mesDaUrl(valor: string | null, hoje: string): string {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : hoje.slice(0, 7)
}

export function deslocarMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(a, m - 1 + delta, 1))
  return paraIso(d).slice(0, 7)
}

export function rotuloMes(mes: string) {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return `${MESES[m - 1]} de ${a}`
}

/** "sexta-feira, 20 de novembro" */
export function rotuloDia(iso: string) {
  const d = deIso(iso)
  return `${DIAS_SEMANA_LONGOS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

/** Primeiro e último dia do mês. */
export function limitesDoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number) as [number, number]
  return { inicio: `${mes}-01`, fim: paraIso(new Date(Date.UTC(a, m, 0))) }
}

/** Semanas (domingo a sábado) que cobrem o mês; dias de fora do mês vêm marcados. */
export function semanasDoMes(mes: string): { data: string; doMes: boolean }[][] {
  const { inicio, fim } = limitesDoMes(mes)
  let dia = somarDias(inicio, -deIso(inicio).getUTCDay())
  const semanas: { data: string; doMes: boolean }[][] = []
  while (dia <= fim) {
    const semana = Array.from({ length: 7 }, (_, i) => {
      const data = somarDias(dia, i)
      return { data, doMes: data.slice(0, 7) === mes }
    })
    semanas.push(semana)
    dia = somarDias(dia, 7)
  }
  return semanas
}

/** "16 a 22 de nov." ou "29 e 30 de nov.", só com os dias do mês. */
export function rotuloSemana(semana: { data: string; doMes: boolean }[]) {
  const dias = semana.filter((d) => d.doMes)
  const ini = deIso(dias[0]!.data)
  const fim = deIso(dias.at(-1)!.data)
  const mes = (d: Date) => MESES[d.getUTCMonth()]!.slice(0, 3) + '.'
  return ini.getUTCDate() === fim.getUTCDate()
    ? `${ini.getUTCDate()} de ${mes(ini)}`
    : `${ini.getUTCDate()} ${fim.getUTCDate() - ini.getUTCDate() === 1 ? 'e' : 'a'} ${fim.getUTCDate()} de ${mes(fim)}`
}

export function agruparPorDia(eventos: Evento[]) {
  const mapa = new Map<string, Evento[]>()
  for (const e of eventos) mapa.set(e.data, [...(mapa.get(e.data) ?? []), e])
  return mapa
}

export async function carregarEventos(inicio: string, fim: string): Promise<Evento[]> {
  const { data, error } = await supabase.rpc('fn_calendario', { p_inicio: inicio, p_fim: fim })
  if (error) throw error
  return data.map((e) => ({
    data: e.data,
    tipo: e.tipo as TipoEvento,
    modalidadeSlug: e.modalidade_slug,
    modalidadeNome: e.modalidade_nome,
    modalidadeCor: e.modalidade_cor,
    concurso: e.concurso,
    apostaId: e.aposta_id,
    premioId: e.premio_id,
    valorCentavos: e.valor_centavos,
    qtd: e.qtd,
    sorteado: e.sorteado,
    estimada: e.estimada,
  }))
}

import { formatInTimeZone } from 'date-fns-tz'

// Formatação só na borda (UI). Fuso fixo America/Sao_Paulo (seção 12.1).
export const FUSO = 'America/Sao_Paulo'

export function formatarData(data: string | Date) {
  // Datas puras do banco ("2026-10-14") não têm fuso: formatamos sem conversão.
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [a, m, d] = data.split('-')
    return `${d}/${m}/${a}`
  }
  return formatInTimeZone(data, FUSO, 'dd/MM/yyyy')
}

export function formatarDataHora(data: string | Date) {
  return formatInTimeZone(data, FUSO, "dd/MM/yyyy 'às' HH:mm")
}

/** Data de hoje (yyyy-mm-dd) no fuso de São Paulo. */
export function hojeIso() {
  return formatInTimeZone(new Date(), FUSO, 'yyyy-MM-dd')
}

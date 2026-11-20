// Séries dos gráficos, fora do módulo do Recharts (a página usa sem carregá-lo).

export interface SerieInfo {
  chave: string
  nome: string
  cor: string
  /** strokeDasharray do traço (vazio = contínuo). */
  traco: string
}

export const SERIES_MENSAL: SerieInfo[] = [
  { chave: 'gasto', nome: 'Gasto', cor: 'var(--serie-1)', traco: '' },
  { chave: 'recuperado', nome: 'Recuperado', cor: 'var(--serie-2)', traco: '6 4' },
  { chave: 'saldoAcumulado', nome: 'Saldo acumulado', cor: 'var(--serie-3)', traco: '2 3' },
]
export const SERIES_BARRAS: SerieInfo[] = SERIES_MENSAL.slice(0, 2)

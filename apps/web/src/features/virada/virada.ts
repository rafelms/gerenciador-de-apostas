import { combinacao } from '@shared/combinatoria.ts'

// A aba "Mega da Virada" vale para um concurso só. Quando o prêmio sair, este arquivo
// (e a rota /virada) deixa de ser necessário: a aba some do menu uma semana depois.
export const VIRADA = {
  modalidadeSlug: 'megasena',
  concurso: 3100,
  /** Data do sorteio (yyyy-mm-dd). */
  data: '2026-12-31',
  /** Prêmio estimado divulgado pela CAIXA: R$ 1 bilhão. */
  premioCentavos: 100_000_000_000,
  /** Dias depois do sorteio em que a aba ainda aparece no menu. */
  diasNoMenuAposSorteio: 7,
} as const

const DIA_MS = 86_400_000

function utc(dia: string): number {
  const [a, m, d] = dia.split('-').map(Number)
  return Date.UTC(a!, m! - 1, d!)
}

/** Dias de `hoje` até `dia` (negativo se já passou). Ambos "yyyy-mm-dd". */
export function diasAte(hoje: string, dia: string): number {
  return Math.round((utc(dia) - utc(hoje)) / DIA_MS)
}

export function viradaNoMenu(hoje: string): boolean {
  return diasAte(hoje, VIRADA.data) >= -VIRADA.diasNoMenuAposSorteio
}

export function textoContagem(hoje: string): string {
  const dias = diasAte(hoje, VIRADA.data)
  if (dias > 1) return `Faltam ${dias} dias`
  if (dias === 1) return 'Falta 1 dia'
  if (dias === 0) return 'O sorteio é hoje'
  return 'Sorteio realizado'
}

/** Combinações de 6 dezenas na Mega-Sena (chance de sena com um jogo de 6). */
export const COMBINACOES_MEGA = combinacao(60, 6)

/**
 * Chance de sena somando os jogos (um jogo de n dezenas cobre C(n,6) combinações).
 * `umEm` é arredondado; null quando não há jogo com 6 dezenas ou mais.
 */
export function chanceDeSena(dezenasPorJogo: number[]): {
  combinacoes: number
  umEm: number | null
} {
  const combinacoes = dezenasPorJogo.reduce((s, n) => s + (n >= 6 ? combinacao(n, 6) : 0), 0)
  return { combinacoes, umEm: combinacoes > 0 ? Math.round(COMBINACOES_MEGA / combinacoes) : null }
}

export interface ItemVirada {
  id: string
  descricao: string
  valor_previsto_centavos: number | null
  feito: boolean
}

/** Pendentes primeiro; dentro de cada grupo, a ordem de criação (a da lista recebida). */
export function ordenarItens<T extends { feito: boolean }>(itens: T[]): T[] {
  return [...itens.filter((i) => !i.feito), ...itens.filter((i) => i.feito)]
}

export function resumoItens(itens: ItemVirada[]) {
  const feitos = itens.filter((i) => i.feito)
  const soma = (l: ItemVirada[]) => l.reduce((s, i) => s + (i.valor_previsto_centavos ?? 0), 0)
  return {
    total: itens.length,
    feitos: feitos.length,
    faltam: itens.length - feitos.length,
    valorFeito: soma(feitos),
    valorFalta: soma(itens.filter((i) => !i.feito)),
  }
}

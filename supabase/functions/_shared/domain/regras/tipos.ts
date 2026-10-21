// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
import type { Centavos } from '../dinheiro.ts'

export type SlugModalidade = 'megasena' | 'lotofacil' | 'quina' | 'lotomania'

export interface Faixa {
  acertos: number
  nome: string
}

/**
 * Resultado de um sorteio. `extras` deixa espaço para modalidades da fase 6
 * (2º sorteio da Dupla Sena, trevos da +Milionária, mês da sorte…).
 */
export interface Sorteio {
  dezenas: number[]
  extras?: Record<string, unknown>
}

export interface ResultadoConferencia {
  acertos: number
  dezenasAcertadas: number[]
  /** Por nº de acertos da faixa → quantas combinações premiadas. Ex.: { 6: 1, 5: 6, 4: 0 } */
  premiosPorFaixa: Record<number, number>
  extras?: Record<string, unknown>
}

/** Comportamento de uma modalidade (seção 9.3). Os dados editáveis ficam na tabela `modalidades`. */
export interface RegraModalidade {
  slug: SlugModalidade
  nome: string
  universoMin: number
  universoMax: number
  qtdSorteadas: number
  /** p: dezenas da aposta simples */
  baseAposta: number
  minMarcadas: number
  maxMarcadas: number
  faixas: Faixa[]
  /**
   * Quantidades de concursos aceitas na teimosinha. Ausente = qualquer valor de 2 a 24.
   * Ex.: Lotomania só aceita 2, 3, 4, 6, 8, 9 ou 12.
   */
  teimosinhaConcursos?: number[]
  /**
   * Aceita Aposta-Espelho: um 2º jogo com as dezenas NÃO marcadas no original
   * (Lotomania: as outras 50 das 100).
   */
  espelho?: boolean
  /** Devolve a lista de erros (vazia = jogo válido). */
  validarJogo(dezenas: number[]): string[]
  /** precoSimples × C(n, p) */
  custoJogo(qtdDezenas: number, precoSimples: Centavos): Centavos
  conferir(dezenasJogo: number[], sorteio: Sorteio): ResultadoConferencia
}

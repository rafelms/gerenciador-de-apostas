import { multiplicarFracao, type Centavos } from './dinheiro.ts'
import type { RegraModalidade } from './regras/tipos.ts'

/** Tarifa de serviço do bolão: até 35% do valor da cota (seção 5.1). */
export const TARIFA_MAX_BPS = 3500

/**
 * Custo de uma aposta simples/teimosinha (seção 5.3):
 *   Σ custoJogo × nº de concursos
 */
export function custoAposta(
  regra: RegraModalidade,
  jogos: number[][],
  precoSimples: Centavos,
  qtdConcursos = 1,
): Centavos {
  const porConcurso = jogos.reduce((soma, jogo) => soma + regra.custoJogo(jogo.length, precoSimples), 0)
  return porConcurso * qtdConcursos
}

/** Total pago no bolão: cotas do usuário × (valor da cota + tarifa por cota). */
export function totalBolao(cotasUsuario: number, valorCota: Centavos, tarifa: Centavos): Centavos {
  return cotasUsuario * (valorCota + tarifa)
}

/** Tarifa ≤ 35% da cota, com 1 centavo de tolerância de arredondamento (Apêndice A.3). */
export function tarifaDentroDoLimite(tarifa: Centavos, valorCota: Centavos): boolean {
  return tarifa <= multiplicarFracao(valorCota, TARIFA_MAX_BPS, 10_000) + 1
}

/**
 * O valor da cota bate com o preço vigente? (Apêndice A.3)
 *   |valor_cota × total_cotas − Σ custoJogo| ≤ total_cotas centavos
 * A tolerância cobre o arredondamento do valor total dividido em cotas.
 */
export function valorCotaConfere(
  regra: RegraModalidade,
  jogos: number[][],
  precoSimples: Centavos,
  valorCota: Centavos,
  totalCotas: number,
): boolean {
  const custoTotal = custoAposta(regra, jogos, precoSimples)
  return Math.abs(valorCota * totalCotas - custoTotal) <= totalCotas
}

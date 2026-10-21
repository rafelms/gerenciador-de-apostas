// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
// Combinatória com inteiros exatos (BigInt internamente).

/** C(n, k): quantas combinações de k elementos existem em n. Fora do domínio → 0. */
export function combinacao(n: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 0 || n < 0 || k > n) return 0
  const kk = Math.min(k, n - k)
  let resultado = 1n
  for (let i = 1; i <= kk; i++) {
    resultado = (resultado * BigInt(n - kk + i)) / BigInt(i)
  }
  if (resultado > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`C(${n}, ${k}) excede o inteiro seguro`)
  return Number(resultado)
}

/**
 * Quantas apostas simples premiadas com `j` acertos existem dentro de um jogo com
 * `n` dezenas marcadas que acertou `k` dezenas, numa modalidade de base `p` (seção 9.2):
 *
 *   combinacoesPremiadas(j) = C(k, j) × C(n − k, p − j)
 *
 * Ex.: Mega com 7 marcadas e 6 acertos → sena = 1, quina = 6.
 */
export function combinacoesPremiadas(n: number, k: number, p: number, j: number): number {
  return combinacao(k, j) * combinacao(n - k, p - j)
}

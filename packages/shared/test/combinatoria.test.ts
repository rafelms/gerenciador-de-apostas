import { describe, expect, it } from 'vitest'

import { combinacao, combinacoesPremiadas } from '../src/combinatoria.ts'

describe('combinacao', () => {
  it.each([
    [7, 6, 7],
    [16, 15, 16],
    [60, 6, 50063860],
    [25, 15, 3268760],
    [80, 5, 24040016],
    [20, 6, 38760],
    [5, 0, 1],
    [5, 5, 1],
    [0, 0, 1],
    [3, 4, 0],
    [3, -1, 0],
    [2.5, 1, 0],
  ])('C(%i, %i) = %i', (n, k, e) => {
    expect(combinacao(n, k)).toBe(e)
  })

  it('detecta estouro do inteiro seguro', () => {
    expect(() => combinacao(100, 50)).toThrow()
  })
})

describe('combinacoesPremiadas (seção 9.2)', () => {
  it('Mega, 7 marcadas, 6 acertos → 1 sena, 6 quinas, 0 quadras', () => {
    expect(combinacoesPremiadas(7, 6, 6, 6)).toBe(1)
    expect(combinacoesPremiadas(7, 6, 6, 5)).toBe(6)
    expect(combinacoesPremiadas(7, 6, 6, 4)).toBe(0)
  })

  it('Mega, 7 marcadas, 5 acertos → 2 quinas, 5 quadras', () => {
    expect(combinacoesPremiadas(7, 5, 6, 5)).toBe(2)
    expect(combinacoesPremiadas(7, 5, 6, 4)).toBe(5)
  })

  it('propriedade: Σ_j C(k,j)·C(n−k,p−j) = C(n,p)', () => {
    const casos: [number, number][] = [
      [6, 6],
      [15, 15],
      [5, 5],
    ]
    for (const [p, minN] of casos) {
      for (let n = minN; n <= minN + 9; n++) {
        for (let k = 0; k <= Math.min(n, p + 5); k++) {
          let soma = 0
          for (let j = 0; j <= p; j++) soma += combinacoesPremiadas(n, k, p, j)
          expect(soma, `n=${n} k=${k} p=${p}`).toBe(combinacao(n, p))
        }
      }
    }
  })
})

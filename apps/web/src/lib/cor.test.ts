import { describe, expect, it } from 'vitest'

import { corTextoSobre } from './cor'

describe('corTextoSobre', () => {
  // Cores das modalidades (catálogo) → texto esperado.
  it.each([
    ['#260085', '#ffffff'], // Quina
    ['#930089', '#ffffff'], // Lotofácil
    ['#209869', '#1a1c33'], // Mega-Sena: o branco não chega a 4,5:1
    ['#F78100', '#1a1c33'], // Lotomania
  ])('%s → %s', (fundo, texto) => {
    expect(corTextoSobre(fundo)).toBe(texto)
  })
})

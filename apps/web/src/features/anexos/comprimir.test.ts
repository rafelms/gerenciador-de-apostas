import { describe, expect, it } from 'vitest'

import { dimensoesAlvo, validarEntrada } from './comprimir'

describe('dimensoesAlvo', () => {
  it('reduz o lado maior para 1600 mantendo a proporção', () => {
    expect(dimensoesAlvo(4000, 3000)).toEqual({ largura: 1600, altura: 1200 })
    expect(dimensoesAlvo(3024, 4032)).toEqual({ largura: 1200, altura: 1600 })
  })

  it('não amplia imagem pequena', () => {
    expect(dimensoesAlvo(800, 600)).toEqual({ largura: 800, altura: 600 })
  })
})

describe('validarEntrada', () => {
  it('aceita foto de 8 MB (vai ser comprimida) e recusa tipo ou tamanho fora', () => {
    expect(validarEntrada({ type: 'image/jpeg', size: 8 * 1024 * 1024 })).toBeNull()
    expect(validarEntrada({ type: 'application/pdf', size: 1000 })).toBe(
      'Envie uma foto em JPEG, PNG ou WebP.',
    )
    expect(validarEntrada({ type: 'image/heic', size: 1000 })).toBe(
      'Envie uma foto em JPEG, PNG ou WebP.',
    )
    expect(validarEntrada({ type: 'image/png', size: 31 * 1024 * 1024 })).toMatch(/30 MB/)
  })
})

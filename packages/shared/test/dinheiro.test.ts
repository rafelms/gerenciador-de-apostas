import { describe, expect, it } from 'vitest'

import {
  aplicarBps,
  arredondarHalfUp,
  calcularGastoUsuario,
  deReais,
  formatarBRL,
  multiplicarFracao,
  ratearMaiorResto,
  tentarDeReais,
} from '../src/dinheiro.ts'

describe('deReais', () => {
  it.each([
    ['11,93', 1193],
    ['R$ 11,93', 1193],
    ['R$\u00a01.234,56', 123456],
    ['8,8', 880],
    ['8', 800],
    ['1.234', 123400],
    ['11.93', 1193],
    ['0,01', 1],
    ['-5,00', -500],
    [3.09, 309],
    [1.005, 101],
    [8.84, 884],
  ])('%s → %i', (entrada, esperado) => {
    expect(deReais(entrada)).toBe(esperado)
  })

  it.each(['', 'abc', '1,2,3', '12,345', '1.23.4', 'R$', '1,'])('rejeita %s', (entrada) => {
    expect(() => deReais(entrada)).toThrow()
  })

  it('rejeita números não finitos', () => {
    expect(() => deReais(Number.NaN)).toThrow()
  })

  it('tentarDeReais devolve null em vez de lançar', () => {
    expect(tentarDeReais('xyz')).toBeNull()
    expect(tentarDeReais('')).toBeNull()
    expect(tentarDeReais(null)).toBeNull()
    expect(tentarDeReais(undefined)).toBeNull()
    expect(tentarDeReais('3,09')).toBe(309)
  })
})

describe('formatarBRL', () => {
  it.each([
    [1193, 'R$ 11,93'],
    [123456, 'R$ 1.234,56'],
    [0, 'R$ 0,00'],
    [5, 'R$ 0,05'],
    [100000000, 'R$ 1.000.000,00'],
    [-500, '-R$ 5,00'],
  ])('%i → %s', (centavos, esperado) => {
    expect(formatarBRL(centavos)).toBe(esperado)
  })

  it('recusa valores que não são centavos inteiros', () => {
    expect(() => formatarBRL(11.93)).toThrow()
  })
})

describe('arredondamento half-up', () => {
  it.each([
    [2.5, 3],
    [2.4999, 2],
    [-2.5, -3],
    [100.49999999999999, 101], // 1.005 * 100 em float: o epsilon trata como meio exato (R$ 1,005 → 101)
    [100.4, 100],
    [0, 0],
  ])('%d → %i', (v, e) => {
    expect(arredondarHalfUp(v)).toBe(e)
  })

  it('multiplicarFracao é exato e half-up', () => {
    expect(multiplicarFracao(1193, 1, 38)).toBe(31) // 31,39… → 31
    expect(multiplicarFracao(5, 1, 2)).toBe(3) // 2,5 → 3
    expect(multiplicarFracao(-5, 1, 2)).toBe(-3)
    expect(multiplicarFracao(Number.MAX_SAFE_INTEGER, 3, 3)).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => multiplicarFracao(10, 1, 0)).toThrow()
    expect(() => multiplicarFracao(1.5, 1, 2)).toThrow()
  })

  it('aplicarBps: 30% de R$ 2.259,21', () => {
    expect(aplicarBps(225921, 3000)).toBe(67776) // 67776,3 → 67776
    expect(aplicarBps(5, 5000)).toBe(3) // 2,5 → 3
  })
})

describe('ratearMaiorResto', () => {
  it('R$ 100,00 por 1/1/1 → 33,34 + 33,33 + 33,33', () => {
    expect(ratearMaiorResto(10000, [1, 1, 1])).toEqual([3334, 3333, 3333])
  })

  it('distribui a sobra pelo maior resto, não pela ordem', () => {
    // 100 × [1, 2] / 3 = 33,33 e 66,66 → a sobra vai para o segundo (resto maior)
    expect(ratearMaiorResto(100, [1, 2])).toEqual([33, 67])
  })

  it('aceita pesos com 2 casas decimais', () => {
    expect(ratearMaiorResto(1000, [1.5, 0.5])).toEqual([750, 250])
  })

  it('total zero', () => {
    expect(ratearMaiorResto(0, [1, 2, 3])).toEqual([0, 0, 0])
  })

  it('valida entradas', () => {
    expect(() => ratearMaiorResto(100, [])).toThrow()
    expect(() => ratearMaiorResto(-1, [1])).toThrow()
    expect(() => ratearMaiorResto(100, [1, 0])).toThrow()
    expect(() => ratearMaiorResto(100, [1, -2])).toThrow()
  })

  it('propriedade: a soma das partes é sempre igual ao total', () => {
    let semente = 42
    const aleatorio = () => {
      semente = (semente * 1103515245 + 12345) % 2 ** 31
      return semente / 2 ** 31
    }
    for (let i = 0; i < 2000; i++) {
      const total = Math.floor(aleatorio() * 10_000_000)
      const pesos = Array.from({ length: 1 + Math.floor(aleatorio() * 8) }, () => Math.round((0.01 + aleatorio() * 10) * 100) / 100)
      const partes = ratearMaiorResto(total, pesos)
      expect(partes.reduce((a, b) => a + b, 0)).toBe(total)
      expect(partes.every((p) => Number.isInteger(p) && p >= 0)).toBe(true)
    }
  })
})

describe('calcularGastoUsuario', () => {
  it('sem participantes, o usuário pagou tudo', () => {
    expect(calcularGastoUsuario(1193, [])).toBe(1193)
  })

  it('proporcional ao peso', () => {
    const p = [
      { peso: 1, ehUsuario: true },
      { peso: 1, ehUsuario: false },
      { peso: 2, ehUsuario: false },
    ]
    expect(calcularGastoUsuario(1000, p)).toBe(250)
  })

  it('pela contribuição, quando informada', () => {
    const p = [
      { peso: 1, ehUsuario: true, contribuicaoCentavos: 700 },
      { peso: 1, ehUsuario: false, contribuicaoCentavos: 300 },
    ]
    expect(calcularGastoUsuario(1000, p)).toBe(700)
  })

  it('exige o usuário na divisão', () => {
    expect(() => calcularGastoUsuario(1000, [{ peso: 1, ehUsuario: false }])).toThrow()
  })
})

import { describe, expect, it } from 'vitest'

import { custoAposta, tarifaDentroDoLimite, totalBolao, valorCotaConfere } from '../src/aposta.ts'
import {
  ehSlugSuportado,
  normalizarSlug,
  obterRegra,
  ordenarDezenas,
  parseDezenas,
  regras,
  SLUGS_MVP,
} from '../src/regras/index.ts'

// Preços vigentes desde 09/07/2025 (seed).
const PRECO = { megasena: 600, lotofacil: 350, quina: 300 }

describe('custoJogo (aceite F1)', () => {
  it('Mega-Sena com 7 dezenas = R$ 42,00', () => {
    expect(regras.megasena.custoJogo(7, PRECO.megasena)).toBe(4200)
  })
  it('Lotofácil com 16 dezenas = R$ 56,00', () => {
    expect(regras.lotofacil.custoJogo(16, PRECO.lotofacil)).toBe(5600)
  })
  it.each([
    ['megasena', 6, 600],
    ['megasena', 20, 600 * 38760],
    ['lotofacil', 15, 350],
    ['lotofacil', 20, 350 * 15504],
    ['quina', 5, 300],
    ['quina', 15, 300 * 3003],
  ] as const)('%s com %i dezenas', (slug, n, esperado) => {
    expect(regras[slug].custoJogo(n, PRECO[slug])).toBe(esperado)
  })
})

describe('custoAposta', () => {
  it('soma os jogos e multiplica pelos concursos da teimosinha', () => {
    const jogos = [
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 6, 7],
    ]
    expect(custoAposta(regras.megasena, jogos, 600)).toBe(600 + 4200)
    expect(custoAposta(regras.megasena, jogos, 600, 3)).toBe((600 + 4200) * 3)
  })
})

describe('validarJogo', () => {
  it('jogo válido não tem erros', () => {
    expect(regras.megasena.validarJogo([2, 9, 24, 28, 44, 48, 49])).toEqual([])
    expect(regras.quina.validarJogo([1, 20, 40, 60, 80])).toEqual([])
  })

  it('quantidade fora do limite (mensagem do exemplo da spec)', () => {
    expect(regras.megasena.validarJogo([1, 2, 3, 4, 5])).toContain(
      'Mega-Sena aceita de 6 a 20 dezenas; encontradas 5',
    )
    expect(regras.lotofacil.validarJogo(Array.from({ length: 21 }, (_, i) => i + 1))[0]).toMatch(
      /de 15 a 20/,
    )
  })

  it('dezena fora do universo e repetida', () => {
    const erros = regras.megasena.validarJogo([0, 2, 2, 61, 5, 6])
    expect(erros).toContain('Dezena 0 fora do intervalo 1–60')
    expect(erros).toContain('Dezena 61 fora do intervalo 1–60')
    expect(erros).toContain('Dezena 2 repetida')
  })

  it('não inteiros são inválidos', () => {
    expect(regras.quina.validarJogo([1, 2, 3, 4, Number.NaN])).toHaveLength(1)
  })
})

describe('conferir', () => {
  const sorteio = { dezenas: [2, 9, 24, 28, 44, 48] }

  it('Mega 7 dezenas com 6 acertos → 1 sena + 6 quinas', () => {
    const r = regras.megasena.conferir([2, 9, 24, 28, 44, 48, 49], sorteio)
    expect(r.acertos).toBe(6)
    expect(r.dezenasAcertadas).toEqual([2, 9, 24, 28, 44, 48])
    expect(r.premiosPorFaixa).toEqual({ 6: 1, 5: 6, 4: 0 })
  })

  it('Mega 7 dezenas com 5 acertos → 2 quinas + 5 quadras', () => {
    const r = regras.megasena.conferir([2, 9, 24, 28, 44, 50, 51], sorteio)
    expect(r.premiosPorFaixa).toEqual({ 6: 0, 5: 2, 4: 5 })
  })

  it('Lotofácil simples com 14 acertos', () => {
    const sorteado = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    const jogo = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 25]
    const r = regras.lotofacil.conferir(jogo, { dezenas: sorteado })
    expect(r.acertos).toBe(14)
    expect(r.premiosPorFaixa).toEqual({ 15: 0, 14: 1, 13: 0, 12: 0, 11: 0 })
  })

  it('Quina sem acertos', () => {
    const r = regras.quina.conferir([1, 2, 3, 4, 5], { dezenas: [10, 20, 30, 40, 50] })
    expect(r.acertos).toBe(0)
    expect(r.premiosPorFaixa).toEqual({ 5: 0, 4: 0, 3: 0, 2: 0 })
  })
})

describe('bolão (Apêndice A)', () => {
  const jogos = [
    [2, 9, 24, 28, 44, 48, 49],
    [2, 6, 28, 41, 44, 49, 53],
    [2, 15, 19, 28, 44, 49, 50],
    [12, 14, 36, 38, 44, 51, 56],
    [4, 6, 8, 18, 25, 30, 41],
    [3, 6, 11, 18, 30, 47, 56],
    [6, 13, 16, 25, 26, 28, 49],
    [2, 14, 22, 24, 35, 45, 48],
  ]

  it('R$ 8,84 + R$ 3,09 = R$ 11,93', () => {
    expect(totalBolao(1, 884, 309)).toBe(1193)
  })

  it('tarifa de 34,95% está dentro do limite de 35%', () => {
    expect(tarifaDentroDoLimite(309, 884)).toBe(true)
    expect(tarifaDentroDoLimite(310, 884)).toBe(true) // 1 centavo de tolerância
    expect(tarifaDentroDoLimite(312, 884)).toBe(false)
  })

  it('valor da cota confere com o preço vigente (diferença de 8 centavos ≤ 38)', () => {
    expect(custoAposta(regras.megasena, jogos, 600)).toBe(33600)
    expect(valorCotaConfere(regras.megasena, jogos, 600, 884, 38)).toBe(true)
    expect(valorCotaConfere(regras.megasena, jogos, 600, 800, 38)).toBe(false)
  })
})

describe('utilitários de modalidade', () => {
  it.each([
    ['Mega-Sena', 'megasena'],
    ['Lotofácil', 'lotofacil'],
    ['QUINA', 'quina'],
    ['Dupla Sena', 'duplasena'],
    ['Dia de Sorte', 'diadesorte'],
    ['+Milionária', 'maismilionaria'],
    ['Super Sete', 'supersete'],
  ])('normalizarSlug(%s) = %s', (nome, slug) => {
    expect(normalizarSlug(nome)).toBe(slug)
  })

  it('obterRegra', () => {
    expect(obterRegra('quina').nome).toBe('Quina')
    expect(() => obterRegra('timemania')).toThrow()
    expect(ehSlugSuportado('megasena')).toBe(true)
    expect(ehSlugSuportado('lotomania')).toBe(false)
    expect(SLUGS_MVP).toEqual(['megasena', 'lotofacil', 'quina'])
  })

  it.each([
    ['02 09 24 28 44 48 49', [2, 9, 24, 28, 44, 48, 49]],
    ['49|48|44 | 28', [28, 44, 48, 49]],
    ['1-2-3', [1, 2, 3]],
    ['1, 2; 3', [1, 2, 3]],
  ])('parseDezenas(%s)', (texto, esperado) => {
    expect(parseDezenas(texto)).toEqual(esperado)
  })

  it('parseDezenas marca tokens inválidos como NaN', () => {
    expect(parseDezenas('1 2 abc').some(Number.isNaN)).toBe(true)
    expect(parseDezenas('   ')).toEqual([])
  })

  it('ordenarDezenas não altera o original', () => {
    const original = [3, 1, 2]
    expect(ordenarDezenas(original)).toEqual([1, 2, 3])
    expect(original).toEqual([3, 1, 2])
  })
})

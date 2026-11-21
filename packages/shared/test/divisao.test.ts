import { describe, expect, it } from 'vitest'

import { participantesPorQuantidade, quantidadeDaDivisaoIgual } from '../src/aposta.ts'
import { calcularGastoUsuario } from '../src/dinheiro.ts'
import { apostaSchema } from '../src/schemas/aposta.ts'

describe('participantesPorQuantidade (divisão só pela quantidade)', () => {
  it('divide R$ 42,00 entre 3 pessoas em partes iguais', () => {
    expect(participantesPorQuantidade(4200, 3)).toEqual([
      { nome: 'Eu', peso: 1, ehUsuario: true, contribuicaoCentavos: 1400 },
      { nome: 'Pessoa 2', peso: 1, ehUsuario: false, contribuicaoCentavos: 1400 },
      { nome: 'Pessoa 3', peso: 1, ehUsuario: false, contribuicaoCentavos: 1400 },
    ])
  })

  it.each([
    [1000, 3, [334, 333, 333]],
    [1000, 7, [143, 143, 143, 143, 143, 143, 142]],
    [100, 10, Array(10).fill(10)],
    [1, 2, [1, 0]],
    [0, 4, [0, 0, 0, 0]],
  ])('R$ %i centavos ÷ %i: não perde centavo e o usuário leva a 1ª sobra', (valor, n, partes) => {
    const ps = participantesPorQuantidade(valor, n)
    expect(ps.map((p) => p.contribuicaoCentavos)).toEqual(partes)
    expect(ps.reduce((s, p) => s + p.contribuicaoCentavos, 0)).toBe(valor)
  })

  it('o gasto do usuário (seção 7.3) é exatamente a parte mostrada', () => {
    const ps = participantesPorQuantidade(1000, 3)
    expect(calcularGastoUsuario(1000, ps)).toBe(334)
  })

  it('passa no schema da aposta (inclusive com o máximo de 30 pessoas)', () => {
    for (const n of [2, 10, 30]) {
      const r = apostaSchema.safeParse({
        modalidadeSlug: 'megasena',
        tipo: 'simples',
        concursoInicial: 3070,
        qtdConcursos: 1,
        dataAposta: '2026-11-21',
        jogos: [[1, 2, 3, 4, 5, 6]],
        bolao: null,
        valorPagoCentavos: 601,
        participantes: participantesPorQuantidade(601, n),
        localCompra: null,
        observacao: null,
      })
      expect(r.success).toBe(true)
    }
  })

  it('usa o nome do usuário informado', () => {
    expect(participantesPorQuantidade(200, 2, 'Rafael')[0]!.nome).toBe('Rafael')
  })

  it.each([1, 0, 31, 2.5, Number.NaN])('recusa quantidade %s', (n) => {
    expect(() => participantesPorQuantidade(1000, n)).toThrow('2 a 30')
  })
})

describe('quantidadeDaDivisaoIgual (reabrir na edição)', () => {
  it('reconhece a divisão gerada pela quantidade', () => {
    expect(quantidadeDaDivisaoIgual(1000, participantesPorQuantidade(1000, 7))).toBe(7)
  })

  it('aceita outro nome para o usuário', () => {
    expect(quantidadeDaDivisaoIgual(1000, participantesPorQuantidade(1000, 3, 'Rafael'))).toBe(3)
  })

  it.each([
    ['sem participantes', []],
    [
      'nomes de verdade',
      [
        { nome: 'Eu', peso: 1, ehUsuario: true, contribuicaoCentavos: 500 },
        { nome: 'Ana', peso: 1, ehUsuario: false, contribuicaoCentavos: 500 },
      ],
    ],
    [
      'peso diferente',
      [
        { nome: 'Eu', peso: 2, ehUsuario: true, contribuicaoCentavos: 500 },
        { nome: 'Pessoa 2', peso: 1, ehUsuario: false, contribuicaoCentavos: 500 },
      ],
    ],
    [
      'sem contribuição',
      [
        { nome: 'Eu', peso: 1, ehUsuario: true, contribuicaoCentavos: null },
        { nome: 'Pessoa 2', peso: 1, ehUsuario: false, contribuicaoCentavos: null },
      ],
    ],
    [
      'usuário fora do 1º lugar',
      [
        { nome: 'Pessoa 2', peso: 1, ehUsuario: false, contribuicaoCentavos: 500 },
        { nome: 'Eu', peso: 1, ehUsuario: true, contribuicaoCentavos: 500 },
      ],
    ],
    ['rateio de outro valor', participantesPorQuantidade(999, 2)],
    [
      'acima do limite',
      Array.from({ length: 31 }, (_, i) => ({
        nome: i === 0 ? 'Eu' : `Pessoa ${i + 1}`,
        peso: 1,
        ehUsuario: i === 0,
        contribuicaoCentavos: 0,
      })),
    ],
  ])('não reconhece: %s', (_, ps) => {
    expect(quantidadeDaDivisaoIgual(1000, ps)).toBeNull()
  })
})

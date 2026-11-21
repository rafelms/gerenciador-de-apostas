import { describe, expect, it } from 'vitest'

import {
  chanceDeSena,
  COMBINACOES_MEGA,
  diasAte,
  ordenarItens,
  resumoItens,
  textoContagem,
  viradaNoMenu,
} from './virada'

describe('contagem até o sorteio', () => {
  it('conta os dias entre datas puras', () => {
    expect(diasAte('2026-11-21', '2026-12-31')).toBe(40)
    expect(diasAte('2026-12-31', '2026-12-31')).toBe(0)
    expect(diasAte('2027-01-02', '2026-12-31')).toBe(-2)
  })

  it('escolhe o texto pela distância', () => {
    expect(textoContagem('2026-11-21')).toBe('Faltam 40 dias')
    expect(textoContagem('2026-12-30')).toBe('Falta 1 dia')
    expect(textoContagem('2026-12-31')).toBe('O sorteio é hoje')
    expect(textoContagem('2027-01-01')).toBe('Sorteio realizado')
  })

  it('a aba sai do menu uma semana depois do sorteio', () => {
    expect(viradaNoMenu('2027-01-07')).toBe(true)
    expect(viradaNoMenu('2027-01-08')).toBe(false)
  })
})

describe('chance de sena', () => {
  it('um jogo de 6 dezenas é 1 em 50.063.860', () => {
    expect(COMBINACOES_MEGA).toBe(50_063_860)
    expect(chanceDeSena([6])).toEqual({ combinacoes: 1, umEm: 50_063_860 })
  })

  it('soma as combinações de cada jogo', () => {
    // 7 dezenas = 7 combinações; 8 dezenas = 28.
    expect(chanceDeSena([7, 8, 6]).combinacoes).toBe(36)
    expect(chanceDeSena([7]).umEm).toBe(7_151_980)
  })

  it('sem jogo válido não há chance a mostrar', () => {
    expect(chanceDeSena([])).toEqual({ combinacoes: 0, umEm: null })
  })
})

describe('lista de apostas a fazer', () => {
  const itens = [
    { id: 'a', descricao: 'A', valor_previsto_centavos: 500, feito: true },
    { id: 'b', descricao: 'B', valor_previsto_centavos: 1000, feito: false },
    { id: 'c', descricao: 'C', valor_previsto_centavos: null, feito: false },
  ]

  it('põe as pendentes primeiro, sem trocar a ordem dentro do grupo', () => {
    expect(ordenarItens(itens).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('resume o que foi feito e o que falta', () => {
    expect(resumoItens(itens)).toEqual({
      total: 3,
      feitos: 1,
      faltam: 2,
      valorFeito: 500,
      valorFalta: 1000,
    })
  })
})

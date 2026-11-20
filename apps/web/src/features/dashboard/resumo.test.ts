import { describe, expect, it } from 'vitest'

import { calcularTotais, roi } from './resumo'

describe('calcularTotais', () => {
  it('sem apostas', () => {
    expect(
      calcularTotais({
        gasto: 0,
        recuperado: 0,
        qtd_apostas: 0,
        qtd_finalizadas: 0,
        qtd_premiadas: 0,
      }),
    ).toEqual({
      gasto: 0,
      recuperado: 0,
      saldo: 0,
      roi: null,
      qtdApostas: 0,
      taxaPremiadas: null,
    })
  })

  it('saldo, ROI e taxa de premiadas entre as conferidas', () => {
    expect(
      calcularTotais({
        gasto: 2000,
        recuperado: 3000,
        qtd_apostas: 3,
        qtd_finalizadas: 2,
        qtd_premiadas: 1,
      }),
    ).toEqual({
      gasto: 2000,
      recuperado: 3000,
      saldo: 1000,
      roi: 0.5,
      qtdApostas: 3,
      taxaPremiadas: 0.5,
    })
  })
})

describe('roi', () => {
  it('saldo ÷ gasto; null sem gasto', () => {
    expect(roi({ gasto: 400, recuperado: 100 })).toBe(-0.75)
    expect(roi({ gasto: 0, recuperado: 100 })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { calcularTotais } from './resumo'

describe('calcularTotais', () => {
  it('sem apostas', () => {
    expect(calcularTotais([])).toEqual({ gasto: 0, recuperado: 0, saldo: 0, roi: null, qtdApostas: 0, taxaPremiadas: null })
  })

  it('soma gasto e recuperado, calcula saldo, ROI e taxa de premiadas', () => {
    const t = calcularTotais([
      { gasto_usuario_centavos: 1000, recuperado_usuario_centavos: 0, status: 'nao_premiada' },
      { gasto_usuario_centavos: 600, recuperado_usuario_centavos: 2000, status: 'premiada' },
      { gasto_usuario_centavos: 400, recuperado_usuario_centavos: null, status: 'aguardando' },
    ])
    expect(t).toEqual({ gasto: 2000, recuperado: 2000, saldo: 0, roi: 0, qtdApostas: 3, taxaPremiadas: 0.5 })
  })
})

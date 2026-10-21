import { describe, expect, it } from 'vitest'

import { textoNotificacaoResultado } from '../src/notificacoes.ts'

const base = {
  modalidadeNome: 'Mega-Sena',
  numeroConcurso: 3070,
  qtdApostas: 1,
  premiada: false,
  liquidoCentavos: 0,
  valorPendente: false,
  melhorAcerto: 3,
}

describe('textoNotificacaoResultado (seção 10.2)', () => {
  it('premiada', () => {
    expect(
      textoNotificacaoResultado({ ...base, premiada: true, liquidoCentavos: 70_000 }).titulo,
    ).toBe('🎉 Sua aposta na Mega-Sena 3070 foi premiada: R$ 700,00 líquidos')
  })
  it('várias apostas premiadas', () => {
    expect(
      textoNotificacaoResultado({ ...base, qtdApostas: 2, premiada: true, liquidoCentavos: 100 })
        .titulo,
    ).toBe('🎉 Suas apostas na Mega-Sena 3070 foram premiadas: R$ 1,00 líquidos')
  })
  it('premiada sem valor no rateio', () => {
    const t = textoNotificacaoResultado({ ...base, premiada: true, valorPendente: true })
    expect(t.titulo).toBe('🎉 Sua aposta na Mega-Sena 3070 foi premiada: valor a confirmar')
    expect(t.corpo).toMatch(/informar o valor/)
  })
  it('não premiada', () => {
    expect(textoNotificacaoResultado(base)).toEqual({
      titulo: 'Resultado da Mega-Sena 3070 conferido: melhor jogo com 3 acertos',
      corpo: 'Não foi desta vez.',
    })
    expect(textoNotificacaoResultado({ ...base, melhorAcerto: 1, qtdApostas: 3 })).toEqual({
      titulo: 'Resultado da Mega-Sena 3070 conferido: melhor jogo com 1 acerto',
      corpo: '3 apostas conferidas, nenhuma premiada.',
    })
  })
})

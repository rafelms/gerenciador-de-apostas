import { describe, expect, it } from 'vitest'

import { textoDaAposta, textoDoLote, type ApostaParaCopiar } from './texto-copia'

const mega: ApostaParaCopiar = {
  modalidadeNome: 'Mega-Sena',
  tipo: 'simples',
  concursoInicial: 3070,
  qtdConcursos: 1,
  jogos: [
    [3, 17, 22, 31, 40, 58],
    [5, 11, 19, 27, 44, 60],
  ],
}

describe('textoDaAposta', () => {
  it('uma linha por jogo, com dezenas de 2 dígitos', () => {
    expect(textoDaAposta(mega)).toBe(
      'Mega-Sena · concurso 3070\nJogo 1: 03 17 22 31 40 58\nJogo 2: 05 11 19 27 44 60',
    )
  })

  it('teimosinha mostra a faixa de concursos; bolão é indicado', () => {
    expect(
      textoDaAposta({ ...mega, tipo: 'teimosinha', qtdConcursos: 4, jogos: [[1, 2, 3, 4, 5, 6]] }),
    ).toBe('Mega-Sena · concursos 3070 a 3073\nJogo 1: 01 02 03 04 05 06')
    expect(textoDaAposta({ ...mega, tipo: 'bolao', jogos: [] })).toBe(
      'Mega-Sena · concurso 3070 · bolão',
    )
  })

  it('Lotomania: a dezena 0 vira 00', () => {
    expect(textoDaAposta({ ...mega, modalidadeNome: 'Lotomania', jogos: [[0, 7, 99]] })).toContain(
      'Jogo 1: 00 07 99',
    )
  })
})

describe('textoDoLote', () => {
  it('dia no topo e uma linha em branco entre as apostas', () => {
    const quina = {
      ...mega,
      modalidadeNome: 'Quina',
      concursoInicial: 6800,
      jogos: [[1, 2, 3, 4, 5]],
    }
    expect(textoDoLote('2026-10-21', [mega, quina])).toBe(
      [
        'Apostas de 21/10/2026',
        'Mega-Sena · concurso 3070\nJogo 1: 03 17 22 31 40 58\nJogo 2: 05 11 19 27 44 60',
        'Quina · concurso 6800\nJogo 1: 01 02 03 04 05',
      ].join('\n\n'),
    )
  })
})

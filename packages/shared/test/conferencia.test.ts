import { describe, expect, it } from 'vitest'

import {
  conferirJogo,
  conferirJogos,
  parteDasCotas,
  premioBrutoAposta,
  statusDaAposta,
} from '../src/conferencia.ts'
import { regras } from '../src/regras/index.ts'

const SORTEIO_MEGA = [3, 17, 22, 31, 40, 58]

describe('conferirJogo (aceite F2)', () => {
  it('Mega de 7 dezenas com 6 acertos gera 1 sena + 6 quinas', () => {
    const r = conferirJogo(regras.megasena, [3, 17, 22, 31, 40, 58, 60], SORTEIO_MEGA)
    expect(r.acertos).toBe(6)
    expect(r.dezenasAcertadas).toEqual(SORTEIO_MEGA)
    expect(r.premiosPorFaixa).toEqual({ 6: 1, 5: 6, 4: 0 })
  })

  it('Mega de 7 dezenas com 5 acertos gera 2 quinas + 5 quadras (seção 9.2)', () => {
    const r = conferirJogo(regras.megasena, [3, 17, 22, 31, 40, 1, 2], SORTEIO_MEGA)
    expect(r.premiosPorFaixa).toEqual({ 6: 0, 5: 2, 4: 5 })
  })

  it('Lotofácil de 15 dezenas com 11 acertos', () => {
    const sorteio = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
    const jogo = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 21, 22, 23, 24]
    expect(conferirJogo(regras.lotofacil, jogo, sorteio).premiosPorFaixa).toEqual({
      15: 0,
      14: 0,
      13: 0,
      12: 0,
      11: 1,
    })
  })
})

describe('conferirJogos', () => {
  it('soma as combinações premiadas por faixa e aponta o melhor acerto', () => {
    const c = conferirJogos(
      regras.megasena,
      [
        [3, 17, 22, 31, 40, 58, 60], // 6 acertos
        [3, 17, 22, 31, 1, 2], // quadra
        [1, 2, 4, 5, 6, 7], // nada
      ],
      SORTEIO_MEGA,
    )
    expect(c.jogos.map((j) => j.acertos)).toEqual([6, 4, 0])
    expect(c.melhorAcerto).toBe(6)
    expect(c.premiosPorFaixa).toEqual({ 6: 1, 5: 6, 4: 1 })
    expect(c.premiada).toBe(true)
  })

  it('aposta sem combinação premiada', () => {
    const c = conferirJogos(regras.quina, [[1, 2, 3, 4, 8]], [8, 19, 33, 57, 71])
    expect(c.melhorAcerto).toBe(1)
    expect(c.premiada).toBe(false)
  })
})

describe('premioBrutoAposta (seção 9.4)', () => {
  const rateio = [
    { acertos: 6, ganhadores: 1, valorCentavos: 10_000_000_00 },
    { acertos: 5, ganhadores: 52, valorCentavos: 41_234_56 },
    { acertos: 4, ganhadores: 3876, valorCentavos: 1_012_34 },
  ]

  it('Σ combinações × valor da faixa', () => {
    expect(premioBrutoAposta({ 6: 0, 5: 2, 4: 5 }, rateio)).toEqual({
      brutoCentavos: 2 * 41_234_56 + 5 * 1_012_34,
      faixasSemValor: [],
    })
  })

  it('faixa premiada sem valor no rateio fica sinalizada', () => {
    expect(premioBrutoAposta({ 6: 1, 5: 6, 4: 0 }, [rateio[2]!])).toEqual({
      brutoCentavos: 0,
      faixasSemValor: [6, 5],
    })
    expect(
      premioBrutoAposta({ 4: 1 }, [{ acertos: 4, ganhadores: 0, valorCentavos: 0 }]).faixasSemValor,
    ).toEqual([4])
  })

  it('aplica a conversão do valor da faixa (rateio líquido → bruto)', () => {
    expect(premioBrutoAposta({ 4: 2 }, rateio, (v) => v * 2).brutoCentavos).toBe(2 * 2 * 1_012_34)
  })
})

describe('statusDaAposta (seção 9.7)', () => {
  it.each([
    [1, 0, false, 'aguardando'],
    [3, 1, true, 'conferida'],
    [3, 3, true, 'premiada'],
    [1, 1, false, 'nao_premiada'],
  ] as const)(
    '%i concursos, %i conferidos, prêmio=%s → %s',
    (qtd, conferidos, premio, esperado) => {
      expect(statusDaAposta(qtd, conferidos, premio)).toBe(esperado)
    },
  )
})

describe('parteDasCotas', () => {
  it('half-up no centavo', () => {
    expect(parteDasCotas(3_829_572, 1, 38)).toBe(100_778)
    expect(parteDasCotas(1000, 2, 3)).toBe(667)
  })
})

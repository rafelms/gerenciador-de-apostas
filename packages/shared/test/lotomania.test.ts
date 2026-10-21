import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { custoAposta } from '../src/aposta.ts'
import { conferirJogo, conferirJogos, premioBrutoAposta } from '../src/conferencia.ts'
import {
  concursosTeimosinha,
  jogoEspelho,
  obterRegra,
  parseDezenas,
  regras,
  SLUGS_SUPORTADOS,
} from '../src/regras/index.ts'
import { normalizarConcursoCaixa } from '../src/resultados.ts'
import { apostaSchema } from '../src/schemas/aposta.ts'

const lotomania = regras.lotomania
const PRECO = 300 // R$ 3,00, preço único

/** Os 50 números de 00 a 49. */
const PRIMEIROS_50 = Array.from({ length: 50 }, (_, i) => i)
/** Sorteio fictício: 20 números de 50 a 69 (nenhum entre 00 e 49). */
const SORTEIO_ALTO = Array.from({ length: 20 }, (_, i) => 50 + i)

describe('Lotomania — regra', () => {
  it('está entre as modalidades suportadas', () => {
    expect(SLUGS_SUPORTADOS).toContain('lotomania')
    expect(obterRegra('lotomania')).toBe(lotomania)
  })

  it('preço único: cada jogo de 50 números custa R$ 3,00', () => {
    expect(lotomania.custoJogo(50, PRECO)).toBe(300)
    expect(custoAposta(lotomania, [PRIMEIROS_50], PRECO, 4)).toBe(1200)
  })

  it('exige exatamente 50 números de 00 a 99', () => {
    expect(lotomania.validarJogo(PRIMEIROS_50)).toEqual([])
    expect(lotomania.validarJogo(PRIMEIROS_50.slice(0, 49))).toContain(
      'Lotomania exige 50 dezenas; encontradas 49',
    )
    expect(lotomania.validarJogo([...PRIMEIROS_50.slice(0, 49), 100])).toContain(
      'Dezena 100 fora do intervalo 0–99',
    )
  })

  it('"00" é a dezena 0', () => {
    expect(parseDezenas('00 01 99')).toEqual([0, 1, 99])
  })
})

describe('Lotomania — conferência', () => {
  it('premia NENHUM acerto (0 dos 20 sorteados)', () => {
    const r = conferirJogo(lotomania, PRIMEIROS_50, SORTEIO_ALTO)
    expect(r.acertos).toBe(0)
    expect(r.premiosPorFaixa).toEqual({ 20: 0, 19: 0, 18: 0, 17: 0, 16: 0, 15: 0, 0: 1 })
  })

  it.each([20, 19, 18, 17, 16, 15])('%i acertos premia só a própria faixa', (k) => {
    // k números sorteados dentro do jogo, o resto fora.
    const sorteio = [...PRIMEIROS_50.slice(0, k), ...SORTEIO_ALTO.slice(0, 20 - k)]
    const r = conferirJogo(lotomania, PRIMEIROS_50, sorteio)
    expect(r.acertos).toBe(k)
    expect(Object.entries(r.premiosPorFaixa).filter(([, q]) => q > 0)).toEqual([[String(k), 1]])
  })

  it.each([1, 10, 14])('%i acertos não premia', (k) => {
    const sorteio = [...PRIMEIROS_50.slice(0, k), ...SORTEIO_ALTO.slice(0, 20 - k)]
    expect(conferirJogos(lotomania, [PRIMEIROS_50], sorteio).premiada).toBe(false)
  })

  it('jogo + espelho: um dos dois sempre acerta pelo menos 10', () => {
    const espelho = jogoEspelho(lotomania, PRIMEIROS_50)!
    const c = conferirJogos(lotomania, [PRIMEIROS_50, espelho], SORTEIO_ALTO)
    // O original fez 0 (premiado) e o espelho fez os 20 (prêmio máximo).
    expect(c.jogos.map((j) => j.acertos)).toEqual([0, 20])
    expect(c.premiosPorFaixa[0]).toBe(1)
    expect(c.premiosPorFaixa[20]).toBe(1)
    const rateio = [
      { acertos: 20, ganhadores: 1, valorCentavos: 1_000_000_00 },
      { acertos: 0, ganhadores: 1, valorCentavos: 100_000_00 },
    ]
    expect(premioBrutoAposta(c.premiosPorFaixa, rateio).brutoCentavos).toBe(1_100_000_00)
  })
})

describe('Lotomania — Aposta-Espelho e teimosinha', () => {
  it('o espelho tem os outros 50 números', () => {
    const espelho = jogoEspelho(lotomania, PRIMEIROS_50)!
    expect(espelho).toHaveLength(50)
    expect(espelho[0]).toBe(50)
    expect(espelho.at(-1)).toBe(99)
    expect(jogoEspelho(lotomania, espelho)).toEqual(PRIMEIROS_50)
  })

  it('outras modalidades não têm espelho', () => {
    expect(jogoEspelho(regras.megasena, [1, 2, 3, 4, 5, 6])).toBeNull()
  })

  it('teimosinha só para 2, 3, 4, 6, 8, 9 ou 12 concursos', () => {
    expect(concursosTeimosinha(lotomania)).toEqual([2, 3, 4, 6, 8, 9, 12])
    expect(concursosTeimosinha(regras.megasena)).toEqual(
      Array.from({ length: 23 }, (_, i) => i + 2),
    )
  })

  const base = {
    modalidadeSlug: 'lotomania',
    tipo: 'teimosinha',
    concursoInicial: 2990,
    dataAposta: '2026-10-14',
    jogos: [PRIMEIROS_50],
    bolao: null,
    participantes: [],
    localCompra: null,
    observacao: null,
  }
  const mensagens = (v: unknown) => {
    const r = apostaSchema.safeParse(v)
    return r.success ? [] : r.error.issues.map((i) => i.message)
  }

  it('o schema aceita 4 e recusa 5 concursos', () => {
    expect(mensagens({ ...base, qtdConcursos: 4, valorPagoCentavos: 1200 })).toEqual([])
    expect(mensagens({ ...base, qtdConcursos: 5, valorPagoCentavos: 1500 })).toEqual([
      'A teimosinha da Lotomania vale para 2, 3, 4, 6, 8, 9 ou 12 concursos.',
    ])
  })
})

describe('Lotomania — API da CAIXA', () => {
  it('normaliza 20 dezenas (com "00") e as 7 faixas, inclusive 0 acertos', () => {
    const json = JSON.parse(
      readFileSync(new URL('./fixtures/api-caixa-lotomania.json', import.meta.url), 'utf8'),
    )
    const c = normalizarConcursoCaixa(json, lotomania)
    expect(c.dezenas).toHaveLength(20)
    expect(c.dezenas![0]).toBe(0)
    expect(c.rateio.map((f) => f.acertos)).toEqual([20, 19, 18, 17, 16, 15, 0])
    expect(c.rateio.at(-1)).toEqual({ acertos: 0, ganhadores: 2, valorCentavos: 12_345_678 })
  })
})

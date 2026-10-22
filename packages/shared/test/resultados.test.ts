import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { regras } from '../src/regras/index.ts'
import {
  dataBrParaIso,
  normalizarConcursoAlternativo,
  normalizarConcursoCaixa,
  rateioDoBanco,
  rateioParaBanco,
} from '../src/resultados.ts'
import {
  configuracoesSchema,
  premioManualSchema,
  resultadoManualSchema,
} from '../src/schemas/resultados.ts'

// Respostas FICTÍCIAS com a estrutura real das APIs (CAIXA: 21/10/2026; alternativa:
// 22/10/2026). As da alternativa têm os mesmos dados das da CAIXA.
function fixture(slug: string, api: 'caixa' | 'alternativa' = 'caixa'): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/api-${api}-${slug}.json`, import.meta.url), 'utf8'),
  )
}

describe('normalizarConcursoCaixa', () => {
  it('Mega-Sena: dezenas ordenadas, rateio em centavos e acertos pela descrição', () => {
    expect(normalizarConcursoCaixa(fixture('megasena'), regras.megasena)).toEqual({
      numero: 3070,
      dataSorteio: '2026-10-14',
      dezenas: [3, 17, 22, 31, 40, 58],
      rateio: [
        { acertos: 6, ganhadores: 0, valorCentavos: 0 },
        { acertos: 5, ganhadores: 52, valorCentavos: 4_123_456 },
        { acertos: 4, ganhadores: 3876, valorCentavos: 101_234 },
      ],
      acumulado: true,
      dataProximo: '2026-10-16',
      valorEstimadoProximoCentavos: 3_500_000_000,
    })
  })

  it('Lotofácil e Quina', () => {
    const lf = normalizarConcursoCaixa(fixture('lotofacil'), regras.lotofacil)
    expect(lf.dezenas).toHaveLength(15)
    expect(lf.rateio.map((f) => f.acertos)).toEqual([15, 14, 13, 12, 11])
    expect(lf.rateio[0]).toEqual({ acertos: 15, ganhadores: 2, valorCentavos: 150_000_010 })
    expect(lf.acumulado).toBe(false)

    const q = normalizarConcursoCaixa(fixture('quina'), regras.quina)
    expect(q.rateio.map((f) => [f.acertos, f.valorCentavos])).toEqual([
      [5, 0],
      [4, 876_543],
      [3, 11_020],
      [2, 450],
    ])
  })

  it('sem número na descrição, usa a ordem das faixas da modalidade', () => {
    const j = fixture('megasena')
    j.listaRateioPremio = [
      { descricaoFaixa: 'Sena', faixa: 1, numeroDeGanhadores: 1, valorPremio: 100 },
      { descricaoFaixa: 'Quina', faixa: 2, numeroDeGanhadores: 2, valorPremio: 10 },
      { descricaoFaixa: 'Extra', faixa: 9, numeroDeGanhadores: 3, valorPremio: 1 },
    ]
    expect(normalizarConcursoCaixa(j, regras.megasena).rateio).toEqual([
      { acertos: 6, ganhadores: 1, valorCentavos: 10_000 },
      { acertos: 5, ganhadores: 2, valorCentavos: 1000 },
    ])
  })

  it('concurso ainda sem dezenas publicadas → dezenas null', () => {
    const j = {
      ...fixture('quina'),
      listaDezenas: [],
      listaRateioPremio: null,
      dataProximoConcurso: '',
    }
    const r = normalizarConcursoCaixa(j, regras.quina)
    expect(r.dezenas).toBeNull()
    expect(r.rateio).toEqual([])
    expect(r.dataProximo).toBeNull()
  })

  it('campos opcionais ausentes', () => {
    const {
      acumulado: _a,
      dataProximoConcurso: _d,
      valorEstimadoProximoConcurso: _v,
      ...j
    } = fixture('quina')
    expect(normalizarConcursoCaixa(j, regras.quina)).toMatchObject({
      acumulado: null,
      dataProximo: null,
      valorEstimadoProximoCentavos: null,
    })
  })

  it('recusa formato inesperado e dezenas inválidas', () => {
    expect(() => normalizarConcursoCaixa({ exceptionMessage: 'erro' }, regras.megasena)).toThrow()
    expect(() =>
      normalizarConcursoCaixa(
        { ...fixture('megasena'), listaDezenas: ['01', '02'] },
        regras.megasena,
      ),
    ).toThrow(/Dezenas inesperadas/)
    expect(() =>
      normalizarConcursoCaixa(
        { ...fixture('megasena'), listaDezenas: ['01', '02', '03', '04', '05', '61'] },
        regras.megasena,
      ),
    ).toThrow(/Dezenas inesperadas/)
  })
})

describe('normalizarConcursoAlternativo', () => {
  it.each(['megasena', 'lotofacil', 'quina', 'lotomania'] as const)(
    '%s: mesmo resultado que a CAIXA para os mesmos dados',
    (slug) => {
      expect(normalizarConcursoAlternativo(fixture(slug, 'alternativa'), regras[slug])).toEqual(
        normalizarConcursoCaixa(fixture(slug), regras[slug]),
      )
    },
  )

  it('rejeita resposta fora do formato', () => {
    expect(() => normalizarConcursoAlternativo({ status: 404 }, regras.megasena)).toThrow()
  })
})

describe('rateio no banco', () => {
  it('ida e volta', () => {
    const rateio = [{ acertos: 5, ganhadores: 2, valorCentavos: 1000 }]
    expect(rateioParaBanco(rateio)).toEqual([{ acertos: 5, ganhadores: 2, valor_centavos: 1000 }])
    expect(rateioDoBanco(rateioParaBanco(rateio))).toEqual(rateio)
  })
  it('ausente ou inválido vira lista vazia', () => {
    expect(rateioDoBanco(null)).toEqual([])
    expect(rateioDoBanco([{ acertos: 'x' }])).toEqual([])
  })
  it('dataBrParaIso', () => {
    expect(dataBrParaIso('09/07/2025')).toBe('2025-07-09')
  })
})

describe('schemas de resultados', () => {
  const manual = {
    modalidadeSlug: 'megasena',
    numero: 3070,
    dataSorteio: '2026-10-14',
    dezenas: [3, 17, 22, 31, 40, 58],
    rateio: [{ acertos: 5, ganhadores: 2, valorCentavos: 1000 }],
    acumulado: true,
  }
  const mensagens = (v: unknown) => {
    const r = resultadoManualSchema.safeParse(v)
    return r.success ? [] : r.error.issues.map((i) => i.message)
  }

  it('resultado manual válido', () => {
    expect(mensagens(manual)).toEqual([])
  })
  it('quantidade, repetição e universo das dezenas', () => {
    expect(mensagens({ ...manual, dezenas: [1, 2, 3] })).toContain(
      'Mega-Sena sorteia 6 dezenas diferentes; informadas 3.',
    )
    expect(mensagens({ ...manual, dezenas: [1, 1, 2, 3, 4, 5] })).toContain(
      'Mega-Sena sorteia 6 dezenas diferentes; informadas 5.',
    )
    expect(mensagens({ ...manual, dezenas: [1, 2, 3, 4, 5, 61] })).toContain(
      'As dezenas vão de 1 a 60.',
    )
  })
  it('faixas do rateio precisam existir e não se repetir', () => {
    expect(
      mensagens({
        ...manual,
        rateio: [
          { acertos: 3, ganhadores: 1, valorCentavos: 1 },
          { acertos: 5, ganhadores: 1, valorCentavos: 1 },
          { acertos: 5, ganhadores: 1, valorCentavos: 1 },
        ],
      }),
    ).toEqual([
      'Faixa de 3 acertos inválida ou repetida.',
      'Faixa de 5 acertos inválida ou repetida.',
    ])
  })
  it('configurações e prêmio manual', () => {
    expect(
      configuracoesSchema.safeParse({
        aliquotaIrBps: 3000,
        limiteIsencaoIrCentavos: 225_920,
        baseCalculoIr: 'cota',
        valorRateioApiEh: 'bruto',
        prazoResgateDias: 90,
      }).success,
    ).toBe(true)
    expect(configuracoesSchema.safeParse({ aliquotaIrBps: 10_001 }).success).toBe(false)
    expect(
      premioManualSchema.safeParse({ brutoUsuarioCentavos: 100, irUsuarioCentavos: 30 }).success,
    ).toBe(true)
    expect(
      premioManualSchema.safeParse({ brutoUsuarioCentavos: 100, irUsuarioCentavos: 101 }).success,
    ).toBe(false)
  })
})

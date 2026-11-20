import { describe, expect, it } from 'vitest'

import {
  filtrosDashboardDaUrl,
  filtrosDashboardParaUrl,
  intervaloDoPeriodo,
  serieMensal,
} from './periodo'

const HOJE = '2026-11-20'

describe('intervaloDoPeriodo', () => {
  it('mês atual, 3 meses, ano e tudo', () => {
    expect(intervaloDoPeriodo({ periodo: 'mes' }, HOJE)).toEqual({
      inicio: '2026-11-01',
      fim: '2026-11-30',
      rotulo: 'novembro de 2026',
    })
    expect(intervaloDoPeriodo({ periodo: '3m' }, HOJE)).toEqual({
      inicio: '2026-09-01',
      fim: '2026-11-30',
      rotulo: 'set. a nov. de 2026',
    })
    expect(intervaloDoPeriodo({ periodo: 'ano' }, HOJE)).toMatchObject({
      inicio: '2026-01-01',
      fim: '2026-12-31',
    })
    expect(intervaloDoPeriodo({ periodo: 'tudo' }, HOJE)).toMatchObject({
      inicio: null,
      fim: null,
    })
  })

  it('3 meses atravessando o ano e fevereiro bissexto', () => {
    expect(intervaloDoPeriodo({ periodo: '3m' }, '2027-01-15')).toEqual({
      inicio: '2026-11-01',
      fim: '2027-01-31',
      rotulo: 'nov. de 2026 a jan. de 2027',
    })
    expect(intervaloDoPeriodo({ periodo: 'mes' }, '2028-02-10').fim).toBe('2028-02-29')
  })

  it('personalizado: datas trocadas e limites abertos', () => {
    expect(
      intervaloDoPeriodo({ periodo: 'personalizado', de: '2026-10-31', ate: '2026-10-01' }, HOJE),
    ).toEqual({ inicio: '2026-10-01', fim: '2026-10-31', rotulo: '01/10/2026 a 31/10/2026' })
    expect(intervaloDoPeriodo({ periodo: 'personalizado', de: '2026-10-01' }, HOJE).rotulo).toBe(
      'desde 01/10/2026',
    )
    expect(intervaloDoPeriodo({ periodo: 'personalizado' }, HOJE).inicio).toBeNull()
  })
})

describe('filtros na URL', () => {
  it('ida e volta; padrão é o mês; datas só no personalizado', () => {
    const f = { periodo: 'personalizado', de: '2026-10-01', ate: '2026-10-31', modalidade: 'mega' }
    expect(filtrosDashboardDaUrl(filtrosDashboardParaUrl(f as never))).toEqual(f)
    expect(filtrosDashboardParaUrl({ periodo: 'mes' }).toString()).toBe('')
    expect(filtrosDashboardDaUrl(new URLSearchParams('periodo=xx&de=2026-01-01'))).toEqual({
      periodo: 'mes',
      modalidade: undefined,
    })
    expect(filtrosDashboardDaUrl(new URLSearchParams('periodo=personalizado&de=ontem'))).toEqual({
      periodo: 'personalizado',
      de: undefined,
      ate: undefined,
      modalidade: undefined,
    })
  })
})

describe('serieMensal', () => {
  it('completa meses vazios e acumula o saldo', () => {
    const serie = serieMensal(
      [
        { mes: '2026-09-01', gasto: 1000, recuperado: 0 },
        { mes: '2026-11-01', gasto: 500, recuperado: 2000 },
      ],
      { inicio: '2026-09-01', fim: '2026-11-30' },
      HOJE,
    )
    expect(serie.map((p) => [p.rotulo, p.gasto, p.recuperado, p.saldoAcumulado])).toEqual([
      ['set./26', 1000, 0, -1000],
      ['out./26', 0, 0, -1000],
      ['nov./26', 500, 2000, 500],
    ])
  })

  it('"tudo" começa no 1º mês com dados e vai até o mês atual', () => {
    const serie = serieMensal(
      [{ mes: '2026-08-01', gasto: 100, recuperado: 0 }],
      { inicio: null, fim: null },
      HOJE,
    )
    expect(serie.map((p) => p.mes)).toEqual([
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ])
    expect(serieMensal([], { inicio: null, fim: null }, HOJE)).toEqual([])
  })

  it('o ano não passa do mês atual', () => {
    const serie = serieMensal([], { inicio: '2026-01-01', fim: '2026-12-31' }, HOJE)
    expect(serie).toHaveLength(11)
    expect(serie.at(-1)?.rotulo).toBe('nov./26')
  })
})

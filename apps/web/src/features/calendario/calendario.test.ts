import { describe, expect, it } from 'vitest'

import {
  agruparPorDia,
  deslocarMes,
  limitesDoMes,
  mesDaUrl,
  rotuloDia,
  rotuloMes,
  rotuloSemana,
  semanasDoMes,
  type Evento,
} from './calendario'

describe('mês', () => {
  it('da URL, com fallback para o mês de hoje', () => {
    expect(mesDaUrl('2026-10', '2026-11-20')).toBe('2026-10')
    expect(mesDaUrl('2026-13', '2026-11-20')).toBe('2026-11')
    expect(mesDaUrl(null, '2026-11-20')).toBe('2026-11')
  })

  it('navegação e rótulos atravessando o ano', () => {
    expect(deslocarMes('2026-12', 1)).toBe('2027-01')
    expect(deslocarMes('2026-01', -1)).toBe('2025-12')
    expect(rotuloMes('2026-03')).toBe('março de 2026')
    expect(limitesDoMes('2028-02')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' })
    expect(rotuloDia('2026-11-20')).toBe('sexta-feira, 20 de novembro')
  })
})

describe('semanasDoMes', () => {
  it('novembro de 2026 começa num domingo e ocupa 5 semanas', () => {
    const semanas = semanasDoMes('2026-11')
    expect(semanas).toHaveLength(5)
    expect(semanas[0]![0]).toEqual({ data: '2026-11-01', doMes: true })
    expect(semanas[4]!.map((d) => d.data)).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
    ])
    expect(semanas[4]!.filter((d) => d.doMes)).toHaveLength(2)
  })

  it('outubro de 2026 começa numa quinta: os dias de setembro vêm marcados', () => {
    const [primeira] = semanasDoMes('2026-10')
    expect(primeira!.map((d) => d.doMes)).toEqual([false, false, false, false, true, true, true])
    expect(primeira![0]!.data).toBe('2026-09-27')
  })

  it('rótulo da semana só com os dias do mês', () => {
    const semanas = semanasDoMes('2026-11')
    expect(rotuloSemana(semanas[2]!)).toBe('15 a 21 de nov.')
    expect(rotuloSemana(semanas[4]!)).toBe('29 e 30 de nov.')
    expect(rotuloSemana(semanasDoMes('2026-08')[0]!)).toBe('1 de ago.')
  })
})

it('agruparPorDia mantém a ordem', () => {
  const e = (data: string, tipo: Evento['tipo']) => ({ data, tipo }) as Evento
  const mapa = agruparPorDia([
    e('2026-11-01', 'aposta'),
    e('2026-11-03', 'sorteio'),
    e('2026-11-01', 'premio'),
  ])
  expect([...mapa.keys()]).toEqual(['2026-11-01', '2026-11-03'])
  expect(mapa.get('2026-11-01')!.map((x) => x.tipo)).toEqual(['aposta', 'premio'])
})

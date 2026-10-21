import { describe, expect, it } from 'vitest'

import { filtrosDaUrl, filtrosParaUrl } from './filtros'

describe('filtros na URL', () => {
  it('ida e volta preserva os filtros', () => {
    const url = new URLSearchParams('modalidade=megasena&tipo=bolao&status=premiada&de=2026-10-01&ate=2026-10-31&premiadas=1&concurso=3070&ordem=saldo&dir=asc&origem=pdf')
    const filtros = filtrosDaUrl(url)
    expect(filtros).toEqual({
      modalidade: 'megasena',
      tipo: 'bolao',
      status: 'premiada',
      origem: 'pdf',
      de: '2026-10-01',
      ate: '2026-10-31',
      premiadas: true,
      concurso: 3070,
      ordem: 'saldo',
      direcao: 'asc',
    })
    expect(filtrosDaUrl(filtrosParaUrl(filtros))).toEqual(filtros)
  })

  it('ignora valores inválidos e usa o padrão', () => {
    const f = filtrosDaUrl(new URLSearchParams('tipo=xyz&status=&de=ontem&concurso=-3&ordem=foo'))
    expect(f).toEqual({
      modalidade: undefined,
      tipo: undefined,
      status: undefined,
      origem: undefined,
      de: undefined,
      ate: undefined,
      premiadas: undefined,
      concurso: undefined,
      ordem: 'data',
      direcao: 'desc',
    })
    expect(filtrosParaUrl(f).toString()).toBe('')
  })
})

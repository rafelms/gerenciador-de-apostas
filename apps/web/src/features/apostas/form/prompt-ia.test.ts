import { obterRegra } from '@shared/regras/index.ts'
import { describe, expect, it } from 'vitest'

import { promptParaIA } from './prompt-ia'

describe('promptParaIA', () => {
  it('Lotofácil: faixa de 15 a 20 dezenas entre 01 e 25', () => {
    const p = promptParaIA(obterRegra('lotofacil'))
    expect(p).toContain('da Lotofácil')
    expect(p).toContain('de 15 a 20 dezenas, entre 01 e 25')
    expect(p).toContain('Um jogo por linha')
    expect(p).toContain('01 03 05 07 09 11')
  })

  it('Lotomania: 50 dezenas entre 00 e 99, com o 100 escrito como 00', () => {
    const p = promptParaIA(obterRegra('lotomania'))
    expect(p).toContain('de 50 dezenas, entre 00 e 99')
    expect(p).toContain('A dezena 100 deve ser escrita como 00')
    expect(promptParaIA(obterRegra('lotofacil'))).not.toContain('dezena 100')
  })

  it('Mega-Sena: de 6 a 20 dezenas entre 01 e 60', () => {
    const p = promptParaIA(obterRegra('megasena'))
    expect(p).toMatch(/de 6 a \d+ dezenas, entre 01 e 60/)
  })

  it('o exemplo do prompt é aceito pelo próprio parser', async () => {
    const { parseDezenas } = await import('@shared/regras/index.ts')
    const regra = obterRegra('quina')
    const linha = promptParaIA(regra).split('\n').at(-1)!
    expect(regra.validarJogo(parseDezenas(linha)).length).toBeGreaterThanOrEqual(0)
    expect(parseDezenas(linha).every(Number.isInteger)).toBe(true)
  })
})

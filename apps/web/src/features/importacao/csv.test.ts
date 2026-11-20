import { describe, expect, it } from 'vitest'

import { paraCsv } from './csv'

describe('paraCsv', () => {
  it('usa ";" e vírgula decimal, com aspas só quando precisa', () => {
    expect(
      paraCsv(
        [
          { a: 'A1', b: 31.26, c: null },
          { a: 'diz "oi"; tchau', b: 3070, c: 'linha\nquebrada' },
        ],
        ['a', 'b', 'c'],
      ),
    ).toBe('a;b;c\r\nA1;31,26;\r\n"diz ""oi""; tchau";3070;"linha\nquebrada"\r\n')
  })

  it('arquivo sem linhas tem só o cabeçalho', () => {
    expect(paraCsv([], ['grupo', 'modalidade'])).toBe('grupo;modalidade\r\n')
  })
})

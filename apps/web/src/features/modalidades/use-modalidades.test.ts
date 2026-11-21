import { describe, expect, it } from 'vitest'

import { comRegras, type ModalidadeDados } from './use-modalidades'

const dados: ModalidadeDados[] = [
  {
    id: 1,
    slug: 'megasena',
    nome: 'Mega-Sena',
    cor: '#209869',
    precos: [{ vigenteDesde: '2025-07-09', centavos: 600 }],
  },
]

describe('modalidades no cache offline', () => {
  it('a regra volta com as funções depois do JSON do cache', () => {
    const [mega] = comRegras(JSON.parse(JSON.stringify(dados)) as ModalidadeDados[])
    expect(mega!.regra.validarJogo([1, 2, 3, 4, 5, 6])).toEqual([])
    expect(mega!.regra.custoJogo(7, 600)).toBe(4200)
  })

  it('conserta a cópia antiga, que gravou a regra sem funções', () => {
    const antiga = JSON.parse(
      JSON.stringify([{ ...dados[0], regra: { nome: 'Mega-Sena', minMarcadas: 6 } }]),
    ) as ModalidadeDados[]
    expect(typeof comRegras(antiga)[0]!.regra.validarJogo).toBe('function')
  })
})

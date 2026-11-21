import { describe, expect, it } from 'vitest'

import {
  analisarJogo,
  cobertura,
  contagemPorDezena,
  distribuicaoFaixas,
  faixasPadrao,
  molduraMiolo,
  paridade,
  parseJogos,
  primos,
  repetidas,
  sequencias,
  sobreposicao,
  soma,
  validarFaixas,
} from '../src/analisador.ts'
import { regras } from '../src/regras/index.ts'

const { lotofacil, megasena, quina, lotomania } = regras

// Três jogos de Lotofácil usados no aceite da F5.
const J1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const J2 = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
const J3 = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 2, 4]

describe('aceite F5: 3 jogos de Lotofácil', () => {
  const faixas = faixasPadrao(lotofacil)

  it('distribuição baixos (01–08) / médios (09–17) / altos (18–25)', () => {
    expect(faixas).toEqual([
      { nome: 'Baixos', de: 1, ate: 8 },
      { nome: 'Médios', de: 9, ate: 17 },
      { nome: 'Altos', de: 18, ate: 25 },
    ])
    expect(distribuicaoFaixas(J1, faixas)).toEqual([8, 7, 0])
    expect(distribuicaoFaixas(J2, faixas)).toEqual([0, 7, 8])
    expect(distribuicaoFaixas(J3, faixas)).toEqual([6, 5, 4])
  })

  it('matriz 3×3 de sobreposição', () => {
    const s = sobreposicao([J1, J2, J3], 8)
    expect(s.matriz).toEqual([
      [15, 5, 10],
      [5, 15, 8],
      [10, 8, 15],
    ])
    expect(s.media).toBeCloseTo((5 + 10 + 8) / 3)
    expect(s.acimaDoLimite).toEqual([{ i: 0, j: 2, comuns: 10 }])
  })
})

describe('faixas', () => {
  it('padrão genérico divide o universo em três', () => {
    expect(faixasPadrao(megasena).map((f) => [f.de, f.ate])).toEqual([
      [1, 20],
      [21, 40],
      [41, 60],
    ])
    expect(faixasPadrao(quina).map((f) => [f.de, f.ate])).toEqual([
      [1, 27],
      [28, 54],
      [55, 80],
    ])
    expect(faixasPadrao(lotomania).map((f) => [f.de, f.ate])).toEqual([
      [0, 33],
      [34, 67],
      [68, 99],
    ])
  })

  it('as faixas padrão são válidas', () => {
    for (const r of [lotofacil, megasena, quina, lotomania]) {
      expect(validarFaixas(faixasPadrao(r), r)).toEqual([])
    }
  })

  it('aponta buraco, sobreposição, sobra, nome vazio e intervalo invertido', () => {
    expect(
      validarFaixas(
        [
          { nome: 'A', de: 1, ate: 8 },
          { nome: 'B', de: 10, ate: 25 },
        ],
        lotofacil,
      ),
    ).toEqual(['B: faltam as dezenas de 9 a 9.'])
    expect(
      validarFaixas(
        [
          { nome: 'A', de: 1, ate: 10 },
          { nome: 'B', de: 8, ate: 25 },
        ],
        lotofacil,
      ),
    ).toEqual(['B: começa em 8, dentro da faixa anterior.'])
    expect(
      validarFaixas(
        [
          { nome: 'A', de: 1, ate: 10 },
          { nome: 'B', de: 11, ate: 20 },
        ],
        lotofacil,
      ),
    ).toEqual(['Faltam as dezenas de 21 a 25.'])
    expect(
      validarFaixas(
        [
          { nome: ' ', de: 1, ate: 10 },
          { nome: 'B', de: 11, ate: 26 },
        ],
        lotofacil,
      ),
    ).toEqual(['A faixa 1 precisa de um nome.', 'A última faixa passa de 25.'])
    expect(
      validarFaixas(
        [
          { nome: 'A', de: 10, ate: 1 },
          { nome: 'B', de: 11, ate: 25 },
        ],
        lotofacil,
      ),
    ).toContain('A: o início precisa ser menor ou igual ao fim.')
  })

  it('exige de 2 a 6 faixas', () => {
    expect(validarFaixas([{ nome: 'Tudo', de: 1, ate: 25 }], lotofacil)).toEqual([
      'Use pelo menos 2 faixas.',
    ])
    const sete = Array.from({ length: 7 }, (_, i) => ({ nome: `F${i}`, de: i + 1, ate: i + 1 }))
    expect(validarFaixas(sete, lotofacil)).toContain('Use no máximo 6 faixas.')
  })
})

describe('estatísticas de um jogo', () => {
  it('pares, ímpares, primos e soma', () => {
    expect(paridade(J1)).toEqual({ pares: 7, impares: 8 })
    expect(primos(J1)).toEqual([2, 3, 5, 7, 11, 13])
    expect(primos([0, 1, 97, 99])).toEqual([97])
    expect(soma(J1)).toBe(120)
  })

  it('moldura e miolo só na Lotofácil', () => {
    expect(molduraMiolo(J1, lotofacil)).toEqual({ moldura: 9, miolo: 6 })
    expect(molduraMiolo([1, 2, 3, 4, 5, 6], megasena)).toBeNull()
  })

  it('sequências consecutivas', () => {
    expect(sequencias([1, 2, 3, 7, 8, 12])).toEqual({ blocos: 2, maior: 3 })
    expect(sequencias([5, 1, 9])).toEqual({ blocos: 0, maior: 1 })
    expect(sequencias(J1)).toEqual({ blocos: 1, maior: 15 })
    expect(sequencias([])).toEqual({ blocos: 0, maior: 0 })
  })

  it('repetidas do último concurso', () => {
    expect(repetidas([3, 17, 22, 31, 40, 50], [3, 9, 22, 41, 50, 60])).toEqual([3, 22, 50])
  })

  it('analisarJogo junta tudo', () => {
    const r = analisarJogo(J1, lotofacil, faixasPadrao(lotofacil), J2)
    expect(r).toEqual({
      qtd: 15,
      faixas: [8, 7, 0],
      pares: 7,
      impares: 8,
      primos: 6,
      soma: 120,
      moldura: 9,
      miolo: 6,
      sequencias: { blocos: 1, maior: 15 },
      repetidas: 5,
    })
    const semUltimo = analisarJogo([1, 2, 3, 4, 5, 6], megasena, faixasPadrao(megasena))
    expect(semUltimo.repetidas).toBeNull()
    expect(semUltimo.moldura).toBeNull()
  })
})

describe('conjunto de jogos', () => {
  it('sobreposição com um jogo só não tem média', () => {
    expect(sobreposicao([J1], 5)).toEqual({ matriz: [[15]], media: null, acimaDoLimite: [] })
  })

  it('cobertura do universo', () => {
    const c = cobertura([J1, J2], lotofacil)
    expect(c.total).toBe(25)
    expect(c.usadas).toBe(25)
    expect(c.ausentes).toEqual([])
    expect(c.porDezena.find((d) => d.dezena === 12)?.qtd).toBe(2)
    const m = cobertura([[1, 2, 3, 4, 5, 6]], megasena)
    expect(m.usadas).toBe(6)
    expect(m.ausentes).toHaveLength(54)
  })

  it('frequência histórica conta cada dezena uma vez por concurso', () => {
    const f = contagemPorDezena(
      [
        [1, 2, 3, 4, 5],
        [1, 1, 6, 7, 8],
      ],
      quina,
    )
    expect(f).toHaveLength(80)
    expect(f[0]).toEqual({ dezena: 1, qtd: 2 })
    expect(f.find((d) => d.dezena === 9)?.qtd).toBe(0)
  })
})

describe('parseJogos', () => {
  it('lê um jogo por linha e aponta as linhas inválidas', () => {
    const texto = ['01 02 03 04 05 06', '', '7, 8, 9, 10, 11, 12', '1 2 3', '1 2 x 4 5 6'].join(
      '\n',
    )
    const r = parseJogos(texto, megasena)
    expect(r.jogos).toEqual([
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
    ])
    expect(r.erros.map((e) => e.linha)).toEqual([4, 5])
    expect(r.erros[1]!.mensagens).toEqual([
      'Use só números separados por espaço, vírgula ou hífen.',
    ])
  })
})

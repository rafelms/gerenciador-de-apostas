import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { apostaSchema } from '../src/schemas/aposta.ts'
import {
  comprovanteParaAposta,
  normalizarTextoComprovante,
  parseComprovante,
  validarComprovante,
} from '../src/parsers/comprovante-pdf.ts'

const FIXTURE = readFileSync(new URL('./fixtures/bolao-megasena-01.txt', import.meta.url), 'utf8')
const CODIGO = '0000AAAA1111BBBB2222CCCC3333DDDD4444'
const sha256 = (t: string) => createHash('sha256').update(t).digest('hex')

/** Apêndice A.4, campo a campo. */
const ESPERADO = {
  tipo: 'bolao',
  modalidadeSlug: 'megasena',
  concurso: 3070,
  dataSorteio: '2026-10-14',
  dataCompra: '2026-10-14',
  horaCompra: '12:53:11',
  dataApostaRecibo: '2026-10-11',
  canal: 'IOS',
  valorTotalCentavos: 1193,
  valorCotaCentavos: 884,
  tarifaCentavos: 309,
  bolaoNumeroCota: 35,
  bolaoTotalCotas: 38,
  bolaoCotasUsuario: 1,
  jogos: [
    [2, 9, 24, 28, 44, 48, 49],
    [2, 6, 28, 41, 44, 49, 53],
    [2, 15, 19, 28, 44, 49, 50],
    [12, 14, 36, 38, 44, 51, 56],
    [4, 6, 8, 18, 25, 30, 41],
    [3, 6, 11, 18, 30, 47, 56],
    [6, 13, 16, 25, 26, 28, 49],
    [2, 14, 22, 24, 35, 45, 48],
  ],
  codigoReciboHash: sha256(CODIGO),
  avisos: [],
  erros: [],
}

describe('parseComprovante (Apêndice A)', () => {
  it('a fixture gera exatamente a saída do A.4', async () => {
    expect(await parseComprovante(FIXTURE)).toEqual(ESPERADO)
  })

  it('nome, CPF, código do lotérico e código do recibo não aparecem na saída', async () => {
    const saida = JSON.stringify(await parseComprovante(FIXTURE))
    for (const proibido of [
      'FULANO',
      'SILVA',
      '000.000.000-00',
      '00.000000-0',
      CODIGO,
      'Terminal',
    ]) {
      expect(saida).not.toContain(proibido)
    }
    // A aposta montada para salvar também não.
    const aposta = JSON.stringify(comprovanteParaAposta(await parseComprovante(FIXTURE)))
    expect(aposta).not.toContain('FULANO')
    expect(aposta).not.toContain('000.000.000-00')
    expect(aposta).not.toContain(CODIGO)
  })

  it('texto todo em uma linha (espaços simples)', async () => {
    const umaLinha = FIXTURE.replace(/\s+/g, ' ')
    expect(await parseComprovante(umaLinha)).toEqual(ESPERADO)
  })

  it('valores com milhar, cota de 1 dígito e CRLF com espaço não separável', async () => {
    const texto = FIXTURE.replace('R$ 11,93', 'R$ 1.234,56')
      .replace('R$ 8,84', 'R$ 1.000,00')
      .replace('R$ 3,09', 'R$ 234,56')
      .replace('PARTICIPA COM 01 COTA', 'PARTICIPA COM 1 COTA')
      .replace('Cota: 35/38', 'Cota: 5 / 38')
      .replace(/\n/g, '\r\n')
    const r = await parseComprovante(texto)
    expect(r).toMatchObject({
      valorTotalCentavos: 123_456,
      valorCotaCentavos: 100_000,
      tarifaCentavos: 23_456,
      bolaoNumeroCota: 5,
      bolaoCotasUsuario: 1,
      erros: [],
    })
    expect(r.jogos).toHaveLength(8)
  })

  it('jogos em mais de uma página, com o cabeçalho repetido', async () => {
    const quebra =
      'Página: 1 de 2\nLoterias\nComprovante de Aposta Bolão Mega-Sena\nSeus Números:\n'
    const texto = FIXTURE.replace('Jogo 5\n', `${quebra}Jogo 5\n`).replace(
      'Página: 1 de 1',
      'Página: 2 de 2',
    )
    const r = await parseComprovante(texto)
    expect(r.jogos).toEqual(ESPERADO.jogos)
    expect(r.erros).toEqual([])
  })

  it('confere o valor da cota com o preço vigente', async () => {
    const preco = (slug: string, data: string) =>
      slug === 'megasena' && data === '2026-10-14' ? 600 : null
    expect((await parseComprovante(FIXTURE, { precoSimples: preco })).avisos).toEqual([])
    const caro = () => 700
    expect((await parseComprovante(FIXTURE, { precoSimples: caro })).avisos).toEqual([
      'O valor da cota não bate com o preço vigente da modalidade.',
    ])
  })

  it('avisos: tarifa acima de 35% e sorteio antes da compra', async () => {
    const texto = FIXTURE.replace('R$ 11,93', 'R$ 12,84')
      .replace('R$ 3,09', 'R$ 4,00')
      .replace('Data do sorteio: 14/10/2026', 'Data do sorteio: 13/10/2026')
    const r = await parseComprovante(texto)
    expect(r.avisos).toEqual([
      'A tarifa de serviço passa de 35% do valor da cota.',
      'A data do sorteio é anterior à data da compra.',
    ])
    expect(r.erros).toEqual([])
  })

  it('erros: total que não fecha, cotas acima do total, jogos de tamanhos diferentes', async () => {
    const texto = FIXTURE.replace('R$ 11,93', 'R$ 12,00')
      .replace('PARTICIPA COM 01 COTA DO TOTAL DE 38', 'PARTICIPA COM 40 COTAS DO TOTAL DE 38')
      .replace('Cota: 35/38', 'Cota: 39/38')
      .replace('02 | 14 | 22 | 24 | 35 | 45 | 48', '02 | 14 | 22 | 24 | 35 | 45')
    const r = await parseComprovante(texto)
    expect(r.erros).toEqual([
      'No bolão, todos os jogos têm a mesma quantidade de dezenas.',
      'O valor total (R$ 12,00) não é a soma da cota com a tarifa (R$ 477,20).',
      'O recibo tem mais cotas que o total do bolão.',
      'O número da cota passa do total de cotas.',
    ])
  })

  it('dezenas fora do universo viram erro do jogo', async () => {
    const r = await parseComprovante(FIXTURE.replace('| 48 | 49\nJogo 2', '| 48 | 61\nJogo 2'))
    expect(r.erros).toEqual([expect.stringMatching(/^Jogo 1: .*61/)])
  })

  it('texto que não é comprovante, aposta simples e modalidade não suportada', async () => {
    const nada = await parseComprovante('Fatura do cartão\nTotal: R$ 10,00')
    expect(nada.erros).toContain('Não parece um comprovante de aposta das Loterias CAIXA.')
    expect(nada.erros).toContain('Não encontrei a modalidade no comprovante.')
    expect(nada.erros).toContain('Não encontrei nenhum jogo no comprovante.')
    expect(nada.codigoReciboHash).toBeNull()

    const simples = await parseComprovante(
      FIXTURE.replace('Comprovante de Aposta Bolão Mega-Sena', 'Comprovante de Aposta Mega-Sena'),
    )
    expect(simples.tipo).toBe('simples')
    expect(simples.erros[0]).toMatch(/só o comprovante de bolão/)

    const dupla = await parseComprovante(
      FIXTURE.replace(/Mega-Sena/g, 'Dupla Sena').replace(/Concurso: 3070/, 'Concurso: 2800'),
    )
    expect(dupla.modalidadeSlug).toBe('duplasena')
    expect(dupla.erros).toContain('Modalidade não suportada: Dupla Sena.')
  })

  it('campos que faltam viram erros claros', async () => {
    const r = await parseComprovante(
      'Comprovante de Aposta Bolão Quina\nJogo 1\n01 | 02 | 03 | 04 | 05',
    )
    expect(r.erros).toEqual([
      'Não encontrei o número do concurso.',
      'Não encontrei o valor total da aposta.',
      'Não encontrei o valor da cota.',
      'Não encontrei a tarifa de serviço.',
      'Não encontrei a data da compra.',
      'Não encontrei o total de cotas do bolão.',
      'Não encontrei quantas cotas este recibo tem.',
    ])
  })

  it('normaliza rótulos quebrados em duas linhas', () => {
    expect(
      normalizarTextoComprovante(
        'Valor total da\n  aposta:  R$ 1,00\nValor tarifa de\nservico: R$ 0,10',
      ),
    ).toBe('Valor total da aposta: R$ 1,00\nValor tarifa de servico: R$ 0,10')
  })
})

describe('validarComprovante', () => {
  it('revalida depois de uma correção na revisão', async () => {
    const r = await parseComprovante(FIXTURE.replace('R$ 11,93', 'R$ 12,00'))
    expect(r.erros).toHaveLength(1)
    const { avisos: _avisos, erros: _erros, ...dados } = r
    expect(validarComprovante({ ...dados, valorTotalCentavos: 1193 })).toEqual({
      avisos: [],
      erros: [],
    })
    expect(validarComprovante({ ...dados, modalidadeSlug: '' }).erros[0]).toBe(
      'Não encontrei a modalidade no comprovante.',
    )
  })
})

describe('comprovanteParaAposta', () => {
  it('monta uma aposta válida: data da compra, total do recibo e registro na observação', async () => {
    const aposta = comprovanteParaAposta(await parseComprovante(FIXTURE))
    expect(aposta).toEqual({
      modalidadeSlug: 'megasena',
      tipo: 'bolao',
      concursoInicial: 3070,
      qtdConcursos: 1,
      dataAposta: '2026-10-14',
      jogos: ESPERADO.jogos,
      bolao: {
        totalCotas: 38,
        cotasUsuario: 1,
        numeroCota: 35,
        valorCotaCentavos: 884,
        tarifaCentavos: 309,
      },
      valorPagoCentavos: 1193,
      participantes: [],
      localCompra: 'App Loterias CAIXA (IOS)',
      observacao: 'Bolão registrado pela lotérica em 11/10/2026.',
    })
    expect(apostaSchema.safeParse(aposta).success).toBe(true)
  })

  it('sem dados do recibo usa valores vazios que o schema recusa', async () => {
    const aposta = comprovanteParaAposta(await parseComprovante('nada'))
    expect(aposta.localCompra).toBeNull()
    expect(aposta.observacao).toBeNull()
    expect(apostaSchema.safeParse(aposta).success).toBe(false)
  })
})

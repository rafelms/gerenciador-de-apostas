import { describe, expect, it } from 'vitest'

import { isoParaBr, lerData, lerInteiro, normalizarCabecalho, texto } from '../src/parsers/comum.ts'
import {
  apostasParaLinhas,
  assinaturaAposta,
  COLUNAS_PLANILHA,
  LIMITE_LINHAS_PLANILHA,
  lerParticipantes,
  lerPlanilha,
  resumoPorModalidadeMes,
  textoErroPlanilha,
  type ApostaParaExportar,
  type LinhaPlanilha,
} from '../src/parsers/planilha.ts'

const simples = (grupo: string, dezenas: string, extra: LinhaPlanilha = {}): LinhaPlanilha => ({
  grupo,
  modalidade: 'Mega-Sena',
  tipo: 'simples',
  concurso: 3070,
  data_aposta: '11/10/2026',
  dezenas,
  valor_pago: 6,
  ...extra,
})

describe('comum', () => {
  it('normaliza cabeçalhos', () => {
    expect(normalizarCabecalho(' Data Aposta ')).toBe('data_aposta')
    expect(normalizarCabecalho('QTD-CONCURSOS')).toBe('qtd_concursos')
    expect(normalizarCabecalho('Observação')).toBe('observacao')
  })

  it('lê inteiros', () => {
    expect(lerInteiro(3070)).toBe(3070)
    expect(lerInteiro('3.070')).toBe(3070)
    expect(lerInteiro(' 12 ')).toBe(12)
    expect(lerInteiro(1.5)).toBeNull()
    expect(lerInteiro(-1)).toBeNull()
    expect(lerInteiro('12a')).toBeNull()
    expect(lerInteiro(null)).toBeNull()
  })

  it('lê datas em vários formatos', () => {
    expect(lerData('11/10/2026')).toBe('2026-10-11')
    expect(lerData('1/2/2026')).toBe('2026-02-01')
    expect(lerData('2026-10-11')).toBe('2026-10-11')
    expect(lerData(46306)).toBe('2026-10-11') // série do Excel
    expect(lerData(46306.75)).toBe('2026-10-11') // hora é ignorada
    expect(lerData(new Date(2026, 9, 11))).toBe('2026-10-11')
    expect(lerData(new Date('x'))).toBeNull()
    expect(lerData('31/02/2026')).toBeNull()
    expect(lerData('2026/10/11')).toBeNull()
    expect(lerData(10)).toBeNull()
    expect(lerData(Number.NaN)).toBeNull()
    expect(lerData(undefined)).toBeNull()
  })

  it('converte ISO para dd/mm/aaaa e lê texto de células', () => {
    expect(isoParaBr('2026-10-11')).toBe('11/10/2026')
    expect(texto(null)).toBe('')
    expect(texto('  a ')).toBe('a')
    expect(texto(12)).toBe('12')
  })
})

describe('lerParticipantes', () => {
  it('marca você por "Eu" ou por asterisco e aceita peso com vírgula', () => {
    expect(lerParticipantes('Eu:1; João:1,5; Ana')).toEqual([
      { nome: 'Eu', peso: 1, ehUsuario: true },
      { nome: 'João', peso: 1.5, ehUsuario: false },
      { nome: 'Ana', peso: 1, ehUsuario: false },
    ])
    expect(lerParticipantes('Rafael*:2;Bia:1')).toEqual([
      { nome: 'Rafael', peso: 2, ehUsuario: true },
      { nome: 'Bia', peso: 1, ehUsuario: false },
    ])
  })

  it('lê a contribuição opcional em reais', () => {
    expect(lerParticipantes('Eu:1:6,00; Ana:2:12')).toEqual([
      { nome: 'Eu', peso: 1, ehUsuario: true, contribuicaoCentavos: 600 },
      { nome: 'Ana', peso: 2, ehUsuario: false, contribuicaoCentavos: 1200 },
    ])
    expect(lerParticipantes('Eu:1:abc')).toBe('contribuição inválida para Eu ("abc")')
  })

  it('vazio é sem divisão; nome ou peso ruim é erro', () => {
    expect(lerParticipantes(null)).toEqual([])
    expect(lerParticipantes(':1')).toMatch(/sem nome/)
    expect(lerParticipantes('Eu:0')).toMatch(/peso inválido/)
    expect(lerParticipantes('Eu:abc')).toMatch(/peso inválido/)
  })
})

describe('lerPlanilha', () => {
  it('aceite F3: 50 linhas com 1 inválida → 49 apostas e 1 erro na linha certa', () => {
    const linhas = Array.from({ length: 50 }, (_, i) =>
      i === 20
        ? simples(`G${i}`, '01 02 03 04 05')
        : simples(`G${i}`, '01 02 03 04 05 06', { concurso: 3000 + i }),
    )
    const r = lerPlanilha(linhas)
    expect(r.totalLinhas).toBe(50)
    expect(r.apostas).toHaveLength(49)
    expect(r.erros).toEqual([
      { linha: 22, grupo: 'G20', mensagem: 'Mega-Sena aceita de 6 a 20 dezenas; encontradas 5' },
    ])
    expect(textoErroPlanilha(r.erros[0]!)).toBe(
      'Linha 22: Mega-Sena aceita de 6 a 20 dezenas; encontradas 5',
    )
    expect(r.apostas[0]).toEqual({
      grupo: 'G0',
      linhas: [2],
      aposta: {
        modalidadeSlug: 'megasena',
        tipo: 'simples',
        concursoInicial: 3000,
        qtdConcursos: 1,
        dataAposta: '2026-10-11',
        jogos: [[1, 2, 3, 4, 5, 6]],
        bolao: null,
        valorPagoCentavos: 600,
        participantes: [],
        localCompra: null,
        observacao: null,
      },
    })
  })

  it('junta as linhas do mesmo grupo num bolão com vários jogos', () => {
    const r = lerPlanilha([
      {
        Grupo: 'B1',
        Modalidade: 'Lotofácil',
        Tipo: 'Bolão',
        Concurso: '3.500',
        'Data Aposta': 46306,
        Dezenas: '01 02 03 04 05 06 07 08 09 10 11 12 13 14 15',
        'Total Cotas': 10,
        'Cotas Usuario': 2,
        'Valor Cota': '4,50',
        Tarifa: '1,13',
        'Valor Pago': '11,26',
        Participantes: 'Eu:2; Ana:1',
        Observação: 'Lotérica do centro',
        'Numero Cota': 3,
        'Local Compra': 'Centro',
      },
      { Grupo: 'B1', Dezenas: '11 12 13 14 15 16 17 18 19 20 21 22 23 24 25' },
      { Grupo: '', Dezenas: '' }, // linha vazia: ignorada
      {
        Grupo: 'B1',
        Modalidade: 'lotofacil',
        Dezenas: '02 04 06 08 10 12 14 16 18 20 22 24 01 03 05',
      },
    ])
    expect(r.erros).toEqual([])
    expect(r.totalLinhas).toBe(3)
    expect(r.apostas).toHaveLength(1)
    const [a] = r.apostas
    expect(a!.linhas).toEqual([2, 3, 5])
    expect(a!.aposta).toMatchObject({
      modalidadeSlug: 'lotofacil',
      tipo: 'bolao',
      concursoInicial: 3500,
      dataAposta: '2026-10-11',
      bolao: {
        totalCotas: 10,
        cotasUsuario: 2,
        numeroCota: 3,
        valorCotaCentavos: 450,
        tarifaCentavos: 113,
      },
      valorPagoCentavos: 1126,
      participantes: [
        { nome: 'Eu', peso: 2, ehUsuario: true },
        { nome: 'Ana', peso: 1, ehUsuario: false },
      ],
      localCompra: 'Centro',
      observacao: 'Lotérica do centro',
    })
    expect(a!.aposta.jogos).toHaveLength(3)
  })

  it('usa __rowNum__ do leitor de planilha para numerar as linhas', () => {
    const linha = simples('A', '01 02 03 04 05')
    Object.defineProperty(linha, '__rowNum__', { value: 9, enumerable: false })
    const r = lerPlanilha([linha])
    expect(r.erros[0]!.linha).toBe(10)
  })

  it('aponta o erro na linha do jogo, não na primeira do grupo', () => {
    const r = lerPlanilha([
      simples('A', '01 02 03 04 05 06'),
      { grupo: 'A', dezenas: '01 02 03 04 05 61' },
    ])
    expect(r.apostas).toEqual([])
    expect(r.erros).toHaveLength(1)
    expect(r.erros[0]!.linha).toBe(3)
    expect(r.erros[0]!.mensagem).not.toMatch(/^Jogo/)
  })

  it('acusa campos diferentes dentro do grupo', () => {
    const r = lerPlanilha([
      simples('A', '01 02 03 04 05 06'),
      simples('A', '07 08 09 10 11 12', { concurso: 3071, valor_pago: null }),
    ])
    expect(r.apostas).toEqual([])
    expect(r.erros).toEqual([
      { linha: 3, grupo: 'A', mensagem: 'o grupo A tem concurso diferente da linha 2' },
    ])
  })

  it('valida cada campo com mensagem clara', () => {
    const r = lerPlanilha([
      simples('A', '01 02 03 04 05 06', { modalidade: '' }),
      simples('B', '01 02 03 04 05 06', { modalidade: 'Dupla Sena' }),
      simples('C', '01 02 03 04 05 06', { tipo: 'constructor' }),
      simples('D', '01 02 03 04 05 06', { concurso: 'abc' }),
      simples('E', '01 02 03 04 05 06', { qtd_concursos: 'x' }),
      simples('F', '01 02 03 04 05 06', { data_aposta: '2026/10/11' }),
      simples('G', '01 02 03 04 05 06', { valor_pago: null }),
      simples('H', '01 02 03 04 05 06', { valor_pago: 'R$ abc' }),
      simples('I', ''),
      simples('J', '01 02 xx'),
      simples('K', '01 02 03 04 05 06', { participantes: 'Eu:0' }),
      simples('L', '01 02 03 04 05 06', { valor_pago: -5 }),
      { modalidade: 'Mega-Sena', dezenas: '01 02 03 04 05 06' },
    ])
    expect(r.apostas).toEqual([])
    expect(r.erros.map((e) => [e.linha, e.mensagem])).toEqual([
      [2, 'informe a modalidade'],
      [3, 'modalidade não reconhecida: "Dupla Sena"'],
      [4, 'tipo inválido: "constructor" (use simples, bolao ou teimosinha)'],
      [5, 'concurso inválido: "abc"'],
      [6, 'quantidade de concursos inválida: "x"'],
      [7, 'data da aposta inválida: "2026/10/11" (use dd/mm/aaaa)'],
      [8, 'informe o valor pago na primeira linha do grupo'],
      [9, 'valor pago inválido: "R$ abc"'],
      [10, 'informe as dezenas do jogo'],
      [11, 'dezenas inválidas: "01 02 xx"'],
      [12, 'peso inválido para Eu ("0")'],
      [13, 'valor pago inválido: "-5"'],
      [14, 'informe o grupo (linhas do mesmo grupo formam uma aposta)'],
    ])
  })

  it('valida os dados do bolão', () => {
    const bolao = { tipo: 'bolao', total_cotas: 10, cotas_usuario: 1, valor_cota: 5 }
    const r = lerPlanilha([
      simples('A', '01 02 03 04 05 06', { tipo: 'bolao' }),
      simples('B', '01 02 03 04 05 06', { ...bolao, tarifa: 'x', numero_cota: 'y' }),
      simples('C', '01 02 03 04 05 06', { ...bolao, cotas_usuario: 11 }),
    ])
    expect(r.apostas).toEqual([])
    expect(r.erros.map((e) => [e.linha, e.mensagem])).toEqual([
      [2, 'bolão: informe o total de cotas'],
      [2, 'bolão: informe as suas cotas'],
      [2, 'bolão: informe o valor da cota'],
      [3, 'tarifa inválida: "x"'],
      [3, 'número da cota inválido: "y"'],
      [4, 'Suas cotas não podem passar do total.'],
    ])
  })

  it('teimosinha usa qtd_concursos; sem coluna vale 1', () => {
    const r = lerPlanilha([
      simples('A', '01 02 03 04 05', { modalidade: 'Quina', tipo: 'teimosinha', qtd_concursos: 3 }),
      simples('B', '01 02 03 04 05', { modalidade: 'Quina', tipo: 'teimosinha' }),
    ])
    expect(r.apostas.map((a) => a.aposta.qtdConcursos)).toEqual([3])
    expect(r.erros).toEqual([
      { linha: 3, grupo: 'B', mensagem: 'A teimosinha precisa de 2 a 24 concursos.' },
    ])
  })

  it('recusa planilha vazia, sem colunas obrigatórias ou grande demais', () => {
    expect(lerPlanilha([]).erros[0]!.mensagem).toMatch(/nenhuma aposta/)
    expect(lerPlanilha([{ grupo: ' ' }]).erros[0]!.mensagem).toMatch(/nenhuma aposta/)
    const semColunas = lerPlanilha([{ grupo: 'A', dezenas: '01' }])
    expect(semColunas.erros[0]!.mensagem).toBe(
      'Faltam colunas obrigatórias: modalidade, tipo, concurso, data_aposta, valor_pago. Use o modelo.',
    )
    expect(textoErroPlanilha(semColunas.erros[0]!)).toMatch(/^Faltam/)
    const grande = Array.from({ length: LIMITE_LINHAS_PLANILHA + 1 }, () => simples('A', '01'))
    expect(lerPlanilha(grande).erros[0]!.mensagem).toMatch(/2\.001 linhas|2001 linhas/)
  })
})

describe('exportação', () => {
  const apostas: ApostaParaExportar[] = [
    {
      modalidadeSlug: 'megasena',
      modalidadeNome: 'Mega-Sena',
      tipo: 'bolao',
      concursoInicial: 3070,
      qtdConcursos: 1,
      dataAposta: '2026-10-11',
      jogos: [
        [24, 2, 9, 30, 41, 55, 60],
        [1, 2, 3, 4, 5, 6, 7],
      ],
      bolao: {
        totalCotas: 8,
        cotasUsuario: 2,
        numeroCota: 5,
        valorCotaCentavos: 1250,
        tarifaCentavos: 313,
      },
      valorPagoCentavos: 3126,
      participantes: [
        { nome: 'Rafael', peso: 1.5, ehUsuario: true },
        { nome: 'Ana', peso: 1, ehUsuario: false },
      ],
      localCompra: 'Centro',
      observacao: 'grupo do trabalho',
    },
    {
      modalidadeSlug: 'lotomania',
      modalidadeNome: 'Lotomania',
      tipo: 'teimosinha',
      concursoInicial: 2800,
      qtdConcursos: 3,
      dataAposta: '2026-11-02',
      jogos: [Array.from({ length: 50 }, (_, i) => i * 2)],
      bolao: null,
      valorPagoCentavos: 900,
      participantes: [{ nome: 'Eu', peso: 1, ehUsuario: true, contribuicaoCentavos: 900 }],
      localCompra: null,
      observacao: null,
    },
  ]

  it('gera uma linha por jogo no formato do modelo', () => {
    const linhas = apostasParaLinhas(apostas)
    expect(linhas).toHaveLength(3)
    expect(Object.keys(linhas[0]!)).toEqual([...COLUNAS_PLANILHA])
    expect(linhas[0]).toMatchObject({
      grupo: 'A1',
      modalidade: 'Mega-Sena',
      data_aposta: '11/10/2026',
      dezenas: '02 09 24 30 41 55 60',
      valor_cota: 12.5,
      tarifa: 3.13,
      valor_pago: 31.26,
      participantes: 'Rafael*:1,5; Ana:1',
      numero_cota: 5,
    })
    expect(linhas[1]).toMatchObject({ grupo: 'A1', valor_pago: null, participantes: null })
    expect(linhas[2]!.dezenas).toMatch(/^00 02 04/)
    expect(linhas[2]!.participantes).toBe('Eu:1:9,00')
  })

  it('o arquivo exportado é reimportável com os mesmos dados', () => {
    const r = lerPlanilha(apostasParaLinhas(apostas))
    expect(r.erros).toEqual([])
    expect(r.apostas.map((a) => a.aposta)).toEqual(
      apostas.map(({ modalidadeNome: _, jogos, ...a }) => ({
        ...a,
        jogos: jogos.map((j) => [...j].sort((x, y) => x - y)),
      })),
    )
  })

  it('assinatura ignora a ordem das dezenas e dos jogos', () => {
    const a = assinaturaAposta({
      modalidadeSlug: 'quina',
      concursoInicial: 1,
      jogos: [
        [5, 1],
        [3, 2],
      ],
    })
    const b = assinaturaAposta({
      modalidadeSlug: 'quina',
      concursoInicial: 1,
      jogos: [
        [2, 3],
        [1, 5],
      ],
    })
    expect(a).toBe(b)
    expect(a).toBe('quina|1|1-5/2-3')
  })

  it('resume por mês e modalidade', () => {
    expect(
      resumoPorModalidadeMes([
        {
          modalidadeNome: 'Quina',
          dataAposta: '2026-10-01',
          gastoCentavos: 300,
          recuperadoCentavos: 0,
        },
        {
          modalidadeNome: 'Mega-Sena',
          dataAposta: '2026-10-20',
          gastoCentavos: 600,
          recuperadoCentavos: 0,
        },
        {
          modalidadeNome: 'Quina',
          dataAposta: '2026-10-15',
          gastoCentavos: 300,
          recuperadoCentavos: 1000,
        },
        {
          modalidadeNome: 'Quina',
          dataAposta: '2026-11-01',
          gastoCentavos: 300,
          recuperadoCentavos: 0,
        },
      ]),
    ).toEqual([
      { mes: '2026-11', modalidade: 'Quina', apostas: 1, gasto: 300, recuperado: 0, saldo: -300 },
      {
        mes: '2026-10',
        modalidade: 'Mega-Sena',
        apostas: 1,
        gasto: 600,
        recuperado: 0,
        saldo: -600,
      },
      { mes: '2026-10', modalidade: 'Quina', apostas: 2, gasto: 600, recuperado: 1000, saldo: 400 },
    ])
  })
})

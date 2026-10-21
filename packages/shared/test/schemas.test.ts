import { describe, expect, it } from 'vitest'

import {
  aceitarConviteSchema,
  codigoTotpSchema,
  definirSenhaSchema,
  loginSchema,
  senhaSchema,
} from '../src/schemas/auth.ts'
import { apostaParaRpc, apostaSchema, type ApostaInput } from '../src/schemas/aposta.ts'

const base: ApostaInput = {
  modalidadeSlug: 'megasena',
  tipo: 'simples',
  concursoInicial: 3070,
  qtdConcursos: 1,
  dataAposta: '2026-10-14',
  jogos: [[2, 9, 24, 28, 44, 48]],
  bolao: null,
  valorPagoCentavos: 600,
  participantes: [],
  localCompra: null,
  observacao: null,
}

function mensagens(entrada: unknown) {
  const r = apostaSchema.safeParse(entrada)
  return r.success ? [] : r.error.issues.map((i) => i.message)
}

describe('apostaSchema', () => {
  it('aceita aposta simples válida', () => {
    expect(mensagens(base)).toEqual([])
  })

  it('aceita o bolão do Apêndice A', () => {
    const bolao = {
      ...base,
      tipo: 'bolao',
      jogos: [
        [2, 9, 24, 28, 44, 48, 49],
        [2, 6, 28, 41, 44, 49, 53],
      ],
      bolao: {
        totalCotas: 38,
        cotasUsuario: 1,
        numeroCota: 35,
        valorCotaCentavos: 884,
        tarifaCentavos: 309,
      },
      valorPagoCentavos: 1193,
    }
    expect(mensagens(bolao)).toEqual([])
  })

  it('valida dezenas de cada jogo com o número do jogo', () => {
    expect(mensagens({ ...base, jogos: [[1, 2, 3, 4, 5]] })).toContain(
      'Jogo 1: Mega-Sena aceita de 6 a 20 dezenas; encontradas 5',
    )
  })

  it('valida as dezenas mesmo com outro campo inválido (o formulário mostra o erro do jogo)', () => {
    expect(
      mensagens({ ...base, jogos: [[1, 2, 3, 4, 5]], valorPagoCentavos: Number.NaN }),
    ).toContain('Jogo 1: Mega-Sena aceita de 6 a 20 dezenas; encontradas 5')
    // Sem modalidade válida não há regra para validar as dezenas.
    expect(mensagens({ ...base, modalidadeSlug: 'x', jogos: [[1]] })).toHaveLength(1)
  })

  it('teimosinha precisa de 2+ concursos e só ela pode ter mais de 1', () => {
    expect(mensagens({ ...base, tipo: 'teimosinha', qtdConcursos: 1 })).toContain(
      'A teimosinha precisa de 2 a 24 concursos.',
    )
    expect(mensagens({ ...base, qtdConcursos: 3 })).toContain(
      'Só a teimosinha vale para mais de um concurso.',
    )
    expect(mensagens({ ...base, tipo: 'teimosinha', qtdConcursos: 3 })).toEqual([])
  })

  it('bolão exige dados, cotas coerentes, tarifa ≤ 35% e jogos do mesmo tamanho', () => {
    expect(mensagens({ ...base, tipo: 'bolao' })).toContain('Informe os dados do bolão.')
    const r = mensagens({
      ...base,
      tipo: 'bolao',
      jogos: [
        [1, 2, 3, 4, 5, 6],
        [1, 2, 3, 4, 5, 6, 7],
      ],
      bolao: {
        totalCotas: 5,
        cotasUsuario: 6,
        numeroCota: 9,
        valorCotaCentavos: 1000,
        tarifaCentavos: 400,
      },
    })
    expect(r).toEqual(
      expect.arrayContaining([
        'Suas cotas não podem passar do total.',
        'O número da cota não pode passar do total.',
        'A tarifa passa de 35% do valor da cota.',
        'No bolão, todos os jogos têm a mesma quantidade de dezenas.',
      ]),
    )
  })

  it('dados de bolão em aposta simples são recusados', () => {
    const r = mensagens({
      ...base,
      bolao: { totalCotas: 5, cotasUsuario: 1, valorCotaCentavos: 1000, tarifaCentavos: 0 },
    })
    expect(r).toContain('Dados de bolão só valem para o tipo bolão.')
  })

  it('participantes: exatamente um "eu" e contribuições somando o valor pago', () => {
    const eu = { nome: 'Eu', peso: 1, ehUsuario: true }
    const joao = { nome: 'João', peso: 1, ehUsuario: false }
    expect(mensagens({ ...base, participantes: [eu, joao] })).toEqual([])
    expect(mensagens({ ...base, participantes: [joao] })).toContain(
      'A divisão precisa incluir você exatamente uma vez.',
    )
    expect(
      mensagens({
        ...base,
        participantes: [
          { ...eu, contribuicaoCentavos: 300 },
          { ...joao, contribuicaoCentavos: 200 },
        ],
      }),
    ).toContain('A soma das contribuições precisa ser igual ao valor pago.')
    expect(
      mensagens({ ...base, participantes: [{ ...eu, contribuicaoCentavos: 300 }, joao] }),
    ).toContain('Informe a contribuição de todos ou de ninguém.')
    expect(
      mensagens({
        ...base,
        participantes: [
          { ...eu, contribuicaoCentavos: 400 },
          { ...joao, contribuicaoCentavos: 200 },
        ],
      }),
    ).toEqual([])
  })
})

describe('apostaParaRpc', () => {
  it('converte para as colunas do banco, ordena dezenas e mantém o bolão', () => {
    const rpc = apostaParaRpc(
      {
        ...base,
        tipo: 'bolao',
        jogos: [[49, 2, 9, 24, 28, 44, 48]],
        bolao: {
          totalCotas: 38,
          cotasUsuario: 1,
          numeroCota: 35,
          valorCotaCentavos: 884,
          tarifaCentavos: 309,
        },
        valorPagoCentavos: 1193,
        participantes: [{ nome: 'Eu', peso: 1, ehUsuario: true }],
      },
      { origem: 'pdf', comprovanteHash: 'abc' },
    )
    expect(rpc).toMatchObject({
      modalidade_slug: 'megasena',
      tipo: 'bolao',
      origem: 'pdf',
      bolao_total_cotas: 38,
      bolao_numero_cota: 35,
      valor_cota_centavos: 884,
      tarifa_centavos: 309,
      valor_pago_centavos: 1193,
      comprovante_hash: 'abc',
      jogos: [[2, 9, 24, 28, 44, 48, 49]],
      participantes: [{ nome: 'Eu', peso: 1, eh_usuario: true, contribuicao_centavos: null }],
    })
  })

  it('aposta simples sem bolão', () => {
    const rpc = apostaParaRpc(base)
    expect(rpc.origem).toBe('manual')
    expect(rpc.bolao_total_cotas).toBeNull()
    expect(rpc.tarifa_centavos).toBe(0)
    expect(rpc.comprovante_hash).toBeNull()
  })
})

describe('schemas de autenticação', () => {
  it('senha: 10+ caracteres com letras e números', () => {
    expect(senhaSchema.safeParse('Senha12345').success).toBe(true)
    expect(senhaSchema.safeParse('curta1').success).toBe(false)
    expect(senhaSchema.safeParse('semnumerosaqui').success).toBe(false)
    expect(senhaSchema.safeParse('1234567890').success).toBe(false)
  })

  it('login normaliza o e-mail', () => {
    const r = loginSchema.parse({ email: '  Fulano@Teste.Local ', senha: 'x' })
    expect(r.email).toBe('fulano@teste.local')
  })

  it('confirmação de senha precisa conferir', () => {
    expect(
      definirSenhaSchema.safeParse({ senha: 'Senha12345', confirmacao: 'Senha12346' }).success,
    ).toBe(false)
    expect(
      aceitarConviteSchema.safeParse({
        nome: 'Ana',
        senha: 'Senha12345',
        confirmacao: 'Senha12345',
      }).success,
    ).toBe(true)
  })

  it('código TOTP tem 6 dígitos', () => {
    expect(codigoTotpSchema.safeParse({ codigo: '123456' }).success).toBe(true)
    expect(codigoTotpSchema.safeParse({ codigo: '12345a' }).success).toBe(false)
  })
})

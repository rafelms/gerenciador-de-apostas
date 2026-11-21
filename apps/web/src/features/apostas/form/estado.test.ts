import { describe, expect, it } from 'vitest'

import type { ApostaCompleta } from '../api'
import {
  apostaParaForm,
  criarResolver,
  montarApostaInput,
  valoresIniciais,
  type FormAposta,
} from './estado'

function form(extra: Partial<FormAposta>): FormAposta {
  return {
    ...valoresIniciais(),
    valorPago: '10,00',
    valorPagoManual: true,
    dividir: true,
    participantes: [
      { nome: 'Eu', peso: '1', ehUsuario: true },
      { nome: '', peso: '1', ehUsuario: false },
    ],
    ...extra,
  }
}

const participantesDe = (f: FormAposta) =>
  (montarApostaInput(f, undefined) as { participantes: unknown[] }).participantes

describe('divisão "só a quantidade" no formulário', () => {
  it('gera "Eu" + "Pessoa 2…N" com peso 1 e a parte de cada um pelo maior resto', () => {
    expect(participantesDe(form({ modoDivisao: 'quantidade', qtdPessoas: '3' }))).toEqual([
      { nome: 'Eu', peso: 1, ehUsuario: true, contribuicaoCentavos: 334 },
      { nome: 'Pessoa 2', peso: 1, ehUsuario: false, contribuicaoCentavos: 333 },
      { nome: 'Pessoa 3', peso: 1, ehUsuario: false, contribuicaoCentavos: 333 },
    ])
  })

  it('ignora os nomes digitados no outro modo', () => {
    const f = form({
      modoDivisao: 'quantidade',
      qtdPessoas: '2',
      participantes: [
        { nome: 'Eu', peso: '1', ehUsuario: true },
        { nome: 'Ana', peso: '3', ehUsuario: false },
        { nome: 'Bia', peso: '1', ehUsuario: false },
      ],
    })
    expect(participantesDe(f)).toHaveLength(2)
  })

  it('sem marcar "dividir" não há participantes', () => {
    expect(participantesDe(form({ dividir: false, modoDivisao: 'quantidade' }))).toEqual([])
  })

  it.each(['1', '31', '', '2,5'])('quantidade inválida (%s) vira erro do campo', async (qtd) => {
    const resolver = criarResolver(() => undefined)
    const r = await resolver(form({ modoDivisao: 'quantidade', qtdPessoas: qtd }), undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    })
    expect(r.errors.qtdPessoas?.message).toBe('Informe de 2 a 30 pessoas (você incluído).')
  })

  it('na edição, reabre no modo "quantidade" quando a divisão foi gerada assim', () => {
    const aposta = {
      modalidades: { slug: 'megasena' },
      tipo: 'simples',
      concurso_inicial: 3070,
      qtd_concursos: 1,
      aposta_jogos: [],
      bolao_total_cotas: null,
      bolao_cotas_usuario: null,
      bolao_numero_cota: null,
      valor_cota_centavos: null,
      tarifa_centavos: 0,
      valor_pago_centavos: 1000,
      data_aposta: '2026-11-21',
      local_compra: null,
      observacao: null,
      participantes: [
        { nome: 'Eu', peso: 1, eh_usuario: true, contribuicao_centavos: 334 },
        { nome: 'Pessoa 2', peso: 1, eh_usuario: false, contribuicao_centavos: 333 },
        { nome: 'Pessoa 3', peso: 1, eh_usuario: false, contribuicao_centavos: 333 },
      ],
    } as unknown as ApostaCompleta
    const f = apostaParaForm(aposta)
    expect(f.modoDivisao).toBe('quantidade')
    expect(f.qtdPessoas).toBe('3')

    const comNomes = apostaParaForm({
      ...aposta,
      participantes: [
        { nome: 'Eu', peso: 1, eh_usuario: true, contribuicao_centavos: null },
        { nome: 'Ana', peso: 1, eh_usuario: false, contribuicao_centavos: null },
      ],
    } as unknown as ApostaCompleta)
    expect(comNomes.modoDivisao).toBe('pessoas')
  })
})

import type { FaixaRateio } from '@shared/conferencia.ts'
import { formatarBRL, tentarDeReais } from '@shared/dinheiro.ts'
import type { RegraModalidade } from '@shared/regras/tipos.ts'

export interface LinhaRateio {
  ganhadores: string
  valor: string
}

/** Rateio digitado, por número de acertos da faixa. */
export type RateioDoFormulario = Record<number, LinhaRateio>

/** Rateio gravado → campos de texto do formulário (para corrigir um resultado). */
export function rateioParaFormulario(rateio: FaixaRateio[]): RateioDoFormulario {
  return Object.fromEntries(
    rateio.map((f) => [
      f.acertos,
      {
        ganhadores: String(f.ganhadores),
        valor: formatarBRL(f.valorCentavos).replace('R$ ', ''),
      },
    ]),
  )
}

/** Campos de texto → faixas para o schema (linhas vazias ficam de fora; valor inválido vira NaN). */
export function rateioDoFormulario(regra: RegraModalidade, rateio: RateioDoFormulario) {
  return regra.faixas.flatMap((f) => {
    const l = rateio[f.acertos]
    if (!l || (!l.valor.trim() && !l.ganhadores.trim())) return []
    return [
      {
        acertos: f.acertos,
        ganhadores: Number(l.ganhadores || 0),
        valorCentavos: tentarDeReais(l.valor) ?? Number.NaN,
      },
    ]
  })
}

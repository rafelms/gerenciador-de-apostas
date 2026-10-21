import { multiplicarFracao, type Centavos } from './dinheiro.ts'
import type { RegraModalidade, ResultadoConferencia } from './regras/tipos.ts'

/** Uma faixa do rateio oficial de um concurso (concursos.rateio no banco). */
export interface FaixaRateio {
  acertos: number
  ganhadores: number
  /** Valor pago por aposta simples premiada na faixa. */
  valorCentavos: Centavos
}

/** Seção 9.3: confere um jogo contra as dezenas sorteadas. */
export function conferirJogo(
  regra: RegraModalidade,
  dezenasJogo: number[],
  dezenasSorteadas: number[],
): ResultadoConferencia {
  return regra.conferir(dezenasJogo, { dezenas: dezenasSorteadas })
}

export interface ConferenciaAposta {
  jogos: ResultadoConferencia[]
  /** Maior nº de acertos entre os jogos (0 se nenhum acerto). */
  melhorAcerto: number
  /** Soma, por faixa, das combinações premiadas de todos os jogos. */
  premiosPorFaixa: Record<number, number>
  /** Pelo menos uma combinação premiada em alguma faixa. */
  premiada: boolean
}

/** Confere todos os jogos de uma aposta num concurso. */
export function conferirJogos(
  regra: RegraModalidade,
  jogos: number[][],
  dezenasSorteadas: number[],
): ConferenciaAposta {
  const resultados = jogos.map((j) => conferirJogo(regra, j, dezenasSorteadas))
  const premiosPorFaixa: Record<number, number> = {}
  for (const faixa of regra.faixas) {
    premiosPorFaixa[faixa.acertos] = resultados.reduce(
      (soma, r) => soma + (r.premiosPorFaixa[faixa.acertos] ?? 0),
      0,
    )
  }
  return {
    jogos: resultados,
    melhorAcerto: resultados.reduce((max, r) => Math.max(max, r.acertos), 0),
    premiosPorFaixa,
    premiada: Object.values(premiosPorFaixa).some((qtd) => qtd > 0),
  }
}

export interface PremioBruto {
  brutoCentavos: Centavos
  /**
   * Faixas premiadas sem valor no rateio (resultado manual sem rateio, ou rateio
   * ainda não publicado). O prêmio fica incompleto e o usuário pode informá-lo à mão.
   */
  faixasSemValor: number[]
}

/**
 * Seção 9.4: prêmio bruto da aposta inteira (todas as cotas):
 *   brutoAposta = Σ_faixas combinaçõesPremiadas[faixa] × valorFaixa(rateio)
 * `valorFaixa` converte o valor do rateio, se a API devolver líquido (pendência P1).
 */
export function premioBrutoAposta(
  premiosPorFaixa: Record<number, number>,
  rateio: FaixaRateio[],
  valorFaixa: (valorRateio: Centavos) => Centavos = (v) => v,
): PremioBruto {
  let brutoCentavos = 0
  const faixasSemValor: number[] = []
  for (const [acertosTexto, qtd] of Object.entries(premiosPorFaixa)) {
    if (qtd <= 0) continue
    const acertos = Number(acertosTexto)
    const faixa = rateio.find((f) => f.acertos === acertos)
    if (!faixa || faixa.valorCentavos <= 0) {
      faixasSemValor.push(acertos)
      continue
    }
    brutoCentavos += qtd * valorFaixa(faixa.valorCentavos)
  }
  return { brutoCentavos, faixasSemValor: faixasSemValor.sort((a, b) => b - a) }
}

export type StatusConferencia = 'aguardando' | 'conferida' | 'premiada' | 'nao_premiada'

/**
 * Seção 9.7:
 *   aguardando   → nenhum concurso da aposta sorteado ainda;
 *   conferida    → teimosinha com só parte dos concursos conferidos;
 *   premiada / nao_premiada → todos os concursos conferidos.
 */
export function statusDaAposta(
  qtdConcursos: number,
  concursosConferidos: number,
  algumPremio: boolean,
): StatusConferencia {
  if (concursosConferidos <= 0) return 'aguardando'
  if (concursosConferidos < qtdConcursos) return 'conferida'
  return algumPremio ? 'premiada' : 'nao_premiada'
}

/** Parte do usuário num bolão: valor × cotas do usuário ÷ total de cotas (half-up). */
export function parteDasCotas(valor: Centavos, cotasUsuario: number, totalCotas: number): Centavos {
  return multiplicarFracao(valor, cotasUsuario, totalCotas)
}

import { multiplicarFracao, ratearMaiorResto, type Centavos } from './dinheiro.ts'
import type { RegraModalidade } from './regras/tipos.ts'

/** Tarifa de serviço do bolão: até 35% do valor da cota (seção 5.1). */
export const TARIFA_MAX_BPS = 3500

/**
 * Custo de uma aposta simples/teimosinha (seção 5.3):
 *   Σ custoJogo × nº de concursos
 */
export function custoAposta(
  regra: RegraModalidade,
  jogos: number[][],
  precoSimples: Centavos,
  qtdConcursos = 1,
): Centavos {
  const porConcurso = jogos.reduce(
    (soma, jogo) => soma + regra.custoJogo(jogo.length, precoSimples),
    0,
  )
  return porConcurso * qtdConcursos
}

/** Total pago no bolão: cotas do usuário × (valor da cota + tarifa por cota). */
export function totalBolao(cotasUsuario: number, valorCota: Centavos, tarifa: Centavos): Centavos {
  return cotasUsuario * (valorCota + tarifa)
}

/** Tarifa ≤ 35% da cota, com 1 centavo de tolerância de arredondamento (Apêndice A.3). */
export function tarifaDentroDoLimite(tarifa: Centavos, valorCota: Centavos): boolean {
  return tarifa <= multiplicarFracao(valorCota, TARIFA_MAX_BPS, 10_000) + 1
}

/**
 * O valor da cota bate com o preço vigente? (Apêndice A.3)
 *   |valor_cota × total_cotas − Σ custoJogo| ≤ total_cotas centavos
 * A tolerância cobre o arredondamento do valor total dividido em cotas.
 */
export function valorCotaConfere(
  regra: RegraModalidade,
  jogos: number[][],
  precoSimples: Centavos,
  valorCota: Centavos,
  totalCotas: number,
): boolean {
  const custoTotal = custoAposta(regra, jogos, precoSimples)
  return Math.abs(valorCota * totalCotas - custoTotal) <= totalCotas
}

/** Limite de participantes por aposta (o mesmo do `apostaSchema`). */
export const MAX_PARTICIPANTES = 30

export interface ParticipanteGenerico {
  nome: string
  peso: number
  ehUsuario: boolean
  contribuicaoCentavos: Centavos
}

/**
 * Divisão "só a quantidade" (seção 11.2): o valor pago é dividido igualmente entre
 * `quantidade` pessoas (o usuário incluído), pelo maior resto (9.1). O usuário é o 1º
 * e leva o 1º centavo da sobra. Os demais viram participantes genéricos "Pessoa 2…N".
 * A contribuição de cada um é gravada, então o gasto do usuário é exatamente a parte dele.
 */
export function participantesPorQuantidade(
  valorPago: Centavos,
  quantidade: number,
  nomeUsuario = 'Eu',
): ParticipanteGenerico[] {
  if (!Number.isInteger(quantidade) || quantidade < 2 || quantidade > MAX_PARTICIPANTES) {
    throw new Error(`A quantidade de pessoas vai de 2 a ${MAX_PARTICIPANTES}`)
  }
  const partes = ratearMaiorResto(valorPago, Array<number>(quantidade).fill(1))
  return partes.map((parte, i) => ({
    nome: i === 0 ? nomeUsuario : `Pessoa ${i + 1}`,
    peso: 1,
    ehUsuario: i === 0,
    contribuicaoCentavos: parte,
  }))
}

/**
 * A divisão gravada tem o formato de `participantesPorQuantidade`? Usado ao editar
 * para reabrir no modo "só a quantidade". Devolve a quantidade, ou null.
 */
export function quantidadeDaDivisaoIgual(
  valorPago: Centavos,
  participantes: {
    nome: string
    peso: number
    ehUsuario: boolean
    contribuicaoCentavos?: Centavos | null
  }[],
): number | null {
  const n = participantes.length
  if (n < 2 || n > MAX_PARTICIPANTES) return null
  const esperado = participantesPorQuantidade(valorPago, n)
  const igual = participantes.every(
    (p, i) =>
      p.peso === 1 &&
      p.ehUsuario === (i === 0) &&
      (i === 0 || p.nome === esperado[i]!.nome) &&
      p.contribuicaoCentavos === esperado[i]!.contribuicaoCentavos,
  )
  return igual ? n : null
}

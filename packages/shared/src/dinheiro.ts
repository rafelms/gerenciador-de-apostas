// Dinheiro SEMPRE em centavos inteiros (ADR-06). Nunca usar float para valores.
// A conversão para "R$ 1.234,56" acontece só na borda (UI).

export type Centavos = number

function exigirInteiro(valor: number, nome: string) {
  if (!Number.isSafeInteger(valor))
    throw new Error(`${nome} precisa ser um inteiro (centavos): ${valor}`)
}

/**
 * Converte texto em reais para centavos.
 *   "11,93" → 1193 · "R$ 1.234,56" → 123456 · "8" → 800 · "11.93" → 1193 (formato numérico do Excel)
 * Com vírgula, os pontos são separadores de milhar. Sem vírgula, um ponto seguido de
 * 1 ou 2 dígitos é decimal; qualquer outro ponto é milhar.
 */
export function deReais(texto: string | number): Centavos {
  if (typeof texto === 'number') {
    if (!Number.isFinite(texto)) throw new Error(`Valor inválido: ${texto}`)
    // Números vindos de planilha: arredonda no centavo para eliminar ruído de float.
    return arredondarHalfUp(texto * 100)
  }

  const limpo = texto.replace(/R\$/i, '').replace(/[\s\u00a0]/g, '')
  const negativo = limpo.startsWith('-')
  const semSinal = negativo ? limpo.slice(1) : limpo

  let inteiro: string
  let decimal = ''
  if (semSinal.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(semSinal))
      throw new Error(`Valor inválido: ${texto}`)
    ;[inteiro = '', decimal = ''] = semSinal.split(',')
    inteiro = inteiro.replaceAll('.', '')
  } else if (/^\d+\.\d{1,2}$/.test(semSinal)) {
    ;[inteiro = '', decimal = ''] = semSinal.split('.')
  } else if (/^\d{1,3}(\.\d{3})*$|^\d+$/.test(semSinal)) {
    inteiro = semSinal.replaceAll('.', '')
  } else {
    throw new Error(`Valor inválido: ${texto}`)
  }

  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'))
  return negativo ? -centavos : centavos
}

/** Versão que não lança erro: devolve null se o texto não for um valor válido. */
export function tentarDeReais(texto: string | number | null | undefined): Centavos | null {
  if (texto === null || texto === undefined || texto === '') return null
  try {
    return deReais(texto)
  } catch {
    return null
  }
}

/** 1193 → "R$ 11,93" · 123456 → "R$ 1.234,56" · -500 → "-R$ 5,00" */
export function formatarBRL(centavos: Centavos): string {
  exigirInteiro(centavos, 'formatarBRL')
  const sinal = centavos < 0 ? '-' : ''
  const abs = Math.abs(centavos)
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const cents = (abs % 100).toString().padStart(2, '0')
  return `${sinal}R$ ${reais},${cents}`
}

/** Arredonda para o inteiro mais próximo; meio vai para longe do zero (half-up). */
export function arredondarHalfUp(valor: number): number {
  // O epsilon corrige representações como 1.005 * 100 = 100.49999999999999.
  const abs = Math.abs(valor)
  const arredondado = Math.floor(abs + 0.5 + 1e-9)
  return valor < 0 ? -arredondado : arredondado
}

/**
 * Calcula (valor × numerador ÷ denominador) com arredondamento half-up EXATO,
 * usando BigInt (sem erro de ponto flutuante). Base de IR, cotas e frações.
 */
export function multiplicarFracao(
  valor: Centavos,
  numerador: number,
  denominador: number,
): Centavos {
  exigirInteiro(valor, 'valor')
  exigirInteiro(numerador, 'numerador')
  exigirInteiro(denominador, 'denominador')
  if (denominador <= 0) throw new Error('denominador precisa ser positivo')

  const produto = BigInt(valor) * BigInt(numerador)
  const negativo = produto < 0n
  const abs = negativo ? -produto : produto
  const d = BigInt(denominador)
  const resultado = (2n * abs + d) / (2n * d) // floor(abs/d + 1/2)
  return Number(negativo ? -resultado : resultado)
}

/** Aplica uma alíquota em basis points (3000 = 30,00%) com half-up. */
export function aplicarBps(valor: Centavos, bps: number): Centavos {
  return multiplicarFracao(valor, bps, 10_000)
}

/** Pesos podem ter 2 casas decimais (numeric(6,2) no banco): viram inteiros ×100. */
function pesoInteiro(peso: number): bigint {
  if (!Number.isFinite(peso) || peso <= 0) throw new Error(`Peso inválido: ${peso}`)
  return BigInt(arredondarHalfUp(peso * 100))
}

/**
 * Rateio sem perder centavo — método do maior resto (seção 9.1):
 *   1. parte_i = floor(total × peso_i / Σpesos)
 *   2. sobra   = total − Σ parte_i
 *   3. +1 centavo para as `sobra` partes com maior resto (empate: ordem de cadastro)
 * Garantia: a soma das partes é sempre igual ao total.
 */
export function ratearMaiorResto(total: Centavos, pesos: number[]): Centavos[] {
  exigirInteiro(total, 'total')
  if (total < 0) throw new Error('O total do rateio não pode ser negativo')
  if (pesos.length === 0) throw new Error('Informe pelo menos um peso')

  const w = pesos.map(pesoInteiro)
  const somaPesos = w.reduce((a, b) => a + b, 0n)
  const t = BigInt(total)

  const partes = w.map((wi, indice) => ({
    indice,
    parte: (t * wi) / somaPesos,
    resto: (t * wi) % somaPesos,
  }))

  let sobra = t - partes.reduce((a, p) => a + p.parte, 0n)
  const ordemDeResto = [...partes].sort((a, b) =>
    a.resto === b.resto ? a.indice - b.indice : a.resto > b.resto ? -1 : 1,
  )
  for (const p of ordemDeResto) {
    if (sobra === 0n) break
    p.parte += 1n
    sobra -= 1n
  }

  return partes.map((p) => Number(p.parte))
}

export interface ParticipanteFracao {
  peso: number
  ehUsuario: boolean
  contribuicaoCentavos?: Centavos | null
}

/**
 * Parte do usuário no valor pago (seção 7.3):
 *   - se as contribuições foram informadas: contribuição do usuário ÷ valor pago
 *   - senão: peso do usuário ÷ soma dos pesos
 * Sem participantes, o usuário pagou tudo.
 */
export function calcularGastoUsuario(
  valorPago: Centavos,
  participantes: ParticipanteFracao[],
): Centavos {
  exigirInteiro(valorPago, 'valorPago')
  if (participantes.length === 0) return valorPago

  const usuario = participantes.find((p) => p.ehUsuario)
  if (!usuario) throw new Error('A divisão precisa incluir o próprio usuário')

  const temContribuicoes = participantes.every(
    (p) => p.contribuicaoCentavos !== null && p.contribuicaoCentavos !== undefined,
  )
  if (temContribuicoes && valorPago > 0) {
    // A própria contribuição do usuário já é a parte dele no gasto.
    return usuario.contribuicaoCentavos as Centavos
  }

  const pesosInt = participantes.map((p) => Number(pesoInteiro(p.peso)))
  const pesoUsuario = Number(pesoInteiro(usuario.peso))
  const soma = pesosInt.reduce((a, b) => a + b, 0)
  return multiplicarFracao(valorPago, pesoUsuario, soma)
}

// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
// Analisador de jogos (seção 11.10): estatísticas DESCRITIVAS de um conjunto de jogos.
// Nada aqui muda a chance de um jogo: todos têm a mesma probabilidade de sair.
// Funções puras, usadas na tela /analisador e nos testes.

import { parseDezenas } from './regras/index.ts'
import type { RegraModalidade } from './regras/tipos.ts'

export const AVISO_ANALISADOR =
  'Estatísticas descritivas; todos os jogos têm a mesma probabilidade de sair.'

/** Faixa de dezenas, inclusiva nas duas pontas. */
export interface FaixaDezenas {
  nome: string
  de: number
  ate: number
}

/**
 * Faixas padrão: na Lotofácil, baixos 01–08, médios 09–17, altos 18–25 (seção 11.10);
 * nas demais, o universo em três partes quase iguais.
 */
export function faixasPadrao(regra: RegraModalidade): FaixaDezenas[] {
  if (regra.slug === 'lotofacil') {
    return [
      { nome: 'Baixos', de: 1, ate: 8 },
      { nome: 'Médios', de: 9, ate: 17 },
      { nome: 'Altos', de: 18, ate: 25 },
    ]
  }
  const total = regra.universoMax - regra.universoMin + 1
  const tamanho = Math.ceil(total / 3)
  const nomes = ['Baixos', 'Médios', 'Altos']
  return nomes.map((nome, i) => ({
    nome,
    de: regra.universoMin + i * tamanho,
    ate: Math.min(regra.universoMax, regra.universoMin + (i + 1) * tamanho - 1),
  }))
}

/** As faixas precisam cobrir o universo inteiro, em ordem, sem buracos nem sobreposição. */
export function validarFaixas(faixas: FaixaDezenas[], regra: RegraModalidade): string[] {
  const erros: string[] = []
  if (faixas.length < 2) erros.push('Use pelo menos 2 faixas.')
  if (faixas.length > 6) erros.push('Use no máximo 6 faixas.')
  let esperado = regra.universoMin
  for (const [i, f] of faixas.entries()) {
    const rotulo = f.nome.trim() || `Faixa ${i + 1}`
    if (!f.nome.trim()) erros.push(`A faixa ${i + 1} precisa de um nome.`)
    if (!Number.isInteger(f.de) || !Number.isInteger(f.ate) || f.de > f.ate) {
      erros.push(`${rotulo}: o início precisa ser menor ou igual ao fim.`)
      continue
    }
    if (f.de !== esperado) {
      erros.push(
        f.de > esperado
          ? `${rotulo}: faltam as dezenas de ${esperado} a ${f.de - 1}.`
          : `${rotulo}: começa em ${f.de}, dentro da faixa anterior.`,
      )
    }
    esperado = f.ate + 1
  }
  if (esperado <= regra.universoMax && faixas.length >= 2) {
    erros.push(`Faltam as dezenas de ${esperado} a ${regra.universoMax}.`)
  }
  if (faixas.length > 0 && (faixas.at(-1)?.ate ?? 0) > regra.universoMax) {
    erros.push(`A última faixa passa de ${regra.universoMax}.`)
  }
  return erros
}

/** Quantas dezenas do jogo caem em cada faixa (mesma ordem das faixas). */
export function distribuicaoFaixas(jogo: number[], faixas: FaixaDezenas[]): number[] {
  return faixas.map((f) => jogo.filter((d) => d >= f.de && d <= f.ate).length)
}

export function paridade(jogo: number[]) {
  const pares = jogo.filter((d) => d % 2 === 0).length
  return { pares, impares: jogo.length - pares }
}

function ehPrimo(n: number) {
  if (n < 2) return false
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false
  return true
}

export function primos(jogo: number[]): number[] {
  return jogo.filter(ehPrimo)
}

export function soma(jogo: number[]): number {
  return jogo.reduce((s, d) => s + d, 0)
}

/** Volante 5×5 da Lotofácil: a moldura são as bordas (16 dezenas), o miolo as 9 do centro. */
const MIOLO_LOTOFACIL = new Set([7, 8, 9, 12, 13, 14, 17, 18, 19])

/** Só na Lotofácil; nas demais devolve null. */
export function molduraMiolo(jogo: number[], regra: RegraModalidade) {
  if (regra.slug !== 'lotofacil') return null
  const miolo = jogo.filter((d) => MIOLO_LOTOFACIL.has(d)).length
  return { moldura: jogo.length - miolo, miolo }
}

/**
 * Sequências de dezenas consecutivas (2 ou mais seguidas): quantos blocos e o tamanho do
 * maior. Ex.: 1 2 3 7 8 12 → 2 blocos, maior 3.
 */
export function sequencias(jogo: number[]) {
  const ordenado = [...jogo].sort((a, b) => a - b)
  let blocos = 0
  let maior = ordenado.length > 0 ? 1 : 0
  let atual = 1
  for (let i = 1; i <= ordenado.length; i++) {
    if (i < ordenado.length && ordenado[i] === ordenado[i - 1]! + 1) {
      atual++
      continue
    }
    if (atual >= 2) blocos++
    maior = Math.max(maior, atual)
    atual = 1
  }
  return { blocos, maior }
}

/** Dezenas do jogo que também saíram no último concurso. */
export function repetidas(jogo: number[], ultimoSorteio: number[]): number[] {
  const saiu = new Set(ultimoSorteio)
  return jogo.filter((d) => saiu.has(d))
}

export interface ResumoJogo {
  qtd: number
  faixas: number[]
  pares: number
  impares: number
  primos: number
  soma: number
  moldura: number | null
  miolo: number | null
  sequencias: { blocos: number; maior: number }
  /** null sem o último resultado. */
  repetidas: number | null
}

export function analisarJogo(
  jogo: number[],
  regra: RegraModalidade,
  faixas: FaixaDezenas[],
  ultimoSorteio?: number[] | null,
): ResumoJogo {
  const { pares, impares } = paridade(jogo)
  const mm = molduraMiolo(jogo, regra)
  return {
    qtd: jogo.length,
    faixas: distribuicaoFaixas(jogo, faixas),
    pares,
    impares,
    primos: primos(jogo).length,
    soma: soma(jogo),
    moldura: mm?.moldura ?? null,
    miolo: mm?.miolo ?? null,
    sequencias: sequencias(jogo),
    repetidas: ultimoSorteio ? repetidas(jogo, ultimoSorteio).length : null,
  }
}

export interface Sobreposicao {
  /** matriz[i][j] = dezenas em comum entre os jogos i e j (diagonal = tamanho do jogo). */
  matriz: number[][]
  /** Média de dezenas em comum entre os pares de jogos distintos (null com menos de 2 jogos). */
  media: number | null
  /** Pares (i < j) com mais dezenas em comum que o limite. */
  acimaDoLimite: { i: number; j: number; comuns: number }[]
}

export function sobreposicao(jogos: number[][], limite: number): Sobreposicao {
  const conjuntos = jogos.map((j) => new Set(j))
  const matriz = jogos.map((a, i) =>
    jogos.map((_, j) => (i === j ? a.length : a.filter((d) => conjuntos[j]!.has(d)).length)),
  )
  const acimaDoLimite: Sobreposicao['acimaDoLimite'] = []
  let total = 0
  let pares = 0
  for (let i = 0; i < jogos.length; i++) {
    for (let j = i + 1; j < jogos.length; j++) {
      const comuns = matriz[i]![j]!
      total += comuns
      pares++
      if (comuns > limite) acimaDoLimite.push({ i, j, comuns })
    }
  }
  return { matriz, media: pares > 0 ? total / pares : null, acimaDoLimite }
}

/** Em quantos jogos (ou concursos) cada dezena do universo aparece. */
export function contagemPorDezena(
  conjuntos: number[][],
  regra: RegraModalidade,
): { dezena: number; qtd: number }[] {
  const qtd = new Map<number, number>()
  for (const c of conjuntos) for (const d of new Set(c)) qtd.set(d, (qtd.get(d) ?? 0) + 1)
  const lista: { dezena: number; qtd: number }[] = []
  for (let d = regra.universoMin; d <= regra.universoMax; d++) {
    lista.push({ dezena: d, qtd: qtd.get(d) ?? 0 })
  }
  return lista
}

/** Cobertura dos jogos: dezenas usadas, as que ficaram de fora e a contagem por dezena. */
export function cobertura(jogos: number[][], regra: RegraModalidade) {
  const porDezena = contagemPorDezena(jogos, regra)
  const ausentes = porDezena.filter((d) => d.qtd === 0).map((d) => d.dezena)
  return {
    porDezena,
    usadas: porDezena.length - ausentes.length,
    total: porDezena.length,
    ausentes,
  }
}

/** Jogos colados ou digitados: um por linha, dezenas separadas por espaço, vírgula, hífen… */
export function parseJogos(
  texto: string,
  regra: RegraModalidade,
): { jogos: number[][]; erros: { linha: number; mensagens: string[] }[] } {
  const jogos: number[][] = []
  const erros: { linha: number; mensagens: string[] }[] = []
  for (const [i, bruta] of texto.split(/\r?\n/).entries()) {
    if (!bruta.trim()) continue
    const dezenas = parseDezenas(bruta)
    const mensagens = dezenas.some(Number.isNaN)
      ? ['Use só números separados por espaço, vírgula ou hífen.']
      : regra.validarJogo(dezenas)
    if (mensagens.length > 0) erros.push({ linha: i + 1, mensagens })
    else jogos.push(dezenas)
  }
  return { jogos, erros }
}

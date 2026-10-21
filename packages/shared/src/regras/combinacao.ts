import { combinacao, combinacoesPremiadas } from '../combinatoria.ts'
import type { Centavos } from '../dinheiro.ts'
import type { Faixa, RegraModalidade, ResultadoConferencia, SlugModalidade, Sorteio } from './tipos.ts'

interface DefinicaoCombinacao {
  slug: SlugModalidade
  nome: string
  universoMin: number
  universoMax: number
  qtdSorteadas: number
  baseAposta: number
  minMarcadas: number
  maxMarcadas: number
  faixas: Faixa[]
}

/**
 * Modalidades "de combinação" (Mega-Sena, Lotofácil, Quina): marca n dezenas,
 * o jogo vale C(n, p) apostas simples e cada uma é conferida contra o sorteio.
 */
export function criarRegraCombinacao(def: DefinicaoCombinacao): RegraModalidade {
  return {
    ...def,

    validarJogo(dezenas) {
      const erros: string[] = []
      if (dezenas.length < def.minMarcadas || dezenas.length > def.maxMarcadas) {
        erros.push(
          `${def.nome} aceita de ${def.minMarcadas} a ${def.maxMarcadas} dezenas; encontradas ${dezenas.length}`,
        )
      }
      const vistas = new Set<number>()
      for (const d of dezenas) {
        if (!Number.isInteger(d) || d < def.universoMin || d > def.universoMax) {
          erros.push(`Dezena ${d} fora do intervalo ${def.universoMin}–${def.universoMax}`)
        } else if (vistas.has(d)) {
          erros.push(`Dezena ${d} repetida`)
        }
        vistas.add(d)
      }
      return erros
    },

    custoJogo(qtdDezenas: number, precoSimples: Centavos) {
      return precoSimples * combinacao(qtdDezenas, def.baseAposta)
    },

    conferir(dezenasJogo: number[], sorteio: Sorteio): ResultadoConferencia {
      const sorteadas = new Set(sorteio.dezenas)
      const dezenasAcertadas = [...new Set(dezenasJogo)].filter((d) => sorteadas.has(d)).sort((a, b) => a - b)
      const n = new Set(dezenasJogo).size
      const k = dezenasAcertadas.length

      const premiosPorFaixa: Record<number, number> = {}
      for (const faixa of def.faixas) {
        premiosPorFaixa[faixa.acertos] = combinacoesPremiadas(n, k, def.baseAposta, faixa.acertos)
      }
      return { acertos: k, dezenasAcertadas, premiosPorFaixa }
    },
  }
}

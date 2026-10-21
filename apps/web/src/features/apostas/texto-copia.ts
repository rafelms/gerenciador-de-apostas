import { formatarData } from '@/lib/formatadores'

/** O mínimo de uma aposta para virar texto copiável. */
export interface ApostaParaCopiar {
  modalidadeNome: string
  tipo: 'simples' | 'bolao' | 'teimosinha'
  concursoInicial: number
  qtdConcursos: number
  /** Dezenas de cada jogo, na ordem dos jogos. */
  jogos: number[][]
}

const dezena = (d: number) => d.toString().padStart(2, '0')

/**
 * "Mega-Sena · concurso 3070" seguido de uma linha por jogo, pronto para colar no
 * WhatsApp ou refazer o jogo no app da CAIXA.
 */
export function textoDaAposta(a: ApostaParaCopiar): string {
  const concursos =
    a.qtdConcursos > 1
      ? `concursos ${a.concursoInicial} a ${a.concursoInicial + a.qtdConcursos - 1}`
      : `concurso ${a.concursoInicial}`
  const cabecalho = [a.modalidadeNome, concursos, a.tipo === 'bolao' ? 'bolão' : null]
    .filter(Boolean)
    .join(' · ')
  const jogos = a.jogos.map((j, i) => `Jogo ${i + 1}: ${j.map(dezena).join(' ')}`)
  return [cabecalho, ...jogos].join('\n')
}

/** Todas as apostas de um dia, com o dia no topo e uma linha em branco entre as apostas. */
export function textoDoLote(dia: string, apostas: ApostaParaCopiar[]): string {
  return [`Apostas de ${formatarData(dia)}`, ...apostas.map(textoDaAposta)].join('\n\n')
}

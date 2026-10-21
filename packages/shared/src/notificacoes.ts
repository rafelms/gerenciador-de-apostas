import { formatarBRL, type Centavos } from './dinheiro.ts'

export interface ResumoResultadoUsuario {
  modalidadeNome: string
  numeroConcurso: number
  /** Apostas do usuário conferidas neste concurso. */
  qtdApostas: number
  premiada: boolean
  liquidoCentavos: Centavos
  /** Alguma faixa premiada sem valor no rateio. */
  valorPendente: boolean
  melhorAcerto: number
}

/**
 * Texto da notificação de resultado (seção 10.2). Uma por usuário e concurso.
 *   premiada:     "🎉 Sua aposta na Mega-Sena 3070 foi premiada: R$ X líquidos"
 *   não premiada: "Resultado da Mega-Sena 3070 conferido: melhor jogo com 3 acertos"
 */
export function textoNotificacaoResultado(r: ResumoResultadoUsuario): {
  titulo: string
  corpo: string
} {
  const concurso = `${r.modalidadeNome} ${r.numeroConcurso}`
  const plural = r.qtdApostas > 1
  if (r.premiada) {
    const valor =
      r.valorPendente && r.liquidoCentavos === 0
        ? 'valor a confirmar'
        : `${formatarBRL(r.liquidoCentavos)} líquidos`
    return {
      titulo: `🎉 ${plural ? 'Suas apostas' : 'Sua aposta'} na ${concurso} ${plural ? 'foram premiadas' : 'foi premiada'}: ${valor}`,
      corpo: r.valorPendente
        ? 'Parte do prêmio ainda não tem valor no rateio oficial. Você pode informar o valor recebido na aposta.'
        : 'Confira o prêmio e a divisão na aposta. Lembre-se de resgatar dentro do prazo.',
    }
  }
  const acertos = r.melhorAcerto === 1 ? '1 acerto' : `${r.melhorAcerto} acertos`
  return {
    titulo: `Resultado da ${concurso} conferido: melhor jogo com ${acertos}`,
    corpo: plural ? `${r.qtdApostas} apostas conferidas, nenhuma premiada.` : 'Não foi desta vez.',
  }
}

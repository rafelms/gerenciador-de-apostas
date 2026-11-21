import type { RegraModalidade } from '@shared/regras/tipos.ts'

const dois = (n: number) => String(n).padStart(2, '0')

/** "6" ou "15 a 20" (a faixa de dezenas que um jogo pode ter). */
function faixaDeDezenas(regra: Pick<RegraModalidade, 'minMarcadas' | 'maxMarcadas'>) {
  return regra.minMarcadas === regra.maxMarcadas
    ? String(regra.minMarcadas)
    : `${regra.minMarcadas} a ${regra.maxMarcadas}`
}

/**
 * Instrução para o usuário colar na IA dele (junto das fotos ou do texto das apostas) e
 * receber os jogos no formato que o "Colar dezenas" aceita. Sem dado nenhum do usuário.
 */
export function promptParaIA(
  regra: Pick<
    RegraModalidade,
    'nome' | 'universoMin' | 'universoMax' | 'minMarcadas' | 'maxMarcadas'
  >,
): string {
  const exemplo = Array.from({ length: Math.min(regra.minMarcadas, 6) }, (_, i) =>
    dois(regra.universoMin + i * 2),
  ).join(' ')
  return [
    `Leia as apostas da ${regra.nome} que estão nas imagens (ou no texto) que enviei e devolva só as dezenas que eu apostei.`,
    '',
    'Regras da resposta:',
    '- Um jogo por linha.',
    `- Cada jogo tem de ${faixaDeDezenas(regra)} dezenas, entre ${dois(regra.universoMin)} e ${dois(regra.universoMax)}.`,
    ...(regra.universoMin === 0
      ? ['- A dezena 100 deve ser escrita como 00 (o sistema usa 00 a 99).']
      : []),
    '- Dezenas em ordem crescente, sempre com dois dígitos (01, 02, … e não 1, 2) e separadas por um espaço.',
    '- Use só os "Meus números"/dezenas apostadas. Ignore os números sorteados, o número de acertos, datas, valores e códigos.',
    '- Sem numerar as linhas, sem título, sem explicação e sem pontuação. Coloque tudo dentro de um único bloco de código para eu copiar.',
    '- Se alguma dezena estiver ilegível ou o jogo ficar com a quantidade errada, não invente: avise qual jogo é e o que faltou.',
    '',
    'Exemplo do formato (um jogo):',
    exemplo,
  ].join('\n')
}

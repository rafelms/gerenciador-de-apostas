import { criarRegraCombinacao } from './combinacao.ts'

// Conferido no site da CAIXA e na API de resultados em 21/10/2026: marca 50 números
// de 00 a 99, são sorteados 20, e premia 20, 19, 18, 17, 16, 15 ou NENHUM acerto.
// Preço único (não há aposta com mais números). Teimosinha só para 2, 3, 4, 6, 8, 9
// ou 12 concursos. Aposta-Espelho: os outros 50 números, como um 2º jogo.
// O "00" é a dezena 0 (o volante da CAIXA o mostra depois do 99).
export const lotomania = criarRegraCombinacao({
  slug: 'lotomania',
  nome: 'Lotomania',
  universoMin: 0,
  universoMax: 99,
  qtdSorteadas: 20,
  baseAposta: 50,
  minMarcadas: 50,
  maxMarcadas: 50,
  faixas: [
    { acertos: 20, nome: '20 acertos' },
    { acertos: 19, nome: '19 acertos' },
    { acertos: 18, nome: '18 acertos' },
    { acertos: 17, nome: '17 acertos' },
    { acertos: 16, nome: '16 acertos' },
    { acertos: 15, nome: '15 acertos' },
    { acertos: 0, nome: 'Nenhum acerto' },
  ],
  teimosinhaConcursos: [2, 3, 4, 6, 8, 9, 12],
  espelho: true,
})

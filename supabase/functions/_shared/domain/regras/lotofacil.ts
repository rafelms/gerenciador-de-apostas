// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
import { criarRegraCombinacao } from './combinacao.ts'

// Conferido no site da CAIXA em 21/10/2026: 15 a 20 dezenas de 1 a 25.
export const lotofacil = criarRegraCombinacao({
  slug: 'lotofacil',
  nome: 'Lotofácil',
  universoMin: 1,
  universoMax: 25,
  qtdSorteadas: 15,
  baseAposta: 15,
  minMarcadas: 15,
  maxMarcadas: 20,
  faixas: [
    { acertos: 15, nome: '15 acertos' },
    { acertos: 14, nome: '14 acertos' },
    { acertos: 13, nome: '13 acertos' },
    { acertos: 12, nome: '12 acertos' },
    { acertos: 11, nome: '11 acertos' },
  ],
})

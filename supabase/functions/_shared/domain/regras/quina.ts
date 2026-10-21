// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
import { criarRegraCombinacao } from './combinacao.ts'

// Conferido no site da CAIXA em 21/10/2026: 5 a 15 dezenas de 1 a 80.
export const quina = criarRegraCombinacao({
  slug: 'quina',
  nome: 'Quina',
  universoMin: 1,
  universoMax: 80,
  qtdSorteadas: 5,
  baseAposta: 5,
  minMarcadas: 5,
  maxMarcadas: 15,
  faixas: [
    { acertos: 5, nome: 'Quina' },
    { acertos: 4, nome: 'Quadra' },
    { acertos: 3, nome: 'Terno' },
    { acertos: 2, nome: 'Duque' },
  ],
})

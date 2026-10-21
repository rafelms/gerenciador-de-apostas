// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
import { criarRegraCombinacao } from './combinacao.ts'

// Conferido no site da CAIXA em 21/10/2026: 6 a 20 dezenas de 1 a 60.
export const megasena = criarRegraCombinacao({
  slug: 'megasena',
  nome: 'Mega-Sena',
  universoMin: 1,
  universoMax: 60,
  qtdSorteadas: 6,
  baseAposta: 6,
  minMarcadas: 6,
  maxMarcadas: 20,
  faixas: [
    { acertos: 6, nome: 'Sena' },
    { acertos: 5, nome: 'Quina' },
    { acertos: 4, nome: 'Quadra' },
  ],
})

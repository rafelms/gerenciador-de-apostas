import { formatarBRL } from '@shared/dinheiro.ts'

import { cn } from '@/lib/utils'

interface MoneyTextProps {
  centavos: number
  /** Colore e mostra o sinal (+/−): para saldo e ROI. O sinal garante que a cor não é a única pista. */
  comSinal?: boolean
  /** Centavos em tom mais claro, para os números grandes (",82" em cinza). */
  centavosSuaves?: boolean
  className?: string
}

/** Valor em BRL, algarismos tabulares e sem quebra de linha (seção 12.4). */
export function MoneyText({
  centavos,
  comSinal = false,
  centavosSuaves = false,
  className,
}: MoneyTextProps) {
  const texto = formatarBRL(Math.abs(centavos))
  const prefixo = comSinal
    ? centavos > 0
      ? '+'
      : centavos < 0
        ? '−'
        : ''
    : centavos < 0
      ? '−'
      : ''
  const virgula = texto.lastIndexOf(',')
  return (
    <span
      className={cn(
        'whitespace-nowrap tabular-nums',
        comSinal && centavos > 0 && 'text-lucro',
        comSinal && centavos < 0 && 'text-prejuizo',
        className,
      )}
    >
      {prefixo}
      {centavosSuaves && virgula > 0 ? (
        <>
          {texto.slice(0, virgula)}
          <span className="opacity-45">{texto.slice(virgula)}</span>
        </>
      ) : (
        texto
      )}
    </span>
  )
}

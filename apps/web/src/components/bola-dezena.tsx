import { cn } from '@/lib/utils'

export type EstadoDezena = 'neutra' | 'marcada' | 'acertada' | 'sorteada'

const estilos: Record<EstadoDezena, string> = {
  neutra: 'bg-muted text-foreground',
  marcada: 'bg-primary text-primary-foreground',
  // Ouro com texto marinho: contraste 5,66:1 (AA) nos dois temas.
  acertada: 'bg-destaque text-marinho-900 ring-2 ring-destaque/40',
  sorteada: 'border-2 border-destaque text-foreground',
}

const rotuloEstado: Partial<Record<EstadoDezena, string>> = {
  acertada: 'acertada',
  sorteada: 'sorteada',
}

interface BolaDezenaProps {
  numero: number
  estado?: EstadoDezena
  tamanho?: 'sm' | 'md'
  className?: string
}

/** Dezena como bolinha (seção 12.4). O estado também vai no texto acessível, não só na cor. */
export function BolaDezena({
  numero,
  estado = 'marcada',
  tamanho = 'md',
  className,
}: BolaDezenaProps) {
  const texto = numero.toString().padStart(2, '0')
  const sufixo = rotuloEstado[estado]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums',
        tamanho === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm',
        estilos[estado],
        className,
      )}
      aria-label={sufixo ? `${texto}, ${sufixo}` : undefined}
    >
      {texto}
    </span>
  )
}

interface ListaDezenasProps {
  dezenas: number[]
  /** Dezenas sorteadas: as acertadas ficam douradas. */
  sorteadas?: number[] | null
  tamanho?: 'sm' | 'md'
  className?: string
}

export function ListaDezenas({ dezenas, sorteadas, tamanho = 'sm', className }: ListaDezenasProps) {
  const set = new Set(sorteadas ?? [])
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Dezenas">
      {dezenas.map((d) => (
        <li key={d}>
          <BolaDezena
            numero={d}
            tamanho={tamanho}
            estado={sorteadas ? (set.has(d) ? 'acertada' : 'neutra') : 'marcada'}
          />
        </li>
      ))}
    </ul>
  )
}

import { estiloDezenaMarcada } from '@/lib/cor'
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
  /** Cor da modalidade (#rrggbb), usada no estado "marcada". */
  cor?: string
  className?: string
}

/** Dezena como bolinha (seção 12.4). O estado também vai no texto acessível, não só na cor. */
export function BolaDezena({
  numero,
  estado = 'marcada',
  tamanho = 'md',
  cor,
  className,
}: BolaDezenaProps) {
  const texto = numero.toString().padStart(2, '0')
  const sufixo = rotuloEstado[estado]
  const comCor = estado === 'marcada' && !!cor
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tabular-nums',
        tamanho === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm',
        comCor ? undefined : estilos[estado],
        className,
      )}
      style={comCor ? estiloDezenaMarcada(cor) : undefined}
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
  /** Cor da modalidade para as dezenas marcadas (as acertadas continuam douradas). */
  cor?: string
  className?: string
}

export function ListaDezenas({
  dezenas,
  sorteadas,
  tamanho = 'sm',
  cor,
  className,
}: ListaDezenasProps) {
  const set = new Set(sorteadas ?? [])
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Dezenas">
      {dezenas.map((d) => (
        <li key={d}>
          <BolaDezena
            numero={d}
            tamanho={tamanho}
            cor={cor}
            estado={sorteadas ? (set.has(d) ? 'acertada' : 'neutra') : 'marcada'}
          />
        </li>
      ))}
    </ul>
  )
}

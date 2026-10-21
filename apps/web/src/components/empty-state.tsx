import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icone: LucideIcon
  titulo: string
  descricao?: ReactNode
  /** Ação sugerida (seção 12.1: estado vazio sempre com uma ação). */
  acao?: ReactNode
  className?: string
}

export function EmptyState({ icone: Icone, titulo, descricao, acao, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icone className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {descricao && <p className="max-w-sm text-sm text-muted-foreground">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  )
}

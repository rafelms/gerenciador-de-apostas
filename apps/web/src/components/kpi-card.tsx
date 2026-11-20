import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  titulo: string
  valor: ReactNode
  icone: LucideIcon
  detalhe?: ReactNode
  /** Card escuro de destaque (um por tela, no máximo). */
  destaque?: boolean
  className?: string
}

/** Indicador: rótulo sempre visível, número grande em Outfit e um detalhe opcional (seção 12.3). */
export function KpiCard({
  titulo,
  valor,
  icone: Icone,
  detalhe,
  destaque = false,
  className,
}: KpiCardProps) {
  return (
    <Card
      className={cn(
        'gap-3 p-5',
        destaque && 'border-transparent bg-tinta text-tinta-foreground dark:border-border',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          className={cn(
            'font-sans text-sm font-medium',
            destaque ? 'text-tinta-muted' : 'text-muted-foreground',
          )}
        >
          {titulo}
        </h3>
        <span
          className={cn(
            'flex size-8 items-center justify-center rounded-full',
            destaque ? 'bg-menta text-menta-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icone className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="font-display text-2xl font-medium tracking-tight tabular-nums sm:text-3xl">
        {valor}
      </p>
      {detalhe && (
        <p className={cn('text-xs', destaque ? 'text-tinta-muted' : 'text-muted-foreground')}>
          {detalhe}
        </p>
      )}
    </Card>
  )
}

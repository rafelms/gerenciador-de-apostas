import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  titulo: string
  valor: ReactNode
  icone: LucideIcon
  detalhe?: ReactNode
  className?: string
}

/** Indicador do dashboard: valor grande (24–30px, peso 700) com rótulo sempre visível (seção 12.3). */
export function KpiCard({ titulo, valor, icone: Icone, detalhe, className }: KpiCardProps) {
  return (
    <Card className={cn('gap-1 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted-foreground">{titulo}</h3>
        <Icone className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="text-2xl font-bold tracking-tight tabular-nums lg:text-3xl">{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </Card>
  )
}

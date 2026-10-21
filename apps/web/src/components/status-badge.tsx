import { Ban, CheckCircle2, Clock, Trophy, XCircle, type LucideIcon } from 'lucide-react'

import { rotulosStatus, type StatusAposta } from '@/lib/status'
import { cn } from '@/lib/utils'

const config: Record<StatusAposta, { icone: LucideIcon; classe: string }> = {
  aguardando: { icone: Clock, classe: 'bg-muted text-muted-foreground' },
  conferida: { icone: CheckCircle2, classe: 'bg-info/15 text-info' },
  premiada: { icone: Trophy, classe: 'bg-destaque text-marinho-900' },
  nao_premiada: { icone: XCircle, classe: 'bg-muted text-muted-foreground' },
  cancelada: { icone: Ban, classe: 'border text-muted-foreground line-through' },
}

/** Status da aposta com ícone + texto (a cor nunca é a única informação). */
export function StatusBadge({ status, className }: { status: StatusAposta; className?: string }) {
  const { icone: Icone, classe } = config[status]
  const rotulo = rotulosStatus[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        classe,
        className,
      )}
    >
      <Icone className="size-3.5" aria-hidden="true" />
      {rotulo}
    </span>
  )
}

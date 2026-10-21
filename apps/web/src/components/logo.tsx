import { cn } from '@/lib/utils'

export function Logo({ className, compacto = false }: { className?: string; compacto?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      <svg viewBox="0 0 64 64" className="size-[1.4em] shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="14" className="fill-primary" />
        <circle cx="32" cy="32" r="18" className="fill-primary-foreground" />
        <circle cx="32" cy="32" r="8" className="fill-destaque" />
      </svg>
      {!compacto && <span>LotoGestor</span>}
    </span>
  )
}

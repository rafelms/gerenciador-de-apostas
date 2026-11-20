import { cn } from '@/lib/utils'

/**
 * Marca do LotoGestor: quadrado marinho com a bola clara e o centro dourado.
 * `escuro` = sobre o painel escuro (o quadrado vira menta para não sumir).
 */
export function Logo({
  className,
  compacto = false,
  escuro = false,
}: {
  className?: string
  compacto?: boolean
  escuro?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-display font-semibold tracking-tight',
        className,
      )}
    >
      <svg viewBox="0 0 64 64" className="size-[1.4em] shrink-0" aria-hidden="true">
        <rect width="64" height="64" rx="16" className={escuro ? 'fill-menta' : 'fill-tinta'} />
        <circle
          cx="32"
          cy="32"
          r="18"
          className={escuro ? 'fill-tinta' : 'fill-tinta-foreground'}
        />
        <circle cx="32" cy="32" r="8" className="fill-destaque" />
      </svg>
      {!compacto && <span>LotoGestor</span>}
    </span>
  )
}

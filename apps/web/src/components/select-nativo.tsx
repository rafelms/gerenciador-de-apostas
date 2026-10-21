import { ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** <select> nativo com o visual dos inputs: no celular abre o seletor do sistema. */
export function SelectNativo({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          'h-11 w-full appearance-none rounded-md border border-input bg-transparent pr-9 pl-3 text-base shadow-xs outline-none',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  )
}

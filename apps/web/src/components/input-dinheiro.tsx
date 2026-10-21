import type { ComponentProps } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Campo de valor em reais ("8,84"). Teclado decimal no celular; conversão para centavos fica no estado. */
export function InputDinheiro({
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type' | 'inputMode'>) {
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      >
        R$
      </span>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={props.placeholder ?? '0,00'}
        className={cn('pl-10 text-right tabular-nums', className)}
      />
    </div>
  )
}

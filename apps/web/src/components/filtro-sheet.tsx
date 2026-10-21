import type { ReactNode } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useDesktop } from '@/lib/use-media-query'

interface FiltroSheetProps {
  titulo: string
  aberto: boolean
  onAbertoChange: (aberto: boolean) => void
  gatilho: ReactNode
  children: ReactNode
}

/** Painel de filtros: bottom sheet no mobile, popover no desktop (seção 12.4). */
export function FiltroSheet({
  titulo,
  aberto,
  onAbertoChange,
  gatilho,
  children,
}: FiltroSheetProps) {
  const desktop = useDesktop()

  if (desktop) {
    return (
      <Popover open={aberto} onOpenChange={onAbertoChange}>
        <PopoverTrigger asChild>{gatilho}</PopoverTrigger>
        <PopoverContent align="end" className="w-96" aria-label={titulo}>
          {children}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Sheet open={aberto} onOpenChange={onAbertoChange}>
      <SheetTrigger asChild>{gatilho}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
          <SheetDescription className="sr-only">Refine a lista</SheetDescription>
        </SheetHeader>
        <div className="px-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

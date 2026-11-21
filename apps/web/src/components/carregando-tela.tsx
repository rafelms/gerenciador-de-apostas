import { Loader2 } from 'lucide-react'

import { Logo } from './logo'

/** Continua a abertura estática do index.html (mesma marca, centralizada) com o indicador. */
export function CarregandoTela() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-6"
      role="status"
      aria-live="polite"
    >
      <Logo className="text-3xl" />
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Carregando…</span>
    </div>
  )
}

import { Loader2 } from 'lucide-react'

export function CarregandoTela() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Carregando…</span>
    </div>
  )
}

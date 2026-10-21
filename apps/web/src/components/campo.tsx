import { useId, type ReactElement, type ReactNode } from 'react'
import { cloneElement, isValidElement } from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface CampoProps {
  label: string
  erro?: string | undefined
  ajuda?: ReactNode
  className?: string
  /** Um único controle (Input, Textarea…). Recebe id e atributos aria automaticamente. */
  children: ReactElement<Record<string, unknown>>
}

/**
 * Campo de formulário: label visível, texto de ajuda e erro logo abaixo do controle,
 * associados por aria-describedby (acessibilidade, seção 12.1).
 */
export function Campo({ label, erro, ajuda, className, children }: CampoProps) {
  const id = useId()
  const idAjuda = `${id}-ajuda`
  const idErro = `${id}-erro`
  const descritores =
    [ajuda ? idAjuda : null, erro ? idErro : null].filter(Boolean).join(' ') || undefined

  const controle = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': erro ? true : undefined,
        'aria-describedby': descritores,
      })
    : children

  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {controle}
      {ajuda && (
        <p id={idAjuda} className="text-sm text-muted-foreground">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={idErro} role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}

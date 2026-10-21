import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

interface ModalidadeChipProps extends Omit<ComponentProps<'button'>, 'children'> {
  nome: string
  cor: string
  /** Quando presente, vira um botão de seleção (aria-pressed). */
  selecionado?: boolean
}

/**
 * Chip da modalidade. A cor da modalidade aparece só no detalhe (bolinha/borda),
 * nunca como fundo de área grande (seção 12.2).
 */
export function ModalidadeChip({
  nome,
  cor,
  selecionado,
  className,
  ...props
}: ModalidadeChipProps) {
  const conteudo = (
    <>
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: cor }}
        aria-hidden="true"
      />
      {nome}
    </>
  )

  if (selecionado === undefined) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', className)}>
        {conteudo}
      </span>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={selecionado}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 text-sm font-medium transition-colors duration-150',
        selecionado ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
        className,
      )}
      style={{ borderColor: selecionado ? cor : undefined }}
      {...props}
    >
      {conteudo}
    </button>
  )
}

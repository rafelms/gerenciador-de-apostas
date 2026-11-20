import type { ReactNode } from 'react'

interface CabecalhoPaginaProps {
  titulo: string
  descricao?: ReactNode
  acoes?: ReactNode
}

export function CabecalhoPagina({ titulo, descricao, acoes }: CabecalhoPaginaProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 lg:mb-8">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-medium tracking-tight lg:text-4xl">{titulo}</h1>
        {descricao && <p className="mt-1.5 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

import { Construction } from 'lucide-react'
import { Link } from 'react-router'

import { CabecalhoPagina } from './cabecalho-pagina'
import { EmptyState } from './empty-state'
import { Button } from './ui/button'

interface PaginaEmBreveProps {
  titulo: string
  fase: number
  descricao: string
}

/** Página reservada para uma funcionalidade de fase futura (rota já existe e é protegida). */
export function PaginaEmBreve({ titulo, fase, descricao }: PaginaEmBreveProps) {
  return (
    <>
      <CabecalhoPagina titulo={titulo} />
      <EmptyState
        icone={Construction}
        titulo={`Disponível na fase ${fase}`}
        descricao={descricao}
        acao={
          <Button asChild variant="outline">
            <Link to="/">Voltar ao início</Link>
          </Button>
        }
      />
    </>
  )
}

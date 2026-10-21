import { useState, type ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'

interface ConfirmDialogProps {
  titulo: string
  descricao?: ReactNode
  textoConfirmar?: string
  destrutivo?: boolean
  onConfirmar: () => void | Promise<void>
  /** Elemento que abre o diálogo. */
  children: ReactNode
}

/** Confirmação para ações irreversíveis ou sensíveis (seção 12.4). */
export function ConfirmDialog({
  titulo,
  descricao,
  textoConfirmar = 'Confirmar',
  destrutivo = false,
  onConfirmar,
  children,
}: ConfirmDialogProps) {
  const [aberto, setAberto] = useState(false)
  const [executando, setExecutando] = useState(false)

  async function confirmar(e: React.MouseEvent) {
    e.preventDefault()
    setExecutando(true)
    try {
      await onConfirmar()
      setAberto(false)
    } finally {
      setExecutando(false)
    }
  }

  return (
    <AlertDialog open={aberto} onOpenChange={setAberto}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descricao && <AlertDialogDescription>{descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmar}
            disabled={executando}
            className={destrutivo ? buttonVariants({ variant: 'destructive' }) : undefined}
          >
            {textoConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

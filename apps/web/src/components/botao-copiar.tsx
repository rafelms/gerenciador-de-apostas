import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type ComponentProps } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { copiarTexto } from '@/lib/area-de-transferencia'

interface BotaoCopiarProps extends Omit<ComponentProps<typeof Button>, 'onClick' | 'children'> {
  /** Chamado no clique; pode buscar os dados antes (ex.: os jogos das apostas). */
  obterTexto: () => string | Promise<string>
  /** Texto visível ao lado do ícone; sem ele, o botão é só o ícone (use aria-label). */
  texto?: string
  mensagemSucesso?: string
}

/** Copia para a área de transferência e confirma com um ✓ por 2 s e um aviso. */
export function BotaoCopiar({
  obterTexto,
  texto,
  mensagemSucesso = 'Copiado.',
  variant = 'ghost',
  size,
  ...props
}: BotaoCopiarProps) {
  const [copiado, setCopiado] = useState(false)
  const [copiando, setCopiando] = useState(false)

  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(false), 2000)
    return () => clearTimeout(t)
  }, [copiado])

  async function copiar() {
    setCopiando(true)
    try {
      await copiarTexto(obterTexto())
      setCopiado(true)
      toast.success(mensagemSucesso)
    } catch {
      toast.error('Não foi possível copiar.')
    } finally {
      setCopiando(false)
    }
  }

  const Icone = copiado ? Check : Copy
  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (texto ? 'sm' : 'icon')}
      onClick={() => void copiar()}
      disabled={copiando}
      {...props}
    >
      <Icone aria-hidden="true" />
      {texto}
    </Button>
  )
}

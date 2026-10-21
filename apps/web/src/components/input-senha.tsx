import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Campo de senha com botão de mostrar/ocultar. */
export function InputSenha(props: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visivel ? 'text' : 'password'} className="pr-12" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0 text-muted-foreground"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visivel}
      >
        {visivel ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </Button>
    </div>
  )
}

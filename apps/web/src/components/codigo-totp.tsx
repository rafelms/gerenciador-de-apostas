import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'

interface CodigoTotpProps {
  valor: string
  onChange: (valor: string) => void
  erro?: string | null
}

/** Entrada de código TOTP com 6 casas, teclado numérico no celular. */
export function CodigoTotp({ valor, onChange, erro }: CodigoTotpProps) {
  return (
    <div className="grid justify-items-center gap-2">
      <Label htmlFor="codigo-totp" className="sr-only">
        Código de verificação
      </Label>
      <InputOTP
        id="codigo-totp"
        maxLength={6}
        value={valor}
        onChange={onChange}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? 'codigo-totp-erro' : undefined}
      >
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {erro && (
        <p id="codigo-totp-erro" role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}

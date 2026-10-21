import { zodResolver } from '@hookform/resolvers/zod'
import { emailSchema } from '@shared/schemas/auth.ts'
import { Loader2, MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'

import { Campo } from '@/components/campo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './auth-layout'
import { textosAuth } from './textos'

const schema = z.object({ email: emailSchema })
type Dados = z.infer<typeof schema>

export function EsqueciSenhaPage() {
  const [enviado, setEnviado] = useState(false)
  const form = useForm<Dados>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  async function enviar({ email }: Dados) {
    // O resultado é ignorado de propósito: a resposta é sempre a mesma,
    // para não revelar se o e-mail está cadastrado.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setEnviado(true)
  }

  return (
    <AuthLayout
      titulo="Esqueci a senha"
      descricao="Informe seu e-mail para receber um link de redefinição."
      rodape={
        <Link to="/login" className="underline-offset-4 hover:underline">
          Voltar para o login
        </Link>
      }
    >
      {enviado ? (
        <div className="flex gap-3" role="status">
          <MailCheck className="size-5 shrink-0 text-lucro" aria-hidden="true" />
          <p className="text-sm">{textosAuth.emailRecuperacaoEnviado}</p>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(enviar)} className="grid gap-4" noValidate>
          <Campo label="E-mail" erro={form.formState.errors.email?.message}>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              {...form.register('email')}
            />
          </Campo>
          <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
            {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
            Enviar link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

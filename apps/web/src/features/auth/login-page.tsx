import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@shared/schemas/auth.ts'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'

import { Campo } from '@/components/campo'
import { InputSenha } from '@/components/input-senha'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './auth-layout'
import { textosAuth } from './textos'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const destino = (location.state as { de?: string } | null)?.de ?? '/'
  const [erro, setErro] = useState<string | null>(null)

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
  })

  async function entrar(dados: LoginInput) {
    setErro(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: dados.email,
      password: dados.senha,
    })
    if (error) {
      // Mensagem genérica para qualquer falha de credencial (não revela se o e-mail existe).
      setErro(error.status === 400 ? textosAuth.credenciaisInvalidas : textosAuth.erroGenerico)
      return
    }
    // Se houver MFA cadastrado, a guarda de rota leva para /mfa.
    navigate(destino, { replace: true })
  }

  const enviando = form.formState.isSubmitting

  return (
    <AuthLayout titulo="Entrar" descricao="Acesso somente para usuários convidados.">
      <form onSubmit={form.handleSubmit(entrar)} className="grid gap-4" noValidate>
        <Campo label="E-mail" erro={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Campo>
        <Campo label="Senha" erro={form.formState.errors.senha?.message}>
          <InputSenha autoComplete="current-password" {...form.register('senha')} />
        </Campo>
        {erro && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {erro}
          </p>
        )}
        <Button type="submit" disabled={enviando} className="w-full">
          {enviando && <Loader2 className="animate-spin" aria-hidden="true" />}
          Entrar
        </Button>
        <Link
          to="/esqueci-senha"
          className="text-center text-sm underline-offset-4 hover:underline"
        >
          Esqueci a senha
        </Link>
      </form>
    </AuthLayout>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { definirSenhaSchema, type DefinirSenhaInput } from '@shared/schemas/auth.ts'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { CarregandoTela } from '@/components/carregando-tela'
import { Campo } from '@/components/campo'
import { InputSenha } from '@/components/input-senha'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './auth-layout'
import { textosAuth } from './textos'
import { useTokenDoLink } from './use-token-do-link'

export function RedefinirSenhaPage() {
  const estado = useTokenDoLink('recovery')
  const navigate = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const form = useForm<DefinirSenhaInput>({
    resolver: zodResolver(definirSenhaSchema),
    defaultValues: { senha: '', confirmacao: '' },
  })

  if (estado === 'verificando') return <CarregandoTela />
  if (estado === 'invalido') {
    return (
      <AuthLayout titulo="Link inválido" descricao={textosAuth.linkInvalido}>
        <Button asChild className="w-full">
          <Link to="/esqueci-senha">Pedir novo link</Link>
        </Button>
      </AuthLayout>
    )
  }

  async function salvar({ senha }: DefinirSenhaInput) {
    setErro(null)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setErro(error.code === 'weak_password' ? textosAuth.senhaFraca : textosAuth.erroGenerico)
      return
    }
    toast.success(textosAuth.senhaAlterada)
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout titulo="Nova senha" descricao="Escolha uma senha nova para sua conta.">
      <form onSubmit={form.handleSubmit(salvar)} className="grid gap-4" noValidate>
        <Campo
          label="Nova senha"
          ajuda={textosAuth.ajudaSenha}
          erro={form.formState.errors.senha?.message}
        >
          <InputSenha autoComplete="new-password" {...form.register('senha')} />
        </Campo>
        <Campo label="Confirme a senha" erro={form.formState.errors.confirmacao?.message}>
          <InputSenha autoComplete="new-password" {...form.register('confirmacao')} />
        </Campo>
        {erro && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {erro}
          </p>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
          {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          Salvar senha
        </Button>
      </form>
    </AuthLayout>
  )
}

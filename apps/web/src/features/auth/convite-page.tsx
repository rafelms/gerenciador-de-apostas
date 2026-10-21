import { zodResolver } from '@hookform/resolvers/zod'
import { aceitarConviteSchema, type AceitarConviteInput } from '@shared/schemas/auth.ts'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { CarregandoTela } from '@/components/carregando-tela'
import { Campo } from '@/components/campo'
import { InputSenha } from '@/components/input-senha'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-provider'
import { AuthLayout } from './auth-layout'
import { textosAuth } from './textos'
import { useTokenDoLink } from './use-token-do-link'

/** Aceitar convite: o convidado define nome e senha no primeiro acesso. */
export function ConvitePage() {
  const estado = useTokenDoLink('invite')
  const { perfil, recarregar } = useAuth()
  const navigate = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const form = useForm<AceitarConviteInput>({
    resolver: zodResolver(aceitarConviteSchema),
    values: { nome: perfil?.nome ?? '', senha: '', confirmacao: '' },
    resetOptions: { keepDirtyValues: true },
  })

  if (estado === 'verificando') return <CarregandoTela />
  if (estado === 'invalido') {
    return (
      <AuthLayout
        titulo="Convite inválido"
        descricao="Este convite expirou ou já foi usado. Peça um novo convite ao administrador."
      >
        <span />
      </AuthLayout>
    )
  }

  async function aceitar({ nome, senha }: AceitarConviteInput) {
    setErro(null)
    const { data, error } = await supabase.auth.updateUser({ password: senha, data: { nome } })
    if (error || !data.user) {
      setErro(error?.code === 'weak_password' ? textosAuth.senhaFraca : textosAuth.erroGenerico)
      return
    }
    await supabase.from('profiles').update({ nome }).eq('id', data.user.id)
    await recarregar()
    toast.success(textosAuth.conviteAceito)
    navigate('/', { replace: true })
  }

  return (
    <AuthLayout titulo="Aceitar convite" descricao="Defina seu nome e uma senha para começar.">
      <form onSubmit={form.handleSubmit(aceitar)} className="grid gap-4" noValidate>
        <Campo label="Seu nome" erro={form.formState.errors.nome?.message}>
          <Input autoComplete="name" {...form.register('nome')} />
        </Campo>
        <Campo
          label="Senha"
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
          Começar a usar
        </Button>
      </form>
    </AuthLayout>
  )
}

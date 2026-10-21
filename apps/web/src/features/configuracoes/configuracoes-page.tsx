import { zodResolver } from '@hookform/resolvers/zod'
import { definirSenhaSchema, nomeSchema, type DefinirSenhaInput } from '@shared/schemas/auth.ts'
import { Loader2, LogOut, Monitor, Moon, ShieldAlert, Sun } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { useTema, type Tema } from '@/app/tema'
import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { InputSenha } from '@/components/input-senha'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/auth-provider'
import { textosAuth } from '@/features/auth/textos'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { SecaoMfa } from './secao-mfa'

const perfilSchema = z.object({ nome: nomeSchema })

const opcoesTema: { valor: Tema; rotulo: string; icone: typeof Sun }[] = [
  { valor: 'claro', rotulo: 'Claro', icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', icone: Moon },
  { valor: 'sistema', rotulo: 'Sistema', icone: Monitor },
]

export function ConfiguracoesPage() {
  const { perfil, recarregar } = useAuth()
  const { tema, setTema } = useTema()
  const [params] = useSearchParams()
  const pedidoMfaAdmin = params.get('motivo') === 'admin-mfa'

  const formPerfil = useForm<{ nome: string }>({
    resolver: zodResolver(perfilSchema),
    values: { nome: perfil?.nome ?? '' },
  })
  const formSenha = useForm<DefinirSenhaInput>({
    resolver: zodResolver(definirSenhaSchema),
    defaultValues: { senha: '', confirmacao: '' },
  })

  async function salvarPerfil({ nome }: { nome: string }) {
    if (!perfil) return
    const { error } = await supabase.from('profiles').update({ nome }).eq('id', perfil.id)
    if (error) return void toast.error(textosAuth.erroGenerico)
    await recarregar()
    toast.success('Nome atualizado.')
  }

  async function escolherTema(novo: Tema) {
    setTema(novo)
    if (!perfil) return
    // Também guardamos no perfil para seguir o usuário entre aparelhos (seção 12.2).
    const preferencias = { ...((perfil.preferencias as Record<string, unknown>) ?? {}), tema: novo }
    await supabase.from('profiles').update({ preferencias }).eq('id', perfil.id)
  }

  async function trocarSenha({ senha }: DefinirSenhaInput) {
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error)
      return void toast.error(
        error.code === 'weak_password' ? 'Senha fraca.' : textosAuth.erroGenerico,
      )
    formSenha.reset()
    toast.success(textosAuth.senhaAlterada)
  }

  async function sairDeTodos() {
    await supabase.auth.signOut({ scope: 'global' })
  }

  return (
    <>
      <CabecalhoPagina titulo="Configurações" />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Perfil</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={formPerfil.handleSubmit(salvarPerfil)}
              className="flex flex-wrap items-end gap-3"
              noValidate
            >
              <Campo
                label="Nome"
                erro={formPerfil.formState.errors.nome?.message}
                className="min-w-0 flex-1 basis-60"
              >
                <Input autoComplete="name" {...formPerfil.register('nome')} />
              </Campo>
              <Button type="submit" disabled={formPerfil.formState.isSubmitting}>
                Salvar
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Aparência</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2 sm:max-w-md">
              {opcoesTema.map(({ valor, rotulo, icone: Icone }) => (
                <button
                  key={valor}
                  type="button"
                  role="radio"
                  aria-checked={tema === valor}
                  onClick={() => void escolherTema(valor)}
                  className={cn(
                    'flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border text-sm font-medium transition-colors duration-150',
                    tema === valor
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  <Icone className="size-5" aria-hidden="true" />
                  {rotulo}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card id="seguranca">
          <CardHeader>
            <CardTitle>
              <h2>Segurança</h2>
            </CardTitle>
            <CardDescription>Senha, verificação em duas etapas e sessões.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {pedidoMfaAdmin && (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-alerta/40 bg-alerta/10 p-3 text-sm"
              >
                <ShieldAlert className="size-5 shrink-0 text-alerta" aria-hidden="true" />A área de
                administração exige a verificação em duas etapas. Ative abaixo para continuar.
              </div>
            )}
            <SecaoMfa />

            <form
              onSubmit={formSenha.handleSubmit(trocarSenha)}
              className="grid gap-4 border-t pt-6"
              noValidate
            >
              <h3 className="font-medium">Trocar senha</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo
                  label="Nova senha"
                  ajuda={textosAuth.ajudaSenha}
                  erro={formSenha.formState.errors.senha?.message}
                >
                  <InputSenha autoComplete="new-password" {...formSenha.register('senha')} />
                </Campo>
                <Campo
                  label="Confirme a senha"
                  erro={formSenha.formState.errors.confirmacao?.message}
                >
                  <InputSenha autoComplete="new-password" {...formSenha.register('confirmacao')} />
                </Campo>
              </div>
              <div>
                <Button type="submit" disabled={formSenha.formState.isSubmitting}>
                  {formSenha.formState.isSubmitting && (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  )}
                  Trocar senha
                </Button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
              <div>
                <p className="font-medium">Sair de todos os dispositivos</p>
                <p className="text-sm text-muted-foreground">
                  Encerra as sessões abertas em qualquer aparelho.
                </p>
              </div>
              <ConfirmDialog
                titulo="Sair de todos os dispositivos?"
                descricao="Você vai precisar entrar de novo em todos os aparelhos, inclusive neste."
                textoConfirmar="Sair de todos"
                onConfirmar={sairDeTodos}
              >
                <Button variant="outline">
                  <LogOut aria-hidden="true" /> Sair de todos
                </Button>
              </ConfirmDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

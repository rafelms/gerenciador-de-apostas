import { zodResolver } from '@hookform/resolvers/zod'
import { convidarUsuarioSchema, type ConvidarUsuarioInput } from '@shared/schemas/auth.ts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { CabecalhoPagina } from '@/components/cabecalho-pagina'
import { Campo } from '@/components/campo'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-provider'
import { formatarDataHora } from '@/lib/formatadores'
import {
  chavesAdmin,
  convidarUsuario,
  desativarUsuario,
  listarUsuarios,
  reativarUsuario,
} from './api'

const LIMITE = 5

function DialogConvite({ desabilitado }: { desabilitado: boolean }) {
  const [aberto, setAberto] = useState(false)
  const queryClient = useQueryClient()
  const form = useForm<ConvidarUsuarioInput>({
    resolver: zodResolver(convidarUsuarioSchema),
    defaultValues: { email: '', nome: '' },
  })
  const mutacao = useMutation({
    mutationFn: convidarUsuario,
    onSuccess: () => {
      toast.success('Convite enviado.')
      void queryClient.invalidateQueries({ queryKey: chavesAdmin.usuarios })
      form.reset()
      setAberto(false)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button disabled={desabilitado}>
          <UserPlus aria-hidden="true" /> Convidar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>A pessoa recebe um e-mail para definir a senha.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((d) => mutacao.mutate(d))}
          className="grid gap-4"
          noValidate
        >
          <Campo label="Nome" erro={form.formState.errors.nome?.message}>
            <Input autoComplete="off" {...form.register('nome')} />
          </Campo>
          <Campo label="E-mail" erro={form.formState.errors.email?.message}>
            <Input type="email" inputMode="email" autoComplete="off" {...form.register('email')} />
          </Campo>
          <DialogFooter>
            <Button type="submit" disabled={mutacao.isPending}>
              {mutacao.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Enviar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsuariosPage() {
  const { perfil } = useAuth()
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: chavesAdmin.usuarios, queryFn: listarUsuarios })

  const alterar = useMutation({
    mutationFn: ({ id, ativar }: { id: string; ativar: boolean }) =>
      ativar ? reativarUsuario(id) : desativarUsuario(id),
    onSuccess: (_d, { ativar }) => {
      toast.success(ativar ? 'Usuário reativado.' : 'Usuário desativado e desconectado.')
      void queryClient.invalidateQueries({ queryKey: chavesAdmin.usuarios })
    },
    onError: (e) => toast.error(e.message),
  })

  const usuarios = consulta.data ?? []
  const ativos = usuarios.filter((u) => u.ativo).length

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários"
        descricao={`${ativos} de ${LIMITE} usuários ativos.`}
        acoes={<DialogConvite desabilitado={ativos >= LIMITE} />}
      />

      {consulta.isPending && (
        <div className="grid gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {consulta.isError && (
        <EmptyState
          icone={Users}
          titulo="Não foi possível carregar os usuários"
          acao={
            <Button variant="outline" onClick={() => void consulta.refetch()}>
              <RefreshCw aria-hidden="true" /> Tentar de novo
            </Button>
          }
        />
      )}

      {consulta.isSuccess && (
        <ul className="grid gap-3">
          {usuarios.map((u) => (
            <li key={u.id}>
              <Card className="py-0">
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{u.nome}</span>
                      {u.papel === 'admin' && <Badge>Admin</Badge>}
                      {!u.ativo && <Badge variant="destructive">Desativado</Badge>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Último acesso: {u.ultimo_acesso ? formatarDataHora(u.ultimo_acesso) : 'nunca'}
                    </p>
                  </div>
                  {u.id !== perfil?.id &&
                    (u.ativo ? (
                      <ConfirmDialog
                        titulo={`Desativar ${u.nome}?`}
                        descricao="A pessoa é desconectada de todos os aparelhos e perde o acesso até ser reativada. Os dados dela são mantidos."
                        textoConfirmar="Desativar"
                        destrutivo
                        onConfirmar={() => alterar.mutateAsync({ id: u.id, ativar: false })}
                      >
                        <Button variant="outline">Desativar</Button>
                      </ConfirmDialog>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={ativos >= LIMITE || alterar.isPending}
                        onClick={() => alterar.mutate({ id: u.id, ativar: true })}
                      >
                        Reativar
                      </Button>
                    ))}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

import { Bell, LogOut, Settings } from 'lucide-react'
import { Link, useNavigate } from 'react-router'

import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/auth-provider'
import { useNotificacoes, useNotificacoesAoVivo } from '@/features/notificacoes/use-notificacoes'

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return (
    (partes[0]?.[0] ?? '') + (partes.length > 1 ? (partes.at(-1)?.[0] ?? '') : '')
  ).toUpperCase()
}

export function BarraSuperior() {
  const { perfil, sair } = useAuth()
  const navigate = useNavigate()
  const { naoLidas } = useNotificacoes()
  useNotificacoesAoVivo()

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 lg:h-16 lg:px-8">
        <Link to="/" className="lg:hidden" aria-label="LotoGestor — início">
          <Logo className="text-base" />
        </Link>
        {/* Seletor de período do dashboard entra aqui na Fase 4 (seção 12.5). */}
        <div className="flex-1" />
        <Button variant="ghost" size="icon" asChild className="relative">
          <Link
            to="/notificacoes"
            aria-label={
              naoLidas > 0
                ? `Notificações, ${naoLidas} não ${naoLidas === 1 ? 'lida' : 'lidas'}`
                : 'Notificações'
            }
          >
            <Bell aria-hidden="true" />
            {naoLidas > 0 && (
              <span
                className="absolute top-1 right-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs leading-5 font-semibold text-white tabular-nums"
                aria-hidden="true"
              >
                {naoLidas > 9 ? '9+' : naoLidas}
              </span>
            )}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Menu da conta">
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {perfil ? iniciais(perfil.nome) : '?'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{perfil?.nome}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11" onSelect={() => navigate('/configuracoes')}>
              <Settings aria-hidden="true" /> Configurações
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onSelect={() => void sair()}>
              <LogOut aria-hidden="true" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

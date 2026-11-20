import { Menu } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/auth-provider'
import { cn } from '@/lib/utils'
import { navMais, navPrincipal } from './navegacao'

const classeItem =
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition-colors duration-150'

/** Barra inferior do mobile (< lg), pílula escura flutuante: Início, Apostas, [+] Nova, Calendário, Mais. */
export function BarraInferior() {
  const { ehAdmin } = useAuth()
  const [maisAberto, setMaisAberto] = useState(false)
  const { pathname } = useLocation()
  const mais = navMais.filter((i) => !i.admin || ehAdmin)
  const maisAtivo = mais.some((i) => pathname.startsWith(i.rota))

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch gap-1 rounded-full bg-tinta p-1.5 text-tinta-foreground shadow-lg">
        {navPrincipal.map((item) => {
          const Icone = item.icone
          const ehNova = item.rota === '/apostas/nova'
          return (
            <li key={item.rota} className="flex flex-1">
              <NavLink
                to={item.rota}
                end
                className={({ isActive }) =>
                  cn(
                    classeItem,
                    isActive && !ehNova
                      ? 'bg-white/10 text-tinta-foreground'
                      : 'text-tinta-muted hover:text-tinta-foreground',
                  )
                }
              >
                {ehNova ? (
                  <>
                    {/* Botão central destacado em menta */}
                    <span className="flex size-12 items-center justify-center rounded-full bg-menta text-menta-foreground">
                      <Icone className="size-6" aria-hidden="true" />
                    </span>
                    <span className="sr-only">Nova aposta</span>
                  </>
                ) : (
                  <>
                    <Icone className="size-5" aria-hidden="true" />
                    <span>{item.rotulo}</span>
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
        <li className="flex flex-1">
          <Sheet open={maisAberto} onOpenChange={setMaisAberto}>
            <SheetTrigger
              className={cn(
                classeItem,
                maisAtivo
                  ? 'bg-white/10 text-tinta-foreground'
                  : 'text-tinta-muted hover:text-tinta-foreground',
              )}
            >
              <Menu className="size-5" aria-hidden="true" />
              <span>Mais</span>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
            >
              <SheetHeader>
                <SheetTitle>Mais opções</SheetTitle>
                <SheetDescription className="sr-only">Outras áreas do LotoGestor</SheetDescription>
              </SheetHeader>
              <ul className="grid grid-cols-3 gap-2 px-4">
                {mais.map((item) => {
                  const Icone = item.icone
                  return (
                    <li key={item.rota}>
                      <NavLink
                        to={item.rota}
                        onClick={() => setMaisAberto(false)}
                        className={({ isActive }) =>
                          cn(
                            'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl p-2 text-center text-xs font-medium transition-colors duration-150',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted hover:bg-accent',
                          )
                        }
                      >
                        <Icone className="size-6" aria-hidden="true" />
                        {item.rotulo}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  )
}

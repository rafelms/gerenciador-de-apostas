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
  'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors duration-150'

/** Bottom nav do mobile (< lg): Início, Apostas, [+] Nova, Calendário, Mais. */
export function BarraInferior() {
  const { ehAdmin } = useAuth()
  const [maisAberto, setMaisAberto] = useState(false)
  const { pathname } = useLocation()
  const mais = navMais.filter((i) => !i.admin || ehAdmin)
  const maisAtivo = mais.some((i) => pathname.startsWith(i.rota))

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {navPrincipal.map((item) => {
          const Icone = item.icone
          const ehNova = item.rota === '/apostas/nova'
          return (
            <li key={item.rota} className="flex flex-1">
              <NavLink
                to={item.rota}
                end
                className={({ isActive }) =>
                  cn(classeItem, isActive && !ehNova ? 'text-foreground' : 'text-muted-foreground')
                }
              >
                {ehNova ? (
                  <>
                    {/* Botão central destacado */}
                    <span className="-mt-5 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
                      <Icone className="size-7" aria-hidden="true" />
                    </span>
                    <span>Nova aposta</span>
                  </>
                ) : (
                  <>
                    <Icone className="size-6" aria-hidden="true" />
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
              className={cn(classeItem, maisAtivo ? 'text-foreground' : 'text-muted-foreground')}
            >
              <Menu className="size-6" aria-hidden="true" />
              <span>Mais</span>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
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
                            'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg p-2 text-center text-xs font-medium transition-colors duration-150',
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

import { NavLink } from 'react-router'

import { Logo } from '@/components/logo'
import { useAuth } from '@/features/auth/auth-provider'
import { cn } from '@/lib/utils'
import { navMais, navPrincipal, type ItemNav } from './navegacao'

function LinkLateral({ item }: { item: ItemNav }) {
  const Icone = item.icone
  return (
    <NavLink
      to={item.rota}
      end={item.rota === '/' || item.rota === '/apostas'}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <Icone className="size-5" aria-hidden="true" />
      {item.rotulo}
    </NavLink>
  )
}

/** Sidebar fixa, visível só no desktop (≥ lg). */
export function BarraLateral() {
  const { ehAdmin } = useAuth()
  const mais = navMais.filter((i) => !i.admin || ehAdmin)

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card lg:flex">
      <div className="flex h-16 items-center px-6">
        <Logo className="text-lg" />
      </div>
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 pb-6">
        <ul className="grid gap-1">
          {navPrincipal.map((item) => (
            <li key={item.rota}>
              <LinkLateral item={item} />
            </li>
          ))}
        </ul>
        <p className="mt-6 mb-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Mais
        </p>
        <ul className="grid gap-1">
          {mais.map((item) => (
            <li key={item.rota}>
              <LinkLateral item={item} />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

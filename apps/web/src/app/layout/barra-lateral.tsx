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
          'flex min-h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-menta text-menta-foreground'
            : 'text-tinta-muted hover:bg-white/8 hover:text-tinta-foreground',
        )
      }
    >
      <Icone className="size-5" aria-hidden="true" />
      {item.rotulo}
    </NavLink>
  )
}

/** Painel lateral escuro e flutuante, visível só no desktop (≥ lg). */
export function BarraLateral() {
  const { ehAdmin } = useAuth()
  const mais = navMais.filter((i) => !i.admin || ehAdmin)

  return (
    <aside className="fixed inset-y-3 left-3 z-30 hidden w-64 flex-col rounded-2xl bg-tinta text-tinta-foreground shadow-card lg:flex">
      <div className="flex h-20 items-center px-6">
        <Logo className="text-xl" escuro />
      </div>
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 pb-6">
        <ul className="grid gap-1">
          {navPrincipal.map((item) => (
            <li key={item.rota}>
              <LinkLateral item={item} />
            </li>
          ))}
        </ul>
        <p className="mt-6 mb-2 px-4 text-xs font-semibold tracking-wide text-tinta-muted uppercase">
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

import { Outlet } from 'react-router'

import { BarraInferior } from './barra-inferior'
import { BarraSuperior } from './barra-superior'
import { BarraLateral } from './barra-lateral'

/**
 * Casca do app autenticado.
 * Mobile: barra superior + conteúdo + bottom nav fixa.
 * Desktop (≥ lg): sidebar fixa à esquerda + barra superior + conteúdo.
 */
export function AppLayout() {
  return (
    <div className="min-h-dvh lg:pl-64">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>
      <BarraLateral />
      <BarraSuperior />
      <main
        id="conteudo"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none lg:px-8 lg:pb-10"
      >
        <Outlet />
      </main>
      <BarraInferior />
    </div>
  )
}

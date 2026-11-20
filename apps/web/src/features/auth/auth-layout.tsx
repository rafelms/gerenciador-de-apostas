import type { ReactNode } from 'react'

import { Logo } from '@/components/logo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthLayoutProps {
  titulo: string
  descricao?: ReactNode
  children: ReactNode
  rodape?: ReactNode
}

/**
 * Moldura das telas públicas, um objetivo por tela. No desktop, um painel escuro com a
 * proposta do app à esquerda; no celular, só o formulário.
 */
export function AuthLayout({ titulo, descricao, children, rodape }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh">
      <aside className="m-3 hidden w-[44%] max-w-2xl flex-col justify-between rounded-2xl bg-tinta p-10 text-tinta-foreground lg:flex">
        <Logo className="text-2xl" escuro />
        <div className="grid gap-8">
          <p className="font-display text-5xl leading-[1.05] font-light tracking-tight">
            Cada aposta, cada prêmio, <span className="font-semibold">num número só.</span>
          </p>
          <div className="grid max-w-sm gap-3 rounded-2xl bg-white/6 p-5" aria-hidden="true">
            <span className="text-sm text-tinta-muted">Saldo do período</span>
            <span className="font-display text-4xl font-light tabular-nums">
              +R$ 953<span className="opacity-45">,00</span>
            </span>
            <span className="w-fit rounded-full bg-menta px-2.5 py-0.5 text-xs font-medium text-menta-foreground">
              ROI +12,4%
            </span>
          </div>
        </div>
        <p className="text-sm text-tinta-muted">
          Gasto, prêmios, bolões e orçamento das suas loterias, só para convidados.
        </p>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
        <Logo className="text-2xl lg:hidden" />
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">
              <h1>{titulo}</h1>
            </CardTitle>
            {descricao && <CardDescription>{descricao}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {rodape && <div className="text-sm text-muted-foreground">{rodape}</div>}
      </main>
    </div>
  )
}

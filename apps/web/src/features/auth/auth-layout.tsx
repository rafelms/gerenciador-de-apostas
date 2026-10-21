import type { ReactNode } from 'react'

import { Logo } from '@/components/logo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthLayoutProps {
  titulo: string
  descricao?: ReactNode
  children: ReactNode
  rodape?: ReactNode
}

/** Moldura das telas públicas: coluna única, centralizada, um objetivo por tela. */
export function AuthLayout({ titulo, descricao, children, rodape }: AuthLayoutProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo className="text-2xl" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            <h1>{titulo}</h1>
          </CardTitle>
          {descricao && <CardDescription>{descricao}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {rodape && <div className="text-sm text-muted-foreground">{rodape}</div>}
    </main>
  )
}

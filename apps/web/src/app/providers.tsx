import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useState, type ReactNode } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/auth-provider'
import { devePersistir, IDADE_MAXIMA_MS, persister, VERSAO_CACHE } from './cache-offline'
import { TemaProvider } from './tema'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // gcTime ≥ idade do cache salvo, senão a cópia offline some da memória antes.
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
            gcTime: IDADE_MAXIMA_MS,
          },
          // Offline é só leitura: a gravação falha na hora (com a mensagem da tela) em vez de
          // ficar na fila e disparar depois, com dados que podem ter mudado.
          mutations: { networkMode: 'always' },
        },
      }),
  )

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: IDADE_MAXIMA_MS,
        buster: VERSAO_CACHE,
        dehydrateOptions: { shouldDehydrateQuery: devePersistir },
      }}
    >
      <TemaProvider>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </TemaProvider>
    </PersistQueryClientProvider>
  )
}

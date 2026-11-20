import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/features/auth/auth-provider'
import { TemaProvider } from './tema'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TemaProvider>
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </TemaProvider>
    </QueryClientProvider>
  )
}

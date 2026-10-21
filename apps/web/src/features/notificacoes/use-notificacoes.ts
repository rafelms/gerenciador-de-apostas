import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/features/auth/auth-provider'
import { chaves } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'
import { listarNotificacoes } from './api'

/**
 * Notificações do usuário (seção 11.11). De reserva ao Realtime, busca de novo a
 * cada 60 s. Pode ser usado em vários componentes: o cache é compartilhado.
 */
export function useNotificacoes() {
  const { perfil } = useAuth()
  const consulta = useQuery({
    queryKey: chaves.notificacoes,
    queryFn: listarNotificacoes,
    enabled: !!perfil,
    refetchInterval: 60_000,
  })
  const naoLidas = consulta.data?.filter((n) => !n.lida_em).length ?? 0
  return { ...consulta, naoLidas }
}

/**
 * Assinatura do Supabase Realtime filtrada por user_id. Montar UMA vez (barra
 * superior): o supabase-js reaproveita o canal pelo nome e não aceita novos
 * callbacks depois do subscribe(). Uma notificação nova também invalida as apostas
 * (o resultado acabou de sair).
 */
export function useNotificacoesAoVivo() {
  const { perfil } = useAuth()
  const userId = perfil?.id
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    const canal = supabase
      .channel(`notificacoes:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: `user_id=eq.${userId}`,
        },
        (mudanca) => {
          const titulo = (mudanca.new as { titulo?: string }).titulo
          if (titulo) toast.info(titulo)
          void queryClient.invalidateQueries({ queryKey: chaves.notificacoes })
          void queryClient.invalidateQueries({ queryKey: chaves.apostas })
        },
      )
      // Ao confirmar a inscrição, busca de novo: cobre o que chegou entre a 1ª busca e o canal ficar pronto.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED')
          void queryClient.invalidateQueries({ queryKey: chaves.notificacoes })
      })
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [userId, queryClient])
}

import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'

export type Notificacao = Pick<
  Tables<'notificacoes'>,
  'id' | 'tipo' | 'titulo' | 'corpo' | 'link' | 'lida_em' | 'created_at'
>

/** As 100 notificações mais recentes do usuário (a RLS filtra por dono). */
export async function listarNotificacoes(): Promise<Notificacao[]> {
  const { data, error } = await supabase
    .from('notificacoes')
    .select('id, tipo, titulo, corpo, link, lida_em, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data
}

/** Marca como lidas (sem ids = todas as não lidas). Só a coluna lida_em tem GRANT. */
export async function marcarComoLidas(ids?: string[]) {
  let q = supabase
    .from('notificacoes')
    .update({ lida_em: new Date().toISOString() })
    .is('lida_em', null)
  if (ids) q = q.in('id', ids)
  const { error } = await q
  if (error) throw new Error('Não foi possível marcar como lida.')
}

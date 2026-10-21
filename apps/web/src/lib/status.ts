import type { Enums } from '@/types/database'

export type StatusAposta = Enums<'status_aposta'>

export const rotulosStatus: Record<StatusAposta, string> = {
  aguardando: 'Aguardando',
  conferida: 'Em andamento',
  premiada: 'Premiada',
  nao_premiada: 'Não premiada',
  cancelada: 'Cancelada',
}

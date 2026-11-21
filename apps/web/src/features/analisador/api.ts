import type { FaixaDezenas } from '@shared/analisador.ts'

import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'

export const chavesAnalisador = {
  apostas: ['apostas', 'analisador'] as const,
  jogos: (apostaId: string) => ['apostas', 'analisador', 'jogos', apostaId] as const,
  historico: (modalidadeId: number, limite: number) =>
    ['concursos', 'historico', modalidadeId, limite] as const,
}

export interface ApostaParaAnalisar {
  id: string
  modalidadeId: number
  modalidadeNome: string
  concursoInicial: number
  dataAposta: string
  qtdJogos: number
}

/** As 100 apostas mais recentes do usuário (a RLS já restringe ao dono). */
export async function apostasParaAnalisar(): Promise<ApostaParaAnalisar[]> {
  const { data, error } = await supabase
    .from('vw_apostas_resumo')
    .select('id, modalidade_id, modalidade_nome, concurso_inicial, data_aposta, qtd_jogos')
    .gt('qtd_jogos', 0)
    .order('data_aposta', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data.map((a) => ({
    id: a.id!,
    modalidadeId: a.modalidade_id!,
    modalidadeNome: a.modalidade_nome ?? '',
    concursoInicial: a.concurso_inicial ?? 0,
    dataAposta: a.data_aposta ?? '',
    qtdJogos: a.qtd_jogos ?? 0,
  }))
}

export async function jogosDaAposta(apostaId: string): Promise<number[][]> {
  const { data, error } = await supabase
    .from('aposta_jogos')
    .select('dezenas')
    .eq('aposta_id', apostaId)
    .order('ordem')
  if (error) throw error
  return data.map((j) => j.dezenas)
}

export interface Historico {
  /** Do mais recente para o mais antigo. */
  concursos: { numero: number; dezenas: number[] }[]
}

/** Os `limite` concursos sorteados mais recentes da modalidade. */
export async function historicoConcursos(modalidadeId: number, limite: number): Promise<Historico> {
  const { data, error } = await supabase
    .from('concursos')
    .select('numero, dezenas')
    .eq('modalidade_id', modalidadeId)
    .not('dezenas', 'is', null)
    .order('numero', { ascending: false })
    .limit(limite)
  if (error) throw error
  return { concursos: data.map((c) => ({ numero: c.numero, dezenas: c.dezenas! })) }
}

/** Preferências do analisador por modalidade, guardadas em `profiles.preferencias`. */
export interface PreferenciasAnalisador {
  faixas?: Record<string, FaixaDezenas[]>
  limite?: Record<string, number>
}

export function lerPreferencias(preferencias: unknown): PreferenciasAnalisador {
  const p = (preferencias as { analisador?: PreferenciasAnalisador } | null)?.analisador
  return p && typeof p === 'object' ? p : {}
}

export async function salvarPreferencias(
  userId: string,
  preferenciasAtuais: unknown,
  analisador: PreferenciasAnalisador,
) {
  const base = (preferenciasAtuais as Record<string, unknown> | null) ?? {}
  const { error } = await supabase
    .from('profiles')
    .update({
      preferencias: {
        ...base,
        analisador: { ...lerPreferencias(base), ...analisador },
      } as unknown as {
        [chave: string]: Json
      },
    })
    .eq('id', userId)
  if (error) throw new Error('Não foi possível salvar as preferências.')
}

import {
  ehSlugSuportado,
  obterRegra,
  type RegraModalidade,
  type SlugModalidade,
} from '@shared/regras/index.ts'
import { useQuery } from '@tanstack/react-query'

import { chaves } from '@/lib/query-keys'
import { supabase } from '@/lib/supabase'

/**
 * O que fica no cache do TanStack Query: só dados serializáveis. O cache é salvo no
 * aparelho para o modo offline (seção 11.14) em JSON, que perde funções. Por isso a
 * `regra` (com validarJogo, custoJogo…) não vai para o cache: entra no `select`.
 */
export type ModalidadeDados = Omit<Modalidade, 'regra'>

export interface Modalidade {
  id: number
  slug: SlugModalidade
  nome: string
  cor: string
  regra: RegraModalidade
  /** Preços com vigência, do mais recente para o mais antigo. */
  precos: { vigenteDesde: string; centavos: number }[]
}

/**
 * Junta a regra de cada modalidade aos dados do cache. Também conserta cópias antigas do
 * cache que gravaram `regra` como objeto sem funções (o `regra` delas é sobrescrito).
 */
export function comRegras(lista: ModalidadeDados[]): Modalidade[] {
  return lista.map((m) => ({ ...m, regra: obterRegra(m.slug) }))
}

async function carregarModalidades(): Promise<ModalidadeDados[]> {
  const { data, error } = await supabase
    .from('modalidades')
    .select(
      'id, slug, nome, cor_hex, ativa, modalidade_precos (preco_simples_centavos, vigente_desde)',
    )
    .eq('ativa', true)
    .order('id')
  if (error) throw error

  return data
    .filter((m) => ehSlugSuportado(m.slug))
    .map((m) => ({
      id: m.id,
      slug: m.slug as SlugModalidade,
      nome: m.nome,
      cor: m.cor_hex ?? '#6A6F9E',
      precos: m.modalidade_precos
        .map((p) => ({ vigenteDesde: p.vigente_desde, centavos: p.preco_simples_centavos }))
        .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde)),
    }))
}

/** Catálogo de modalidades ativas (muda raramente: cache longo). */
export function useModalidades() {
  return useQuery({
    queryKey: chaves.modalidades,
    queryFn: carregarModalidades,
    // Função estável: o TanStack só recalcula quando os dados mudam.
    select: comRegras,
    staleTime: 60 * 60 * 1000,
  })
}

/** Preço da aposta simples vigente na data (yyyy-mm-dd). */
export function precoVigente(modalidade: Modalidade, data: string): number | null {
  return modalidade.precos.find((p) => p.vigenteDesde <= data)?.centavos ?? null
}

import { supabase } from '@/lib/supabase'
import { apostasFiltradas } from '@/features/apostas/api'
import { VIRADA, type ItemVirada } from './virada'

export async function listarItens(): Promise<ItemVirada[]> {
  const { data, error } = await supabase
    .from('virada_itens')
    .select('id, descricao, valor_previsto_centavos, feito')
    .eq('concurso', VIRADA.concurso)
    .order('created_at')
  if (error) throw error
  return data
}

export async function criarItem(descricao: string, valorPrevistoCentavos: number | null) {
  const { error } = await supabase.from('virada_itens').insert({
    concurso: VIRADA.concurso,
    descricao,
    valor_previsto_centavos: valorPrevistoCentavos,
  })
  if (error) throw new Error('Não foi possível adicionar. Confira a descrição e o valor.')
}

export async function marcarItem(id: string, feito: boolean) {
  const { error } = await supabase.from('virada_itens').update({ feito }).eq('id', id)
  if (error) throw new Error('Não foi possível atualizar o item. Tente de novo.')
}

export async function excluirItem(id: string) {
  const { error } = await supabase.from('virada_itens').delete().eq('id', id)
  if (error) throw new Error('Não foi possível remover o item. Tente de novo.')
}

/** Apostas da Mega-Sena que cobrem o concurso da Virada, e quantas dezenas tem cada jogo. */
export async function apostasDaVirada() {
  const { data, error } = await apostasFiltradas({
    modalidade: VIRADA.modalidadeSlug,
    concurso: VIRADA.concurso,
    ordem: 'data',
    direcao: 'desc',
  }).order('created_at', { ascending: false })
  if (error) throw error

  const ids = data.flatMap((a) => (a.id ? [a.id] : []))
  let dezenasPorJogo: number[] = []
  if (ids.length > 0) {
    const jogos = await supabase.from('aposta_jogos').select('dezenas').in('aposta_id', ids)
    if (jogos.error) throw jogos.error
    dezenasPorJogo = jogos.data.map((j) => j.dezenas.length)
  }
  return { apostas: data, dezenasPorJogo }
}

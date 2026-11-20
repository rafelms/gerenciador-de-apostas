// Orçamento mensal (seção 11.9). O gasto vem da fn_orcamento_mes (mesma regra da lista);
// os limites são linhas de `orcamentos` (RLS: só do dono).

import { supabase } from '@/lib/supabase'

export interface Orcamento {
  id: string
  modalidadeId: number | null
  modalidadeSlug: string | null
  modalidadeNome: string | null
  modalidadeCor: string | null
  limite: number
  gasto: number
}

/** `mes` = "2026-11". */
export async function orcamentosDoMes(mes: string): Promise<Orcamento[]> {
  const { data, error } = await supabase.rpc('fn_orcamento_mes', { p_mes: `${mes}-01` })
  if (error) throw error
  return data.map((o) => ({
    id: o.id,
    modalidadeId: o.modalidade_id,
    modalidadeSlug: o.modalidade_slug,
    modalidadeNome: o.modalidade_nome,
    modalidadeCor: o.modalidade_cor,
    limite: o.limite_centavos,
    gasto: o.gasto_centavos,
  }))
}

function traduzir(error: { code?: string; message: string }): Error {
  if (error.code === '23505') return new Error('Já existe um orçamento para isso neste mês.')
  if (error.code === '23514') return new Error('Informe um limite entre R$ 0,01 e R$ 1.000.000,00.')
  return new Error(error.message)
}

export async function criarOrcamento(mes: string, limite: number, modalidadeId: number | null) {
  const { error } = await supabase
    .from('orcamentos')
    .insert({ mes: `${mes}-01`, limite_centavos: limite, modalidade_id: modalidadeId })
  if (error) throw traduzir(error)
}

export async function alterarLimite(id: string, limite: number) {
  const { error } = await supabase
    .from('orcamentos')
    .update({ limite_centavos: limite })
    .eq('id', id)
  if (error) throw traduzir(error)
}

export async function excluirOrcamento(id: string) {
  const { error } = await supabase.from('orcamentos').delete().eq('id', id)
  if (error) throw traduzir(error)
}

/** Copia os limites de um mês para outro (os que já existem no destino ficam). */
export async function copiarLimites(de: Orcamento[], para: string, existentes: Orcamento[]) {
  const ja = new Set(existentes.map((o) => o.modalidadeId))
  const novos = de
    .filter((o) => !ja.has(o.modalidadeId))
    .map((o) => ({ mes: `${para}-01`, limite_centavos: o.limite, modalidade_id: o.modalidadeId }))
  if (novos.length === 0) return 0
  const { error } = await supabase.from('orcamentos').insert(novos)
  if (error) throw traduzir(error)
  return novos.length
}

export type NivelOrcamento = 'ok' | 'alerta' | 'estourado'

/** Mesmos limiares do aviso por notificação: 80% e 100%. */
export function nivelOrcamento(gasto: number, limite: number): NivelOrcamento {
  if (gasto >= limite) return 'estourado'
  if (gasto * 100 >= limite * 80) return 'alerta'
  return 'ok'
}

export function nomeOrcamento(o: Pick<Orcamento, 'modalidadeNome'>) {
  return o.modalidadeNome ?? 'Geral'
}

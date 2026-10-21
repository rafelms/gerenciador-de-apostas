import { apostaParaRpc, type ApostaInput } from '@shared/schemas/aposta.ts'

import { supabase } from '@/lib/supabase'
import type { Enums, Tables } from '@/types/database'
import type { ApostaParaCopiar } from './texto-copia'

export type ResumoAposta = Tables<'vw_apostas_resumo'>
export type TipoAposta = Enums<'tipo_aposta'>
export type StatusAposta = Enums<'status_aposta'>
export type OrigemAposta = Enums<'origem_aposta'>

export const TAMANHO_PAGINA = 20

export interface FiltrosApostas {
  modalidade?: string | undefined
  tipo?: TipoAposta | undefined
  status?: StatusAposta | undefined
  origem?: OrigemAposta | undefined
  de?: string | undefined
  ate?: string | undefined
  premiadas?: boolean | undefined
  concurso?: number | undefined
  ordem: 'data' | 'valor' | 'saldo'
  direcao: 'asc' | 'desc'
}

const colunaOrdem = {
  data: 'data_aposta',
  valor: 'valor_pago_centavos',
  saldo: 'saldo_centavos',
} as const

/** Resumo das apostas com os filtros da lista aplicados (sem ordem nem página). */
function apostasFiltradas(filtros: FiltrosApostas) {
  let q = supabase.from('vw_apostas_resumo').select('*')
  if (filtros.modalidade) q = q.eq('modalidade_slug', filtros.modalidade)
  if (filtros.tipo) q = q.eq('tipo', filtros.tipo)
  if (filtros.status) q = q.eq('status', filtros.status)
  if (filtros.origem) q = q.eq('origem', filtros.origem)
  if (filtros.de) q = q.gte('data_aposta', filtros.de)
  if (filtros.ate) q = q.lte('data_aposta', filtros.ate)
  if (filtros.premiadas) q = q.eq('status', 'premiada')
  if (filtros.concurso)
    q = q.lte('concurso_inicial', filtros.concurso).gte('concurso_final', filtros.concurso)
  return q
}

/** Uma página da lista de apostas (paginação por faixa, 20 por vez). */
export async function listarApostas(filtros: FiltrosApostas, pagina: number) {
  const inicio = pagina * TAMANHO_PAGINA
  const { data, error } = await apostasFiltradas(filtros)
    .order(colunaOrdem[filtros.ordem], { ascending: filtros.direcao === 'asc' })
    .order('created_at', { ascending: false })
    .range(inicio, inicio + TAMANHO_PAGINA - 1)
  if (error) throw error
  return data
}

/**
 * Ids de TODAS as apostas de um dia com os filtros da lista, na ordem da lista. Não depende
 * da paginação: o lote do dia pode ter apostas que ainda não foram carregadas na tela.
 */
export async function idsDoDia(filtros: FiltrosApostas, dia: string) {
  const { data, error } = await apostasFiltradas(filtros)
    .eq('data_aposta', dia)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.flatMap((a) => (a.id ? [a.id] : []))
}

/** Modalidade, concursos e jogos das apostas, para copiar como texto (na ordem dos ids). */
export async function apostasParaCopiar(ids: string[]): Promise<ApostaParaCopiar[]> {
  const { data, error } = await supabase
    .from('apostas')
    .select(
      'id, tipo, concurso_inicial, qtd_concursos, modalidades (nome), aposta_jogos (ordem, dezenas)',
    )
    .in('id', ids)
  if (error) throw error
  const porId = new Map(data.map((a) => [a.id, a]))
  return ids.flatMap((id) => {
    const a = porId.get(id)
    if (!a) return []
    return [
      {
        modalidadeNome: a.modalidades?.nome ?? '',
        tipo: a.tipo,
        concursoInicial: a.concurso_inicial,
        qtdConcursos: a.qtd_concursos,
        jogos: [...a.aposta_jogos].sort((x, y) => x.ordem - y.ordem).map((j) => j.dezenas),
      },
    ]
  })
}

/** Aposta completa para o detalhe e para a edição. */
export async function carregarAposta(id: string) {
  const { data, error } = await supabase
    .from('apostas')
    .select(
      `*, modalidades (slug, nome, cor_hex),
       aposta_jogos (id, ordem, dezenas),
       participantes (id, nome, peso, eh_usuario, contribuicao_centavos, ordem)`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    ...data,
    aposta_jogos: [...data.aposta_jogos].sort((a, b) => a.ordem - b.ordem),
    participantes: [...data.participantes].sort((a, b) => a.ordem - b.ordem),
  }
}

export type ApostaCompleta = NonNullable<Awaited<ReturnType<typeof carregarAposta>>>

/** Cria (sem id) ou edita (com id) a aposta inteira numa transação (RPC salvar_aposta). */
export async function salvarAposta(aposta: ApostaInput, id?: string) {
  const { data, error } = await supabase.rpc('salvar_aposta', {
    p_aposta: apostaParaRpc(aposta),
    ...(id ? { p_id: id } : {}),
  })
  if (error) throw new Error(mensagemDoBanco(error.message))
  return data
}

export async function excluirApostas(ids: string[]) {
  const { error } = await supabase.from('apostas').delete().in('id', ids)
  if (error) throw new Error('Não foi possível excluir. Tente de novo.')
}

/** Último concurso conhecido da modalidade (para sugerir o próximo). */
export async function ultimoConcurso(modalidadeId: number) {
  const { data, error } = await supabase
    .from('concursos')
    .select('numero, data_sorteio, data_proximo, dezenas')
    .eq('modalidade_id', modalidadeId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function buscarConcurso(modalidadeId: number, numero: number) {
  const { data, error } = await supabase
    .from('concursos')
    .select('numero, data_sorteio, dezenas, acumulado')
    .eq('modalidade_id', modalidadeId)
    .eq('numero', numero)
    .maybeSingle()
  if (error) throw error
  return data
}

/** As mensagens dos triggers já são em PT-BR e amigáveis; o resto vira mensagem genérica. */
function mensagemDoBanco(mensagem: string) {
  const amigaveis = [
    /dezenas/i,
    /cotas/i,
    /bolão/i,
    /divisão/i,
    /modalidade/i,
    /aposta não encontrada/i,
  ]
  return amigaveis.some((r) => r.test(mensagem))
    ? mensagem
    : 'Não foi possível salvar a aposta. Confira os dados.'
}

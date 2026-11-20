import { assinaturaAposta } from '@shared/parsers/planilha.ts'
import { apostaParaRpc, type ApostaInput } from '@shared/schemas/aposta.ts'

import { mensagemDaFunction } from '@/features/conferencia/api'
import { supabase } from '@/lib/supabase'

/** Linhas por página do PostgREST (max_rows padrão é 1.000). */
const PAGINA = 1000

/**
 * Assinaturas (modalidade + concurso + jogos) das apostas que o usuário JÁ tem nas
 * modalidades e na faixa de concursos do arquivo, para avisar "possível duplicata".
 */
export async function assinaturasExistentes(
  apostas: Pick<ApostaInput, 'modalidadeSlug' | 'concursoInicial'>[],
): Promise<Set<string>> {
  const faixas = new Map<string, { min: number; max: number }>()
  for (const a of apostas) {
    const f = faixas.get(a.modalidadeSlug)
    faixas.set(a.modalidadeSlug, {
      min: Math.min(f?.min ?? a.concursoInicial, a.concursoInicial),
      max: Math.max(f?.max ?? a.concursoInicial, a.concursoInicial),
    })
  }
  const existentes = new Set<string>()
  for (const [slug, { min, max }] of faixas) {
    for (let inicio = 0; ; inicio += PAGINA) {
      const { data, error } = await supabase
        .from('apostas')
        .select('concurso_inicial, modalidades!inner (slug), aposta_jogos (dezenas)')
        .eq('modalidades.slug', slug)
        .gte('concurso_inicial', min)
        .lte('concurso_inicial', max)
        .order('id')
        .range(inicio, inicio + PAGINA - 1)
      if (error) throw new Error('Não foi possível verificar as apostas já registradas.')
      for (const a of data) {
        existentes.add(
          assinaturaAposta({
            modalidadeSlug: slug,
            concursoInicial: a.concurso_inicial,
            jogos: a.aposta_jogos.map((j) => j.dezenas),
          }),
        )
      }
      if (data.length < PAGINA) break
    }
  }
  return existentes
}

export interface ResultadoImportacao {
  importacaoId: string
  ids: string[]
}

/** Erro da importação com o índice (base 0) da aposta que o banco recusou. */
export class ErroImportacao extends Error {
  constructor(
    mensagem: string,
    readonly indice: number | null,
  ) {
    super(mensagem)
  }
}

function erroDoBanco(e: { code?: string; message: string }): ErroImportacao {
  const m = /^Aposta (\d+): (.*)$/s.exec(e.message)
  const indice = m ? Number(m[1]) - 1 : null
  if (e.code === '23505')
    return new ErroImportacao(
      'Uma das apostas já foi importada antes (comprovante repetido).',
      indice,
    )
  if (e.code === '57014')
    return new ErroImportacao(
      'O arquivo é grande demais para importar de uma vez. Divida em arquivos menores.',
      null,
    )
  // As mensagens dos triggers e da RPC já são em PT-BR.
  if (m || e.code === '22023' || e.code === '23514')
    return new ErroImportacao(m?.[2] ?? e.message, indice)
  return new ErroImportacao('Não foi possível importar. Nada foi gravado; tente de novo.', null)
}

/** Grava o lote numa transação (RPC importar_apostas): tudo ou nada. */
export async function importarApostas(
  apostas: ApostaInput[],
  opcoes: {
    origem: 'excel' | 'pdf'
    nomeArquivo?: string | null
    qtdErros?: number
    hashes?: (string | null)[]
  },
): Promise<ResultadoImportacao> {
  const { data, error } = await supabase.rpc('importar_apostas', {
    p_apostas: apostas.map((a, i) =>
      apostaParaRpc(a, { origem: opcoes.origem, comprovanteHash: opcoes.hashes?.[i] ?? null }),
    ),
    p_origem: opcoes.origem,
    ...(opcoes.nomeArquivo ? { p_nome_arquivo: opcoes.nomeArquivo } : {}),
    p_qtd_erros: opcoes.qtdErros ?? 0,
  })
  if (error) throw erroDoBanco(error)
  const r = data as { importacao_id: string; ids: string[] }
  return { importacaoId: r.importacao_id, ids: r.ids }
}

/**
 * Confere de uma vez as apostas importadas nos concursos que já têm resultado
 * (Edge Function conferir-apostas). O resto entra na próxima sincronização.
 */
export async function conferirImportacao(importacaoId: string) {
  const { data, error } = await supabase.functions.invoke<{
    concursosConferidos: number
    restantes: number
  }>('conferir-apostas', { body: { importacao_id: importacaoId } })
  if (error) throw new Error(await mensagemDaFunction(error, 'Não foi possível conferir agora.'))
  return data!
}

/**
 * Comprovantes já importados pelo usuário (seção 11.4): hash → data da importação.
 * Só o hash do código do recibo existe no banco; o código nunca sai do aparelho.
 */
export async function comprovantesJaImportados(hashes: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (hashes.length === 0) return mapa
  const { data, error } = await supabase
    .from('apostas')
    .select('comprovante_hash, created_at')
    .in('comprovante_hash', hashes)
  if (error) throw new Error('Não foi possível verificar os comprovantes já importados.')
  for (const a of data) if (a.comprovante_hash) mapa.set(a.comprovante_hash, a.created_at)
  return mapa
}

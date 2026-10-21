// Sincronização de resultados (seção 10.1). Dependências injetáveis (fetch, espera)
// para os testes simularem a API da CAIXA fora do ar.
import type { SupabaseClient } from '@supabase/supabase-js'

import { conferirConcurso } from './conferir.ts'
import { ehSlugSuportado, obterRegra } from './domain/regras/index.ts'
import type { RegraModalidade } from './domain/regras/tipos.ts'
import {
  normalizarConcursoCaixa,
  rateioParaBanco,
  URL_API_CAIXA,
  type ConcursoNormalizado,
} from './domain/resultados.ts'

export const MAX_CONCURSOS_POR_EXECUCAO = 30
const INTERVALO_MS = 300
const TIMEOUT_MS = 10_000
const TENTATIVAS = 3

export interface Dependencias {
  db: SupabaseClient
  fetch?: typeof fetch
  esperar?: (ms: number) => Promise<void>
  /** Base da API (testes apontam para um mock). Padrão: API pública da CAIXA. */
  urlApi?: string
}

export interface ResumoModalidade {
  slug: string
  ultimo: number | null
  inseridos: number
  conferidos: number
  erro?: string
}

const esperarPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * GET com timeout de 10 s e 3 tentativas com backoff (0,5 s, 1 s). Lança erro só
 * depois da última tentativa. A API responde 500 para concurso inexistente.
 */
export async function buscarJson(
  url: string,
  deps: Pick<Dependencias, 'fetch' | 'esperar'> = {},
): Promise<unknown> {
  const f = deps.fetch ?? fetch
  const esperar = deps.esperar ?? esperarPadrao
  let ultimoErro: unknown
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resposta = await f(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
      return await resposta.json()
    } catch (e) {
      ultimoErro = e
      if (tentativa < TENTATIVAS) await esperar(500 * 2 ** (tentativa - 1))
    }
  }
  throw new Error(
    `API indisponível (${url.replace(/^https?:\/\/[^/]+/, '')}): ${String(ultimoErro)}`,
  )
}

interface LinhaConcurso {
  id: number
  numero: number
  dezenas: number[] | null
  rateio: unknown
}

/**
 * Grava o concurso (upsert por modalidade + número). Devolve o id e se mudou algo
 * que exige conferir de novo (dezenas ou rateio). Nunca apaga dezenas já gravadas
 * com uma resposta da API que ainda não as tem.
 */
export async function gravarConcurso(
  db: SupabaseClient,
  modalidadeId: number,
  c: ConcursoNormalizado,
  fonte: 'api_caixa' | 'manual',
): Promise<{ id: number; novo: boolean; mudou: boolean }> {
  const { data: atual } = await db
    .from('concursos')
    .select('id, numero, dezenas, rateio')
    .eq('modalidade_id', modalidadeId)
    .eq('numero', c.numero)
    .maybeSingle<LinhaConcurso>()

  const rateio = c.rateio.length > 0 ? rateioParaBanco(c.rateio) : null
  if (atual?.dezenas && !c.dezenas) return { id: atual.id, novo: false, mudou: false }

  const mudou =
    !atual ||
    JSON.stringify(atual.dezenas) !== JSON.stringify(c.dezenas) ||
    JSON.stringify(atual.rateio ?? null) !== JSON.stringify(rateio)

  const { data, error } = await db
    .from('concursos')
    .upsert(
      {
        modalidade_id: modalidadeId,
        numero: c.numero,
        data_sorteio: c.dataSorteio,
        dezenas: c.dezenas,
        rateio,
        acumulado: c.acumulado,
        data_proximo: c.dataProximo,
        valor_estimado_proximo_centavos: c.valorEstimadoProximoCentavos,
        fonte,
        sincronizado_em: new Date().toISOString(),
      },
      { onConflict: 'modalidade_id,numero' },
    )
    .select('id')
    .single<{ id: number }>()
  if (error || !data) throw new Error(`Falha ao gravar o concurso ${c.numero}: ${error?.message}`)
  return { id: data.id, novo: !atual, mudou }
}

/** Números de concurso que alguma aposta precisa e ainda não têm resultado completo. */
async function concursosNecessarios(
  db: SupabaseClient,
  modalidadeId: number,
  ultimo: number,
): Promise<number[]> {
  const { data: pedidos, error } = await db
    .from('aposta_concursos')
    .select('numero_concurso')
    .eq('modalidade_id', modalidadeId)
    .lte('numero_concurso', ultimo)
  if (error) throw new Error(`Falha ao ler concursos das apostas: ${error.message}`)
  const numeros = [...new Set((pedidos ?? []).map((p) => p.numero_concurso as number))]
  if (numeros.length === 0) return []

  const { data: prontos } = await db
    .from('concursos')
    .select('numero')
    .eq('modalidade_id', modalidadeId)
    .in('numero', numeros)
    .not('dezenas', 'is', null)
    .not('rateio', 'is', null)
  const tem = new Set((prontos ?? []).map((p) => p.numero as number))
  return numeros.filter((n) => !tem.has(n)).sort((a, b) => a - b)
}

/**
 * Concursos já sorteados com apostas ainda não conferidas (ex.: aposta registrada
 * depois do sorteio). A conferência é idempotente, então conferir de novo é seguro.
 */
async function concursosPendentes(db: SupabaseClient, modalidadeId: number): Promise<number[]> {
  const { data: apostas } = await db
    .from('apostas')
    .select('id')
    .eq('modalidade_id', modalidadeId)
    .in('status', ['aguardando', 'conferida'])
  const ids = (apostas ?? []).map((a) => a.id as string)
  if (ids.length === 0) return []
  const { data: numeros } = await db
    .from('aposta_concursos')
    .select('numero_concurso')
    .in('aposta_id', ids)
  const lista = [...new Set((numeros ?? []).map((n) => n.numero_concurso as number))]
  if (lista.length === 0) return []
  const { data: concursos } = await db
    .from('concursos')
    .select('id')
    .eq('modalidade_id', modalidadeId)
    .in('numero', lista)
    .not('dezenas', 'is', null)
  return (concursos ?? []).map((c) => c.id as number)
}

async function registrarLog(
  db: SupabaseClient,
  origem: 'cron' | 'admin' | 'manual',
  modalidadeId: number | null,
  r: Omit<ResumoModalidade, 'slug'>,
) {
  // O log nunca derruba o job.
  await db.from('sync_logs').insert({
    origem,
    modalidade_id: modalidadeId,
    status: r.erro ? 'erro' : 'ok',
    ultimo_concurso: r.ultimo,
    inseridos: r.inseridos,
    conferidos: r.conferidos,
    mensagem: r.erro?.slice(0, 500) ?? null,
  })
}

async function sincronizarModalidade(
  deps: Dependencias,
  modalidade: { id: number; slug: string },
  regra: RegraModalidade,
): Promise<Omit<ResumoModalidade, 'slug'>> {
  const { db } = deps
  const esperar = deps.esperar ?? esperarPadrao
  const base = deps.urlApi ?? URL_API_CAIXA

  // 1. Último concurso (também alimenta "próximo sorteio" e a sugestão de concurso).
  const ultimo = normalizarConcursoCaixa(
    await buscarJson(`${base}/${modalidade.slug}`, deps),
    regra,
  )
  const paraConferir = new Set<number>()
  let inseridos = 0
  const gravadoUltimo = await gravarConcurso(db, modalidade.id, ultimo, 'api_caixa')
  if (gravadoUltimo.novo) inseridos++
  if (gravadoUltimo.mudou) paraConferir.add(gravadoUltimo.id)

  // 2–4. Concursos que as apostas precisam (máx. 30, com 300 ms entre chamadas).
  const necessarios = (await concursosNecessarios(db, modalidade.id, ultimo.numero))
    .filter((n) => n !== ultimo.numero)
    .slice(0, MAX_CONCURSOS_POR_EXECUCAO)
  const falhas: number[] = []
  for (const numero of necessarios) {
    await esperar(INTERVALO_MS)
    try {
      const c = normalizarConcursoCaixa(
        await buscarJson(`${base}/${modalidade.slug}/${numero}`, deps),
        regra,
      )
      const g = await gravarConcurso(db, modalidade.id, c, 'api_caixa')
      if (g.novo) inseridos++
      if (g.mudou) paraConferir.add(g.id)
    } catch {
      // Um concurso com falha não impede os outros; tenta de novo na próxima execução.
      falhas.push(numero)
    }
  }

  // 5. Conferência dos novos/alterados e dos que ficaram pendentes.
  for (const id of await concursosPendentes(db, modalidade.id)) paraConferir.add(id)
  let conferidos = 0
  for (const id of paraConferir) {
    conferidos += (await conferirConcurso(db, id)).apostasConferidas
  }
  return {
    ultimo: ultimo.numero,
    inseridos,
    conferidos,
    ...(falhas.length > 0 ? { erro: `Concursos não obtidos: ${falhas.join(', ')}` } : {}),
  }
}

/** Sincroniza todas as modalidades ativas. Erros de uma modalidade não param as outras. */
export async function sincronizar(
  deps: Dependencias,
  origem: 'cron' | 'admin',
): Promise<{ modalidades: ResumoModalidade[]; prazos: unknown }> {
  const { data: modalidades, error } = await deps.db
    .from('modalidades')
    .select('id, slug')
    .eq('ativa', true)
    .order('id')
  if (error) throw new Error(`Falha ao ler modalidades: ${error.message}`)

  const resumo: ResumoModalidade[] = []
  for (const m of modalidades ?? []) {
    if (!ehSlugSuportado(m.slug)) continue
    let r: Omit<ResumoModalidade, 'slug'>
    try {
      r = await sincronizarModalidade(deps, m, obterRegra(m.slug))
    } catch (e) {
      // Resiliência (seção 10.1): registra e segue; o admin pode lançar o resultado à mão.
      r = {
        ultimo: null,
        inseridos: 0,
        conferidos: 0,
        erro: e instanceof Error ? e.message : String(e),
      }
    }
    await registrarLog(deps.db, origem, m.id, r)
    resumo.push({ slug: m.slug, ...r })
  }

  // 6. Expiração de prêmios e avisos de prazo (job diário junto com o cron).
  const { data: prazos } = await deps.db.rpc('fn_processar_prazos')
  return { modalidades: resumo, prazos }
}

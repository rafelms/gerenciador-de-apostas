// Sincronização de resultados (seção 10.1). Dependências injetáveis (fetch, espera)
// para os testes simularem a API da CAIXA fora do ar.
//
// Pendência P4: a CAIXA responde 403 à nuvem do Supabase. Por isso cada concurso é
// buscado, nesta ordem: (1) resposta da CAIXA que o cron já buscou no GitHub Actions,
// (2) API da CAIXA daqui, (3) API alternativa, que espelha a da CAIXA.
import type { SupabaseClient } from '@supabase/supabase-js'

import { conferirConcurso } from './conferir.ts'
import { ehSlugSuportado, obterRegra } from './domain/regras/index.ts'
import type { RegraModalidade } from './domain/regras/tipos.ts'
import {
  normalizarConcursoAlternativo,
  normalizarConcursoCaixa,
  rateioParaBanco,
  URL_API_ALTERNATIVA,
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
  /** Base da API alternativa. Padrão: `URL_API_ALTERNATIVA`. */
  urlAlternativa?: string
  /**
   * Respostas da CAIXA já buscadas pelo cron no GitHub Actions, por caminho
   * ("/megasena", "/megasena/3070"). Só o cron (com o segredo) pode entregá-las.
   */
  respostasCaixa?: Record<string, unknown>
}

export interface ResumoModalidade {
  slug: string
  ultimo: number | null
  inseridos: number
  conferidos: number
  /** De onde veio o último concurso. */
  fonte?: FonteApi
  erro?: string
}

/** De onde veio o resultado. Só `api_caixa` é oficial; os outros são substituídos por ela. */
export type FonteConcurso = 'api_caixa' | 'api_alternativa' | 'manual' | 'usuario'
type FonteApi = 'api_caixa' | 'api_alternativa'

// A API responde 403 a partir da nuvem do Supabase (pendência P4). Cabeçalhos de
// navegador, como os do próprio portal de loterias, para não parecer um robô.
const CABECALHOS_CAIXA = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  Origin: 'https://loterias.caixa.gov.br',
  Referer: 'https://loterias.caixa.gov.br/',
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
        headers: CABECALHOS_CAIXA,
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
  fonte: FonteConcurso
}

/**
 * Grava o concurso (upsert por modalidade + número). Devolve o id, se mudou algo
 * que exige conferir de novo (dezenas ou rateio) e se isso CORRIGIU um resultado não
 * oficial já conferido (aí as notificações são refeitas). Nunca apaga dezenas já
 * gravadas com uma resposta da API que ainda não as tem.
 */
export async function gravarConcurso(
  db: SupabaseClient,
  modalidadeId: number,
  c: ConcursoNormalizado,
  fonte: FonteConcurso,
): Promise<{ id: number; novo: boolean; mudou: boolean; corrigido: boolean }> {
  const { data: atual } = await db
    .from('concursos')
    .select('id, numero, dezenas, rateio, fonte')
    .eq('modalidade_id', modalidadeId)
    .eq('numero', c.numero)
    .maybeSingle<LinhaConcurso>()

  const rateio = c.rateio.length > 0 ? rateioParaBanco(c.rateio) : null
  const semMudanca = { id: atual?.id ?? 0, novo: false, mudou: false, corrigido: false }
  if (atual?.dezenas && !c.dezenas) return semMudanca
  // A alternativa nunca rebaixa um resultado oficial completo.
  if (fonte === 'api_alternativa' && atual?.fonte === 'api_caixa' && atual.dezenas && atual.rateio)
    return semMudanca

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
  return {
    id: data.id,
    novo: !atual,
    mudou,
    corrigido: mudou && !!atual?.dezenas && atual.fonte !== 'api_caixa',
  }
}

/**
 * Números de concurso que alguma aposta precisa e ainda não têm o resultado OFICIAL
 * completo. Resultados lançados à mão (admin ou usuário) ou vindos da API alternativa
 * entram de novo: a CAIXA tem prioridade e os substitui assim que responder. Sem
 * `ultimo`, inclui também os concursos futuros.
 */
async function concursosNecessarios(
  db: SupabaseClient,
  modalidadeId: number,
  ultimo?: number,
): Promise<number[]> {
  let consulta = db
    .from('aposta_concursos')
    .select('numero_concurso')
    .eq('modalidade_id', modalidadeId)
  if (ultimo !== undefined) consulta = consulta.lte('numero_concurso', ultimo)
  const { data: pedidos, error } = await consulta
  if (error) throw new Error(`Falha ao ler concursos das apostas: ${error.message}`)
  const numeros = [...new Set((pedidos ?? []).map((p) => p.numero_concurso as number))]
  if (numeros.length === 0) return []

  const { data: prontos } = await db
    .from('concursos')
    .select('numero')
    .eq('modalidade_id', modalidadeId)
    .in('numero', numeros)
    .eq('fonte', 'api_caixa')
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

/**
 * Para o cron no GitHub Actions: os concursos que as apostas precisam, por modalidade,
 * para ele buscar na CAIXA de lá (o runner pode não ser bloqueado como a nuvem daqui).
 */
export async function pendencias(
  db: SupabaseClient,
): Promise<{ slug: string; numeros: number[] }[]> {
  const { data: modalidades, error } = await db
    .from('modalidades')
    .select('id, slug')
    .eq('ativa', true)
    .order('id')
  if (error) throw new Error(`Falha ao ler modalidades: ${error.message}`)
  const lista = []
  for (const m of modalidades ?? []) {
    if (!ehSlugSuportado(m.slug)) continue
    lista.push({ slug: m.slug, numeros: await concursosNecessarios(db, m.id) })
  }
  return lista
}

/** Estado de UMA execução: depois que a CAIXA falha, as próximas buscas vão direto para a alternativa. */
interface Busca {
  deps: Dependencias
  caixaFora: boolean
}

const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Um concurso (sem número = o último), pela ordem de preferência da P4. O disjuntor
 * (`caixaFora`) evita gastar 3 tentativas por concurso quando a CAIXA está bloqueada,
 * o que estouraria o tempo da function. HTTP 500 da CAIXA é "concurso inexistente",
 * não bloqueio, e não liga o disjuntor.
 */
async function buscarConcurso(
  busca: Busca,
  slug: string,
  regra: RegraModalidade,
  numero?: number,
): Promise<{ concurso: ConcursoNormalizado; fonte: FonteApi }> {
  const { deps } = busca
  const caminho = numero === undefined ? `/${slug}` : `/${slug}/${numero}`
  const pronta = deps.respostasCaixa?.[caminho]
  if (pronta !== undefined) {
    return { concurso: normalizarConcursoCaixa(pronta, regra), fonte: 'api_caixa' }
  }

  let erroCaixa = 'API da CAIXA fora do ar nesta execução'
  if (!busca.caixaFora) {
    try {
      const json = await buscarJson(`${deps.urlApi ?? URL_API_CAIXA}${caminho}`, deps)
      return { concurso: normalizarConcursoCaixa(json, regra), fonte: 'api_caixa' }
    } catch (e) {
      erroCaixa = mensagemDe(e)
      if (!/HTTP 500\b/.test(erroCaixa)) busca.caixaFora = true
    }
  }

  const alternativa = `${deps.urlAlternativa ?? URL_API_ALTERNATIVA}/${slug}/${numero ?? 'latest'}`
  try {
    const json = await buscarJson(alternativa, deps)
    return { concurso: normalizarConcursoAlternativo(json, regra), fonte: 'api_alternativa' }
  } catch (e) {
    throw new Error(`${erroCaixa} · alternativa: ${mensagemDe(e)}`)
  }
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
    mensagem:
      r.erro?.slice(0, 500) ??
      (r.fonte === 'api_alternativa' ? 'Via API alternativa (a CAIXA não respondeu).' : null),
  })
}

async function sincronizarModalidade(
  busca: Busca,
  modalidade: { id: number; slug: string },
  regra: RegraModalidade,
): Promise<Omit<ResumoModalidade, 'slug'>> {
  const { db } = busca.deps
  const esperar = busca.deps.esperar ?? esperarPadrao

  // 1. Último concurso (também alimenta "próximo sorteio" e a sugestão de concurso).
  const { concurso: ultimo, fonte } = await buscarConcurso(busca, modalidade.slug, regra)
  const paraConferir = new Set<number>()
  const corrigidos = new Set<number>()
  let inseridos = 0
  const gravadoUltimo = await gravarConcurso(db, modalidade.id, ultimo, fonte)
  if (gravadoUltimo.novo) inseridos++
  if (gravadoUltimo.mudou) paraConferir.add(gravadoUltimo.id)
  if (gravadoUltimo.corrigido) corrigidos.add(gravadoUltimo.id)

  // 2–4. Concursos que as apostas precisam (máx. 30, com 300 ms entre chamadas).
  const necessarios = (await concursosNecessarios(db, modalidade.id, ultimo.numero))
    .filter((n) => n !== ultimo.numero)
    .slice(0, MAX_CONCURSOS_POR_EXECUCAO)
  const falhas: number[] = []
  for (const numero of necessarios) {
    // A resposta entregue pelo cron já está aqui: não precisa esperar entre as chamadas.
    if (busca.deps.respostasCaixa?.[`/${modalidade.slug}/${numero}`] === undefined)
      await esperar(INTERVALO_MS)
    try {
      const r = await buscarConcurso(busca, modalidade.slug, regra, numero)
      const g = await gravarConcurso(db, modalidade.id, r.concurso, r.fonte)
      if (g.novo) inseridos++
      if (g.mudou) paraConferir.add(g.id)
      if (g.corrigido) corrigidos.add(g.id)
    } catch {
      // Um concurso com falha não impede os outros; tenta de novo na próxima execução.
      falhas.push(numero)
    }
  }

  // 5. Conferência dos novos/alterados e dos que ficaram pendentes.
  for (const id of await concursosPendentes(db, modalidade.id)) paraConferir.add(id)
  let conferidos = 0
  for (const id of paraConferir) {
    conferidos += (await conferirConcurso(db, id, { renotificar: corrigidos.has(id) }))
      .apostasConferidas
  }
  return {
    ultimo: ultimo.numero,
    inseridos,
    conferidos,
    fonte,
    ...(falhas.length > 0 ? { erro: `Concursos não obtidos: ${falhas.join(', ')}` } : {}),
  }
}

export interface ResumoBuscaAposta {
  /** Concursos da aposta gravados agora a partir da API. */
  buscados: number
  /** Concursos da aposta que ainda não foram sorteados (número > último da API). */
  futuros: number
  erro?: string
}

/**
 * Busca na API, na hora, os resultados que faltam para UMA aposta (ex.: registrada
 * depois do sorteio, antes do cron das 22h30). Só consulta concursos já sorteados
 * (≤ último), então apostas para concursos futuros custam uma chamada só — e
 * nenhuma quando o banco já tem tudo. Concursos novos são conferidos para todos os
 * usuários (a mesma conferência do cron). Nunca lança: falha da API vira `erro`.
 */
export async function buscarResultadosDaAposta(
  deps: Dependencias,
  apostaId: string,
): Promise<ResumoBuscaAposta> {
  const { db } = deps
  const esperar = deps.esperar ?? esperarPadrao
  const busca: Busca = { deps, caixaFora: false }
  const resumo: ResumoBuscaAposta = { buscados: 0, futuros: 0 }

  const { data: aposta } = await db
    .from('apostas')
    .select('modalidade_id, modalidades (slug)')
    .eq('id', apostaId)
    .maybeSingle<{ modalidade_id: number; modalidades: { slug: string } | null }>()
  const slug = aposta?.modalidades?.slug
  if (!aposta || !slug || !ehSlugSuportado(slug)) return resumo
  const regra = obterRegra(slug)

  const { data: pedidos } = await db
    .from('aposta_concursos')
    .select('numero_concurso')
    .eq('aposta_id', apostaId)
  const numeros = (pedidos ?? []).map((p) => p.numero_concurso as number)
  if (numeros.length === 0) return resumo
  // Como no cron, resultado não oficial conta como "falta": a API o substitui.
  const { data: prontos } = await db
    .from('concursos')
    .select('numero')
    .eq('modalidade_id', aposta.modalidade_id)
    .in('numero', numeros)
    .eq('fonte', 'api_caixa')
    .not('dezenas', 'is', null)
    .not('rateio', 'is', null)
  const tem = new Set((prontos ?? []).map((p) => p.numero as number))
  const faltam = numeros.filter((n) => !tem.has(n)).sort((a, b) => a - b)
  if (faltam.length === 0) return resumo

  const paraConferir = new Set<number>()
  const corrigidos = new Set<number>()
  const falhas: number[] = []
  try {
    const { concurso: ultimo, fonte } = await buscarConcurso(busca, slug, regra)
    const g = await gravarConcurso(db, aposta.modalidade_id, ultimo, fonte)
    if (g.mudou) paraConferir.add(g.id)
    if (g.corrigido) corrigidos.add(g.id)
    if (faltam.includes(ultimo.numero)) resumo.buscados++
    resumo.futuros = faltam.filter((n) => n > ultimo.numero).length

    const sorteados = faltam.filter((n) => n < ultimo.numero).slice(0, MAX_CONCURSOS_POR_EXECUCAO)
    for (const numero of sorteados) {
      await esperar(INTERVALO_MS)
      try {
        const r = await buscarConcurso(busca, slug, regra, numero)
        const gc = await gravarConcurso(db, aposta.modalidade_id, r.concurso, r.fonte)
        if (gc.mudou) paraConferir.add(gc.id)
        if (gc.corrigido) corrigidos.add(gc.id)
        resumo.buscados++
      } catch {
        falhas.push(numero)
      }
    }
  } catch (e) {
    resumo.erro = e instanceof Error ? e.message : String(e)
  }
  if (falhas.length > 0) resumo.erro = `Concursos não obtidos: ${falhas.join(', ')}`

  for (const id of paraConferir) {
    await conferirConcurso(db, id, { renotificar: corrigidos.has(id) })
  }
  return resumo
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
  const busca: Busca = { deps, caixaFora: false }
  for (const m of modalidades ?? []) {
    if (!ehSlugSuportado(m.slug)) continue
    let r: Omit<ResumoModalidade, 'slug'>
    try {
      r = await sincronizarModalidade(busca, m, obterRegra(m.slug))
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

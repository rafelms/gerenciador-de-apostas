// Testes das Edge Functions de resultados (F2.3 / F2.4) contra o Supabase LOCAL,
// com a API da CAIXA SIMULADA (fetch injetado). Rodar com o Supabase no ar:
//   cd supabase/functions && deno test --allow-net --allow-env --allow-read tests/
import { assert, assertEquals, assertRejects } from '@std/assert'
import { createClient } from '@supabase/supabase-js'

import { conferirAposta, conferirConcurso, conferirImportacao } from '../_shared/conferir.ts'
import {
  buscarJson,
  buscarResultadosDaAposta,
  gravarConcurso,
  importarHistorico,
  pendencias,
  sincronizar,
} from '../_shared/sincronizar.ts'

const URL_LOCAL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:54321'
const CHAVE =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'
if (!/127\.0\.0\.1|localhost/.test(URL_LOCAL))
  throw new Error('Estes testes só rodam contra o Supabase local.')

const db = createClient(URL_LOCAL, CHAVE, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const semEspera = () => Promise.resolve()
const opcoes = { sanitizeOps: false, sanitizeResources: false }

// Concursos fora da faixa do seed, apagados no fim de cada teste.
const ANTERIOR = 9001
const ULTIMO = 9002
const FIXTURE = JSON.parse(
  await Deno.readTextFile(
    new URL('../../../packages/shared/test/fixtures/api-caixa-megasena.json', import.meta.url),
  ),
)

/** Resposta da API para um concurso; a sena tem 1 ganhador de R$ 1.000.000,00. */
function respostaMega(numero: number, dezenas: string[]) {
  return {
    ...FIXTURE,
    numero,
    listaDezenas: dezenas,
    listaRateioPremio: [
      { descricaoFaixa: '6 acertos', faixa: 1, numeroDeGanhadores: 1, valorPremio: 1_000_000 },
      { descricaoFaixa: '5 acertos', faixa: 2, numeroDeGanhadores: 52, valorPremio: 41_234.56 },
      { descricaoFaixa: '4 acertos', faixa: 3, numeroDeGanhadores: 3876, valorPremio: 1_012.34 },
    ],
  }
}

/** Mock da API: só a Mega responde; as outras modalidades estão "fora do ar". */
function apiSimulada(chamadas: string[] = []): typeof fetch {
  return (async (entrada: RequestInfo | URL) => {
    const url = String(entrada)
    chamadas.push(url)
    if (url.endsWith('/megasena'))
      return Response.json(respostaMega(ULTIMO, ['01', '02', '03', '04', '05', '06']))
    if (url.endsWith(`/megasena/${ANTERIOR}`))
      return Response.json(respostaMega(ANTERIOR, ['03', '17', '22', '31', '40', '58']))
    return new Response('{"exceptionMessage":"indisponível"}', { status: 503 })
  }) as typeof fetch
}

async function criarCenario() {
  const email = `sync-${crypto.randomUUID()}@teste.local`
  const { data: u, error } = await db.auth.admin.createUser({
    email,
    password: 'SenhaTeste123',
    email_confirm: true,
  })
  if (error || !u.user) throw error
  const userId = u.user.id
  const { data: mega } = await db.from('modalidades').select('id').eq('slug', 'megasena').single()
  const { data: aposta } = await db
    .from('apostas')
    .insert({
      user_id: userId,
      modalidade_id: mega!.id,
      tipo: 'simples',
      concurso_inicial: ANTERIOR,
      data_aposta: '2026-10-14',
      valor_pago_centavos: 4200,
    })
    .select('id')
    .single()
  // 7 dezenas com as 6 sorteadas → 1 sena + 6 quinas (aceite F2).
  await db.from('aposta_jogos').insert({
    aposta_id: aposta!.id,
    user_id: userId,
    ordem: 1,
    dezenas: [3, 17, 22, 31, 40, 58, 60],
  })
  await db.from('participantes').insert([
    { aposta_id: aposta!.id, user_id: userId, nome: 'Eu', peso: 1, eh_usuario: true, ordem: 1 },
    { aposta_id: aposta!.id, user_id: userId, nome: 'Amigo', peso: 1, eh_usuario: false, ordem: 2 },
  ])
  return { userId, apostaId: aposta!.id as string, megaId: mega!.id as number }
}

async function limpar(userId: string, megaId: number) {
  await db.auth.admin.deleteUser(userId)
  await db.from('concursos').delete().eq('modalidade_id', megaId).in('numero', [ANTERIOR, ULTIMO])
}

Deno.test('buscarJson: 3 tentativas com backoff e depois erro', async () => {
  let chamadas = 0
  const esperas: number[] = []
  const falha = (() => {
    chamadas++
    return Promise.reject(new Error('rede'))
  }) as typeof fetch
  await assertRejects(
    () =>
      buscarJson('https://exemplo.test/api/megasena', {
        fetch: falha,
        esperar: (ms) => (esperas.push(ms), Promise.resolve()),
      }),
    Error,
    'API indisponível',
  )
  assertEquals(chamadas, 3)
  assertEquals(esperas, [500, 1000])
})

Deno.test('buscarJson: recupera na 2ª tentativa', async () => {
  let n = 0
  const instavel = (() =>
    ++n === 1
      ? Promise.resolve(new Response('', { status: 500 }))
      : Promise.resolve(Response.json({ ok: 1 }))) as typeof fetch
  assertEquals(
    await buscarJson('https://exemplo.test/x', { fetch: instavel, esperar: semEspera }),
    { ok: 1 },
  )
})

Deno.test(
  'sincronizar: busca o necessário, confere, premia, divide e notifica — sem duplicar',
  opcoes,
  async () => {
    const { userId, apostaId, megaId } = await criarCenario()
    try {
      const chamadas: string[] = []
      const r = await sincronizar(
        { db, fetch: apiSimulada(chamadas), esperar: semEspera, urlApi: 'https://api.test' },
        'cron',
      )

      const mega = r.modalidades.find((m) => m.slug === 'megasena')!
      assertEquals(mega.erro, undefined)
      assertEquals(mega.ultimo, ULTIMO)
      assert(mega.inseridos >= 2, 'grava o último e o necessário')
      assert(
        chamadas.includes(`https://api.test/megasena/${ANTERIOR}`),
        'busca o concurso que a aposta precisa',
      )
      // As outras modalidades estão fora do ar: erro registrado, job não quebra.
      assert(
        r.modalidades
          .filter((m) => m.slug !== 'megasena')
          .every((m) => m.erro?.includes('API indisponível')),
      )

      const { data: premio } = await db
        .from('premios')
        .select('*')
        .eq('aposta_id', apostaId)
        .single()
      // bruto = 1 × 1.000.000,00 + 6 × 41.234,56; IR 30% (acima do limite)
      assertEquals(premio.bruto_usuario_centavos, 100_000_000 + 6 * 4_123_456)
      assertEquals(premio.ir_usuario_centavos, 37_422_221)
      assertEquals(premio.liquido_usuario_centavos, 124_740_736 - 37_422_221)
      assertEquals(premio.status, 'a_resgatar')

      const { data: divisoes } = await db
        .from('premio_divisoes')
        .select('liquido_centavos')
        .eq('premio_id', premio.id)
      assertEquals(divisoes!.map((d) => d.liquido_centavos).sort(), [43_659_257, 43_659_258])

      const { data: aposta } = await db.from('apostas').select('status').eq('id', apostaId).single()
      assertEquals(aposta!.status, 'premiada')

      // Idempotência (aceite F2): rodar de novo não duplica prêmio nem notificação.
      await sincronizar(
        { db, fetch: apiSimulada(), esperar: semEspera, urlApi: 'https://api.test' },
        'cron',
      )
      const { data: concurso } = await db
        .from('concursos')
        .select('id')
        .eq('modalidade_id', megaId)
        .eq('numero', ANTERIOR)
        .single()
      await conferirConcurso(db, concurso!.id)
      await conferirAposta(db, apostaId)
      const { count: premios } = await db
        .from('premios')
        .select('id', { count: 'exact', head: true })
        .eq('aposta_id', apostaId)
      const { data: notificacoes } = await db
        .from('notificacoes')
        .select('tipo, titulo, link')
        .eq('user_id', userId)
      assertEquals(premios, 1)
      assertEquals(notificacoes!.length, 1)
      assertEquals(notificacoes![0]!.tipo, 'premio')
      assertEquals(notificacoes![0]!.link, `/apostas/${apostaId}`)
      assert(
        notificacoes![0]!.titulo.startsWith(`🎉 Sua aposta na Mega-Sena ${ANTERIOR} foi premiada`),
      )
    } finally {
      await limpar(userId, megaId)
    }
  },
)

Deno.test(
  'resultado informado por usuário: a API o substitui, confere de novo e refaz a notificação',
  opcoes,
  async () => {
    const { userId, apostaId, megaId } = await criarCenario()
    try {
      // Resultado errado informado à mão: o jogo faz só 3 acertos (não premiado).
      const informado = await gravarConcurso(
        db,
        megaId,
        {
          numero: ANTERIOR,
          dataSorteio: '2026-10-14',
          dezenas: [1, 2, 3, 4, 17, 22],
          rateio: [],
          acumulado: null,
          dataProximo: null,
          valorEstimadoProximoCentavos: null,
        },
        'usuario',
      )
      await conferirConcurso(db, informado.id)
      const lida = () =>
        db.from('notificacoes').update({ lida_em: new Date().toISOString() }).eq('user_id', userId)
      await lida()

      const chamadas: string[] = []
      const api = {
        db,
        fetch: apiSimulada(chamadas),
        esperar: semEspera,
        urlApi: 'https://api.test',
      }
      await sincronizar(api, 'cron')
      assert(
        chamadas.includes(`https://api.test/megasena/${ANTERIOR}`),
        'busca de novo o concurso não oficial',
      )

      const { data: concurso } = await db
        .from('concursos')
        .select('fonte, dezenas')
        .eq('modalidade_id', megaId)
        .eq('numero', ANTERIOR)
        .single()
      assertEquals(concurso!.fonte, 'api_caixa')
      assertEquals(concurso!.dezenas, [3, 17, 22, 31, 40, 58])

      const { data: aposta } = await db.from('apostas').select('status').eq('id', apostaId).single()
      assertEquals(aposta!.status, 'premiada')
      const ler = () => db.from('notificacoes').select('tipo, lida_em').eq('user_id', userId)
      const { data: notificacoes } = await ler()
      assertEquals(notificacoes!.length, 1)
      assertEquals(notificacoes![0]!.tipo, 'premio')
      assertEquals(notificacoes![0]!.lida_em, null, 'a notificação corrigida volta como não lida')

      // Já oficial: sincronizar de novo não busca o concurso nem mexe na notificação.
      await lida()
      chamadas.length = 0
      await sincronizar(api, 'cron')
      assert(!chamadas.includes(`https://api.test/megasena/${ANTERIOR}`))
      const { data: depois } = await ler()
      assert(depois![0]!.lida_em !== null)
    } finally {
      await limpar(userId, megaId)
    }
  },
)

Deno.test(
  'conferir agora: busca na API o resultado que falta à aposta, sem esperar o cron',
  opcoes,
  async () => {
    const { userId, apostaId, megaId } = await criarCenario()
    try {
      const chamadas: string[] = []
      const deps = {
        db,
        fetch: apiSimulada(chamadas),
        esperar: semEspera,
        urlApi: 'https://api.test',
      }
      const r = await buscarResultadosDaAposta(deps, apostaId)
      assertEquals(r, { buscados: 1, futuros: 0 })
      // Só a modalidade da aposta: o último e o concurso que falta.
      assertEquals(chamadas, ['https://api.test/megasena', `https://api.test/megasena/${ANTERIOR}`])
      const { data: aposta } = await db.from('apostas').select('status').eq('id', apostaId).single()
      assertEquals(aposta!.status, 'premiada')

      // Com o resultado no banco, não consulta a API de novo.
      chamadas.length = 0
      assertEquals(await buscarResultadosDaAposta(deps, apostaId), { buscados: 0, futuros: 0 })
      assertEquals(chamadas, [])
    } finally {
      await limpar(userId, megaId)
    }
  },
)

Deno.test(
  'conferir agora: concurso futuro custa uma chamada; API fora vira erro',
  opcoes,
  async () => {
    const { userId, apostaId, megaId } = await criarCenario()
    try {
      await db
        .from('apostas')
        .update({ concurso_inicial: ULTIMO + 1 })
        .eq('id', apostaId)
      const chamadas: string[] = []
      const deps = {
        db,
        fetch: apiSimulada(chamadas),
        esperar: semEspera,
        urlApi: 'https://api.test',
      }
      assertEquals(await buscarResultadosDaAposta(deps, apostaId), { buscados: 0, futuros: 1 })
      assertEquals(chamadas, ['https://api.test/megasena'])

      const fora = (() => Promise.resolve(new Response('', { status: 503 }))) as typeof fetch
      const r = await buscarResultadosDaAposta({ ...deps, fetch: fora }, apostaId)
      assert(r.erro?.includes('API indisponível'))
    } finally {
      await limpar(userId, megaId)
    }
  },
)

Deno.test(
  'API indisponível: o job termina sem erro fatal; resultado manual dispara a conferência',
  opcoes,
  async () => {
    const { userId, apostaId, megaId } = await criarCenario()
    try {
      const foraDoAr = (() => Promise.reject(new TypeError('connection refused'))) as typeof fetch
      const r = await sincronizar(
        { db, fetch: foraDoAr, esperar: semEspera, urlApi: 'https://api.test' },
        'cron',
      )
      assert(r.modalidades.length >= 4)
      assert(r.modalidades.every((m) => m.erro?.includes('API indisponível')))
      const { count: logs } = await db
        .from('sync_logs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'erro')
      assert((logs ?? 0) >= 4, 'cada falha fica no sync_logs')

      // O admin lança o resultado à mão, SEM rateio: a aposta fica premiada com valor a confirmar.
      const g = await gravarConcurso(
        db,
        megaId,
        {
          numero: ANTERIOR,
          dataSorteio: '2026-10-14',
          dezenas: [3, 17, 22, 31, 40, 58],
          rateio: [],
          acumulado: null,
          dataProximo: null,
          valorEstimadoProximoCentavos: null,
        },
        'manual',
      )
      const conf = await conferirConcurso(db, g.id)
      assertEquals(conf.apostasConferidas, 1)
      assertEquals(conf.premiadas, 1)
      const { data: premio } = await db
        .from('premios')
        .select('liquido_usuario_centavos, faixas_sem_valor')
        .eq('aposta_id', apostaId)
        .single()
      assertEquals(premio!.liquido_usuario_centavos, 0)
      assertEquals(premio!.faixas_sem_valor, [6, 5])
      const { data: n } = await db
        .from('notificacoes')
        .select('titulo')
        .eq('user_id', userId)
        .single()
      assertEquals(
        n!.titulo,
        `🎉 Sua aposta na Mega-Sena ${ANTERIOR} foi premiada: valor a confirmar`,
      )

      // Depois sai o rateio (correção do resultado): o prêmio é recalculado.
      await gravarConcurso(
        db,
        megaId,
        {
          numero: ANTERIOR,
          dataSorteio: '2026-10-14',
          dezenas: [3, 17, 22, 31, 40, 58],
          rateio: [
            { acertos: 6, ganhadores: 1, valorCentavos: 100_000 },
            { acertos: 5, ganhadores: 1, valorCentavos: 10_000 },
          ],
          acumulado: false,
          dataProximo: null,
          valorEstimadoProximoCentavos: null,
        },
        'manual',
      )
      await conferirConcurso(db, g.id)
      const { data: recalculado } = await db
        .from('premios')
        .select('bruto_usuario_centavos, faixas_sem_valor')
        .eq('aposta_id', apostaId)
        .single()
      assertEquals(recalculado!.bruto_usuario_centavos, 100_000 + 6 * 10_000)
      assertEquals(recalculado!.faixas_sem_valor, [])
    } finally {
      await limpar(userId, megaId)
    }
  },
)

Deno.test('prêmio informado à mão prevalece sobre o calculado', opcoes, async () => {
  const { userId, apostaId, megaId } = await criarCenario()
  try {
    await sincronizar(
      { db, fetch: apiSimulada(), esperar: semEspera, urlApi: 'https://api.test' },
      'cron',
    )
    await db
      .from('premios')
      .update({
        valor_informado_manual: true,
        bruto_usuario_centavos: 5000,
        ir_usuario_centavos: 0,
        liquido_usuario_centavos: 5000,
      })
      .eq('aposta_id', apostaId)
    await conferirAposta(db, apostaId)
    const { data: premio } = await db
      .from('premios')
      .select('id, liquido_usuario_centavos')
      .eq('aposta_id', apostaId)
      .single()
    assertEquals(premio!.liquido_usuario_centavos, 5000)
    const { data: divisoes } = await db
      .from('premio_divisoes')
      .select('liquido_centavos')
      .eq('premio_id', premio!.id)
    assertEquals(
      divisoes!.map((d) => d.liquido_centavos),
      [2500, 2500],
    )
  } finally {
    await limpar(userId, megaId)
  }
})

// ---------------------------------------------------------------------------
// Pendência P4: CAIXA bloqueada → respostas do cron (GitHub Actions) e API alternativa
// ---------------------------------------------------------------------------

/** A mesma resposta da Mega no formato da API alternativa. */
function respostaAlternativa(numero: number, dezenas: string[]) {
  const caixa = respostaMega(numero, dezenas)
  return {
    loteria: 'megasena',
    concurso: caixa.numero,
    data: caixa.dataApuracao,
    dezenas,
    premiacoes: caixa.listaRateioPremio.map(
      (f: {
        descricaoFaixa: string
        faixa: number
        numeroDeGanhadores: number
        valorPremio: number
      }) => ({
        descricao: f.descricaoFaixa,
        faixa: f.faixa,
        ganhadores: f.numeroDeGanhadores,
        valorPremio: f.valorPremio,
      }),
    ),
    acumulou: false,
  }
}

/** CAIXA (api.test) bloqueada com 403; a alternativa (alt.test) responde só a Mega. */
function caixaBloqueada(chamadas: string[] = []): typeof fetch {
  return (async (entrada: RequestInfo | URL) => {
    const url = String(entrada)
    chamadas.push(url)
    if (url.startsWith('https://api.test')) return new Response('', { status: 403 })
    if (url === 'https://alt.test/megasena/latest')
      return Response.json(respostaAlternativa(ULTIMO, ['01', '02', '03', '04', '05', '06']))
    if (url === `https://alt.test/megasena/${ANTERIOR}`)
      return Response.json(respostaAlternativa(ANTERIOR, ['03', '17', '22', '31', '40', '58']))
    return new Response('', { status: 404 })
  }) as typeof fetch
}

const DEPS_P4 = {
  esperar: semEspera,
  urlApi: 'https://api.test',
  urlAlternativa: 'https://alt.test',
}

Deno.test(
  'CAIXA bloqueada: usa a API alternativa, confere e para de insistir na CAIXA',
  opcoes,
  async () => {
    const { apostaId, userId, megaId } = await criarCenario()
    try {
      const chamadas: string[] = []
      const r = await sincronizar({ db, fetch: caixaBloqueada(chamadas), ...DEPS_P4 }, 'cron')

      const mega = r.modalidades.find((m) => m.slug === 'megasena')!
      assertEquals(mega.erro, undefined)
      assertEquals(mega.fonte, 'api_alternativa')
      // Disjuntor: só a 1ª busca tenta a CAIXA (3 tentativas); as outras vão direto à alternativa.
      assertEquals(chamadas.filter((u) => u.startsWith('https://api.test')).length, 3)

      const { data: concurso } = await db
        .from('concursos')
        .select('fonte, dezenas')
        .eq('modalidade_id', megaId)
        .eq('numero', ANTERIOR)
        .single()
      assertEquals(concurso!.fonte, 'api_alternativa')
      assertEquals(concurso!.dezenas, [3, 17, 22, 31, 40, 58])
      const { data: aposta } = await db.from('apostas').select('status').eq('id', apostaId).single()
      assertEquals(aposta!.status, 'premiada')
    } finally {
      await limpar(userId, megaId)
    }
  },
)

Deno.test(
  'respostas da CAIXA entregues pelo cron: gravadas como oficiais, sem chamar API nenhuma',
  opcoes,
  async () => {
    const { userId, megaId } = await criarCenario()
    try {
      // A pendência que o cron vai buscar na CAIXA a partir do runner.
      const lista = await pendencias(db)
      assert(lista.find((m) => m.slug === 'megasena')!.numeros.includes(ANTERIOR))

      const chamadas: string[] = []
      const respostasCaixa = {
        '/megasena': respostaMega(ULTIMO, ['01', '02', '03', '04', '05', '06']),
        [`/megasena/${ANTERIOR}`]: respostaMega(ANTERIOR, ['03', '17', '22', '31', '40', '58']),
      }
      const r = await sincronizar(
        { db, fetch: caixaBloqueada(chamadas), ...DEPS_P4, respostasCaixa },
        'cron',
      )
      assertEquals(r.modalidades.find((m) => m.slug === 'megasena')!.fonte, 'api_caixa')
      assert(!chamadas.some((u) => u.includes('/megasena')), 'nenhuma chamada para a Mega')

      const { data: concurso } = await db
        .from('concursos')
        .select('fonte')
        .eq('modalidade_id', megaId)
        .eq('numero', ANTERIOR)
        .single()
      assertEquals(concurso!.fonte, 'api_caixa')
      const depois = await pendencias(db)
      assert(!depois.find((m) => m.slug === 'megasena')!.numeros.includes(ANTERIOR))
    } finally {
      await limpar(userId, megaId)
    }
  },
)

Deno.test('API alternativa não rebaixa um resultado oficial completo', opcoes, async () => {
  const { userId, megaId } = await criarCenario()
  try {
    const oficial = {
      numero: ANTERIOR,
      dataSorteio: '2026-10-14',
      dezenas: [3, 17, 22, 31, 40, 58],
      rateio: [{ acertos: 6, ganhadores: 1, valorCentavos: 100 }],
      acumulado: false,
      dataProximo: null,
      valorEstimadoProximoCentavos: null,
    }
    await gravarConcurso(db, megaId, oficial, 'api_caixa')
    const g = await gravarConcurso(
      db,
      megaId,
      { ...oficial, dezenas: [1, 2, 3, 4, 5, 6] },
      'api_alternativa',
    )
    assertEquals(g.mudou, false)
    const { data: concurso } = await db
      .from('concursos')
      .select('fonte, dezenas')
      .eq('modalidade_id', megaId)
      .eq('numero', ANTERIOR)
      .single()
    assertEquals(concurso!.fonte, 'api_caixa')
    assertEquals(concurso!.dezenas, [3, 17, 22, 31, 40, 58])
  } finally {
    await limpar(userId, megaId)
  }
})

Deno.test(
  'rateio publicado depois das dezenas: a notificação é reescrita e a divisão se mantém',
  opcoes,
  async () => {
    const { userId, apostaId, megaId } = await criarCenario()
    try {
      const base = {
        numero: ANTERIOR,
        dataSorteio: '2026-10-14',
        dezenas: [3, 17, 22, 31, 40, 58],
        acumulado: false,
        dataProximo: null,
        valorEstimadoProximoCentavos: null,
      }
      // 1. Dezenas sem rateio: premiada, mas com "valor a confirmar".
      const g1 = await gravarConcurso(db, megaId, { ...base, rateio: [] }, 'api_caixa')
      await conferirConcurso(db, g1.id)
      const chave = `resultado:${g1.id}`
      const { data: n1 } = await db
        .from('notificacoes')
        .select('id, titulo, corpo')
        .eq('user_id', userId)
        .eq('chave_dedup', chave)
        .single()
      assert(`${n1!.titulo} ${n1!.corpo}`.includes('a confirmar'))
      await db.from('notificacoes').update({ lida_em: new Date().toISOString() }).eq('id', n1!.id)

      // 2. O rateio sai (mesma fonte oficial): o texto muda e volta como não lida.
      const rateio = [
        { acertos: 6, ganhadores: 1, valorCentavos: 100_000_000 },
        { acertos: 5, ganhadores: 52, valorCentavos: 4_123_456 },
        { acertos: 4, ganhadores: 3876, valorCentavos: 101_234 },
      ]
      const g2 = await gravarConcurso(db, megaId, { ...base, rateio }, 'api_caixa')
      assert(g2.mudou && !g2.corrigido)
      await conferirConcurso(db, g2.id)
      const { data: n2 } = await db
        .from('notificacoes')
        .select('id, titulo, corpo, lida_em')
        .eq('user_id', userId)
        .eq('chave_dedup', chave)
        .single()
      assertEquals(n2!.id, n1!.id)
      assert(!`${n2!.titulo} ${n2!.corpo}`.includes('a confirmar'))
      assertEquals(n2!.lida_em, null)

      // 3. Conferir de novo sem mudança: não mexe na notificação lida nem na divisão.
      await db.from('notificacoes').update({ lida_em: new Date().toISOString() }).eq('id', n1!.id)
      await conferirConcurso(db, g2.id)
      const { data: n3 } = await db.from('notificacoes').select('lida_em').eq('id', n1!.id).single()
      assert(n3!.lida_em !== null)
      const { data: premio } = await db
        .from('premios')
        .select('id, liquido_usuario_centavos, premio_divisoes (liquido_centavos)')
        .eq('aposta_id', apostaId)
        .single()
      const divisoes = premio!.premio_divisoes as { liquido_centavos: number }[]
      assertEquals(divisoes.length, 2)
      // A divisão é do líquido da aposta inteira entre os 2 participantes (pesos 1/1).
      assert(divisoes.every((d) => d.liquido_centavos > 0))
    } finally {
      await limpar(userId, megaId)
    }
  },
)

Deno.test(
  'conferirImportacao: confere o lote nos concursos já sorteados, só do dono',
  opcoes,
  async () => {
    const { userId, megaId } = await criarCenario()
    try {
      // O concurso ANTERIOR já está no banco quando a planilha é importada.
      await sincronizar(
        { db, fetch: apiSimulada(), esperar: semEspera, urlApi: 'https://api.test' },
        'cron',
      )
      const { data: imp } = await db
        .from('importacoes')
        .insert({ user_id: userId, origem: 'excel', qtd_apostas: 2 })
        .select('id')
        .single()
      const { data: apostas } = await db
        .from('apostas')
        .insert(
          [ANTERIOR, ULTIMO + 5].map((concurso) => ({
            user_id: userId,
            modalidade_id: megaId,
            tipo: 'simples' as const,
            origem: 'excel' as const,
            concurso_inicial: concurso,
            data_aposta: '2026-10-14',
            valor_pago_centavos: 600,
            importacao_id: imp!.id,
          })),
        )
        .select('id, concurso_inicial')
      for (const a of apostas!) {
        await db.from('aposta_jogos').insert({
          aposta_id: a.id,
          user_id: userId,
          ordem: 1,
          dezenas: [3, 17, 22, 31, 40, 58],
        })
      }

      // Outro usuário não confere a importação alheia.
      const outro = await db.auth.admin.createUser({
        email: `outro-${crypto.randomUUID()}@teste.local`,
        password: 'SenhaTeste123',
        email_confirm: true,
      })
      try {
        assertEquals(await conferirImportacao(db, imp!.id, outro.data.user!.id), {
          concursosConferidos: 0,
          restantes: 0,
        })
      } finally {
        await db.auth.admin.deleteUser(outro.data.user!.id)
      }

      // Só o concurso já sorteado entra; o futuro fica para a sincronização.
      assertEquals(await conferirImportacao(db, imp!.id, userId), {
        concursosConferidos: 1,
        restantes: 0,
      })
      const { data: status } = await db
        .from('apostas')
        .select('concurso_inicial, status')
        .eq('importacao_id', imp!.id)
        .order('concurso_inicial')
      assertEquals(status, [
        { concurso_inicial: ANTERIOR, status: 'premiada' },
        { concurso_inicial: ULTIMO + 5, status: 'aguardando' },
      ])
    } finally {
      await limpar(userId, megaId)
    }
  },
)

// ---------------------------------------------------------------------------
// Histórico (F5.2)
// ---------------------------------------------------------------------------
const TOPO_HIST = 9300

/** API que responde qualquer concurso da Mega, menos os de `fora` (HTTP 500 = "não achei"). */
function apiHistorico(fora: Set<number>, chamadas: string[] = []): typeof fetch {
  return (async (entrada: RequestInfo | URL) => {
    const url = String(entrada)
    chamadas.push(url)
    const m = /^https:\/\/api\.test\/megasena\/(\d+)$/.exec(url)
    if (m && !fora.has(Number(m[1])))
      return Response.json(respostaMega(Number(m[1]), ['05', '11', '23', '34', '45', '56']))
    return new Response('', { status: m ? 500 : 404 })
  }) as typeof fetch
}

async function gravarMega(megaId: number, numero: number) {
  const { error } = await db.from('concursos').insert({
    modalidade_id: megaId,
    numero,
    data_sorteio: '2026-11-01',
    dezenas: [1, 2, 3, 4, 5, 6],
    fonte: 'api_caixa',
  })
  if (error) throw error
}

Deno.test(
  'histórico: busca do mais novo para o mais antigo, pula os gravados e repete as falhas',
  opcoes,
  async () => {
    const { data: mega } = await db.from('modalidades').select('id').eq('slug', 'megasena').single()
    const megaId = mega!.id as number
    try {
      await gravarMega(megaId, TOPO_HIST)
      await gravarMega(megaId, TOPO_HIST - 2)
      const chamadas: string[] = []
      const deps = { db, ...DEPS_P4 }

      // 10 concursos: 9291–9300; 9300 e 9298 já existem; 9295 não vem da API.
      const r1 = await importarHistorico(
        { ...deps, fetch: apiHistorico(new Set([TOPO_HIST - 5]), chamadas) },
        'megasena',
        10,
      )
      assertEquals(r1, {
        slug: 'megasena',
        ultimo: TOPO_HIST,
        alvo: 10,
        inseridos: 7,
        obtidos: 7,
        faltam: 1,
        falhas: [TOPO_HIST - 5],
      })
      // Não busca o último na API (já está gravado) nem os que já existem.
      assert(!chamadas.some((u) => u.endsWith('/megasena') || u.endsWith(`/${TOPO_HIST - 2}`)))
      assert(chamadas[0]!.endsWith(`/${TOPO_HIST - 1}`), 'começa pelo mais recente')

      const r2 = await importarHistorico(
        { ...deps, fetch: apiHistorico(new Set()) },
        'megasena',
        10,
      )
      assertEquals([r2.inseridos, r2.faltam, r2.falhas], [1, 0, []])

      const { data: log } = await db
        .from('sync_logs')
        .select('origem, status, mensagem')
        .eq('modalidade_id', megaId)
        .like('mensagem', 'Histórico:%')
        .order('id', { ascending: false })
        .limit(2)
      assertEquals(
        log?.map((l) => [l.origem, l.status]),
        [
          ['admin', 'ok'],
          ['admin', 'erro'],
        ],
      )
    } finally {
      await db
        .from('concursos')
        .delete()
        .eq('modalidade_id', megaId)
        .gte('numero', TOPO_HIST - 60)
        .lte('numero', TOPO_HIST)
    }
  },
)

Deno.test('histórico: no máximo 30 concursos por chamada', opcoes, async () => {
  const { data: mega } = await db.from('modalidades').select('id').eq('slug', 'megasena').single()
  const megaId = mega!.id as number
  try {
    await gravarMega(megaId, TOPO_HIST)
    const r = await importarHistorico(
      { db, ...DEPS_P4, fetch: apiHistorico(new Set()) },
      'megasena',
      45,
    )
    assertEquals([r.inseridos, r.faltam], [30, 14])
    const { count } = await db
      .from('concursos')
      .select('id', { count: 'exact', head: true })
      .eq('modalidade_id', megaId)
      .gte('numero', TOPO_HIST - 30)
      .lte('numero', TOPO_HIST)
    assertEquals(count, 31, 'os 30 mais recentes abaixo do topo')
  } finally {
    await db
      .from('concursos')
      .delete()
      .eq('modalidade_id', megaId)
      .gte('numero', TOPO_HIST - 60)
      .lte('numero', TOPO_HIST)
  }
})

Deno.test('histórico: modalidade inválida', async () => {
  await assertRejects(
    () => importarHistorico({ db, esperar: semEspera }, 'bingo', 10),
    Error,
    'Modalidade inválida',
  )
})

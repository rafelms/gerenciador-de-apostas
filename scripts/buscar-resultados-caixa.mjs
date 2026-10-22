// Cron de resultados (pendência P4): busca na API da CAIXA a partir do runner do GitHub
// Actions, que pode não ser bloqueado como a nuvem do Supabase, e entrega as respostas à
// Edge Function sync-resultados, que as normaliza, grava e confere. Se a CAIXA também
// bloquear o runner, segue sem respostas e a function usa a API alternativa.
//   CRON_SECRET=... SUPABASE_FUNCTIONS_URL=... node scripts/buscar-resultados-caixa.mjs
// O log mostra só contagens e o resumo por modalidade (sem dados de usuários).

const CAIXA = 'https://servicebus2.caixa.gov.br/portaldeloterias/api'
const MAX_CONCURSOS = 30 // o mesmo limite da function
const CABECALHOS_CAIXA = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  Origin: 'https://loterias.caixa.gov.br',
  Referer: 'https://loterias.caixa.gov.br/',
}

const { CRON_SECRET, SUPABASE_FUNCTIONS_URL } = process.env
if (!CRON_SECRET || !SUPABASE_FUNCTIONS_URL) {
  console.error('Defina CRON_SECRET e SUPABASE_FUNCTIONS_URL.')
  process.exit(1)
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/** POST autenticado com o segredo do cron. */
function chamarFunction(caminho, corpo, timeoutMs = 60_000) {
  return fetch(`${SUPABASE_FUNCTIONS_URL}/${caminho}`, {
    method: 'POST',
    headers: { 'x-cron-secret': CRON_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(timeoutMs),
  })
}

/** GET na CAIXA com 2 tentativas. HTTP 500 = concurso inexistente (não tenta de novo). */
async function buscarNaCaixa(caminho) {
  let erro = ''
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const r = await fetch(`${CAIXA}${caminho}`, {
        headers: CABECALHOS_CAIXA,
        signal: AbortSignal.timeout(10_000),
      })
      if (r.ok) return { json: await r.json() }
      erro = `HTTP ${r.status}`
      if (r.status === 500) break
    } catch (e) {
      erro = e instanceof Error ? e.message : String(e)
    }
    if (tentativa < 2) await esperar(1000)
  }
  return { erro }
}

const respostaPendencias = await chamarFunction('sync-resultados/pendencias', {})
if (!respostaPendencias.ok) {
  console.error(`pendencias: HTTP ${respostaPendencias.status}`)
  process.exit(1)
}
const { modalidades } = await respostaPendencias.json()

const respostasCaixa = {}
for (const { slug, numeros } of modalidades) {
  const ultimo = await buscarNaCaixa(`/${slug}`)
  if (!ultimo.json) {
    console.log(`${slug}: a CAIXA não respondeu daqui (${ultimo.erro}); fica com a API alternativa`)
    continue
  }
  respostasCaixa[`/${slug}`] = ultimo.json
  const sorteados = numeros.filter((n) => n < ultimo.json.numero).slice(0, MAX_CONCURSOS)
  let obtidos = 0
  for (const numero of sorteados) {
    await esperar(300)
    const r = await buscarNaCaixa(`/${slug}/${numero}`)
    if (r.json) {
      respostasCaixa[`/${slug}/${numero}`] = r.json
      obtidos++
    }
  }
  console.log(
    `${slug}: último ${ultimo.json.numero} pela CAIXA; ${obtidos}/${sorteados.length} concursos das apostas`,
  )
}

// Falha de uma modalidade não derruba o job (fica no sync_logs); só erro geral falha.
const sync = await chamarFunction('sync-resultados', { respostasCaixa }, 300_000)
console.log(await sync.text())
if (sync.status !== 200) process.exit(1)

// CORS restrito ao domínio do front (seção 8.8).
// ALLOWED_ORIGIN aceita vários domínios separados por vírgula.
// Sem a variável, só o Vite local é aceito.
const permitidas = (Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

export function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : (permitidas[0] ?? ''),
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function responderPreflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: cabecalhosCors(req) }) : null
}

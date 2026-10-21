import { cabecalhosCors } from './cors.ts'

export function json(req: Request, corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors(req), 'Content-Type': 'application/json' },
  })
}

/** Erros com mensagem genérica (seção 8.8): nunca devolve detalhes internos. */
export function erro(req: Request, status: number, mensagem: string): Response {
  return json(req, { erro: mensagem }, status)
}

import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'

import { ehErroDeVersaoAntiga, podeRecarregar, recarregarUmaVez } from '@/lib/recarregar'
import { Button } from './ui/button'

/**
 * Tela de erro das rotas (errorElement). Sem ela, o React Router mostra a tela padrão
 * dele, em inglês. Se o erro é de versão antiga do app (deploy novo), recarrega sozinho.
 */
export function ErroDeRota() {
  const erro = useRouteError()
  const versaoAntiga = ehErroDeVersaoAntiga(erro)
  // Decidido uma vez ao montar: se já recarregou há pouco, mostra a tela de erro.
  const [recarregando] = useState(() => versaoAntiga && podeRecarregar())

  useEffect(() => {
    if (recarregando) recarregarUmaVez()
  }, [recarregando])

  useEffect(() => {
    if (!versaoAntiga) console.error(erro)
  }, [erro, versaoAntiga])

  if (recarregando) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-muted-foreground">
        <p role="status">Atualizando o LotoGestor…</p>
      </main>
    )
  }

  const titulo = versaoAntiga
    ? 'Há uma versão nova do LotoGestor'
    : isRouteErrorResponse(erro) && erro.status === 404
      ? 'Página não encontrada'
      : 'Algo deu errado nesta tela'
  const descricao = versaoAntiga
    ? 'Recarregue a página para continuar.'
    : 'Tente recarregar. Se o problema continuar, volte ao início.'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div
        role="alert"
        className="flex max-w-sm flex-col items-center gap-3 rounded-xl border bg-card px-6 py-10 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <TriangleAlert className="size-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <h1 className="text-lg font-semibold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{descricao}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden="true" />
            Recarregar
          </Button>
          {/* Link comum (não do router): o estado do app pode estar quebrado. */}
          <Button asChild variant="outline">
            <a href="/">Voltar ao início</a>
          </Button>
        </div>
      </div>
    </main>
  )
}

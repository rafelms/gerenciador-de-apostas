/**
 * Copia um texto que pode ainda estar sendo carregado. O Safari só aceita escrever na área
 * de transferência durante o clique; com `ClipboardItem` a promessa é entregue na hora e
 * resolvida depois. Sem ele (ou se falhar), espera o texto e usa `writeText`.
 */
export async function copiarTexto(texto: string | Promise<string>): Promise<void> {
  const pronto = Promise.resolve(texto)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': pronto.then((t) => new Blob([t], { type: 'text/plain' })),
        }),
      ])
      return
    } catch {
      // segue para o writeText (a mesma promessa: o texto não é buscado de novo)
    }
  }
  await navigator.clipboard.writeText(await pronto)
}

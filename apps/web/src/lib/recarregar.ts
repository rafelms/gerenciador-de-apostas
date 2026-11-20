// Depois de um deploy, os arquivos das telas mudam de nome (hash). Quem estava com o app
// aberto pede um arquivo que não existe mais e a tela não carrega. Recarregar a página
// busca o index.html novo. A trava evita um laço de recargas se o problema for outro.

const CHAVE = 'lotogestor:recarregado-em'
const INTERVALO_MS = 30_000

/** Erro típico de arquivo de tela (chunk) que sumiu após um deploy. */
export function ehErroDeVersaoAntiga(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? `${erro.name} ${erro.message}` : String(erro)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Unable to preload CSS/i.test(
    mensagem,
  )
}

/**
 * Recarrega a página, no máximo uma vez a cada 30 s. Devolve false se já recarregou há
 * pouco (aí a tela de erro aparece, em vez de recarregar sem fim).
 */
export function recarregarUmaVez(): boolean {
  if (!podeRecarregar()) return false
  try {
    sessionStorage.setItem(CHAVE, String(Date.now()))
  } catch {
    // sem sessionStorage (modo privado restrito): recarrega uma vez mesmo assim
  }
  window.location.reload()
  return true
}

/** Se ainda não recarregou nos últimos 30 s (só lê; não recarrega). */
export function podeRecarregar(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(CHAVE) ?? 0) >= INTERVALO_MS
  } catch {
    return true
  }
}

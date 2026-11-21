// Modo offline (seção 11.14): o cache do TanStack Query fica salvo no aparelho e, sem
// conexão, o app mostra a última versão em modo leitura. Só dados de leitura do próprio
// usuário: nada de tokens, nem URLs assinadas de anexos. Sai tudo no logout e na troca
// de usuário no mesmo aparelho.
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import type { Query } from '@tanstack/react-query'

const CHAVE_CACHE = 'lotogestor-cache'
const CHAVE_DONO = 'lotogestor-cache-dono'
const CHAVE_SESSAO = 'lotogestor-sessao-offline'

/** Quanto tempo a cópia vale (e por quanto tempo o cache em memória a guarda). */
export const IDADE_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000
/** Muda quando o formato dos dados em cache mudar: invalida as cópias antigas. */
export const VERSAO_CACHE = 'v1'

const RAIZES_PERSISTIDAS = new Set(['apostas', 'concursos', 'modalidades', 'notificacoes'])

/** localStorage pode não existir (modo privado restrito): aí o app só não fica offline. */
function armazenamento(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export const persister = createSyncStoragePersister({
  storage: armazenamento(),
  key: CHAVE_CACHE,
  throttleTime: 2000,
})

export function devePersistir(query: Query): boolean {
  const [raiz, segundo] = query.queryKey as unknown[]
  return (
    query.state.status === 'success' &&
    RAIZES_PERSISTIDAS.has(String(raiz)) &&
    // URLs assinadas vencem em 60 s e não servem offline.
    segundo !== 'anexos'
  )
}

/** Dono do cache salvo; outro usuário entrando no aparelho apaga tudo antes de ver algo. */
export function trocouDeDono(userId: string): boolean {
  const s = armazenamento()
  if (!s) return false
  try {
    const dono = s.getItem(CHAVE_DONO)
    s.setItem(CHAVE_DONO, userId)
    return dono !== null && dono !== userId
  } catch {
    return false
  }
}

export function apagarCacheOffline() {
  const s = armazenamento()
  try {
    s?.removeItem(CHAVE_CACHE)
    s?.removeItem(CHAVE_DONO)
    s?.removeItem(CHAVE_SESSAO)
  } catch {
    // sem armazenamento, nada a apagar
  }
}

/** Cópia mínima do perfil (sem token) para abrir o app sem rede. */
export function lerSessaoOffline<T>(userId: string): T | undefined {
  try {
    const bruto = armazenamento()?.getItem(CHAVE_SESSAO)
    if (!bruto) return undefined
    const salvo = JSON.parse(bruto) as { userId: string; dados: T }
    return salvo.userId === userId ? salvo.dados : undefined
  } catch {
    return undefined
  }
}

export function salvarSessaoOffline<T>(userId: string, dados: T) {
  try {
    armazenamento()?.setItem(CHAVE_SESSAO, JSON.stringify({ userId, dados }))
  } catch {
    // cheio ou bloqueado: segue sem a cópia
  }
}

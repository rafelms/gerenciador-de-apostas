import { WifiOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'

function inscrever(avisar: () => void) {
  window.addEventListener('online', avisar)
  window.addEventListener('offline', avisar)
  return () => {
    window.removeEventListener('online', avisar)
    window.removeEventListener('offline', avisar)
  }
}

export function useOnline() {
  return useSyncExternalStore(
    inscrever,
    () => navigator.onLine,
    () => true,
  )
}

/** Sem conexão (seção 11.14): a tela mostra a última versão salva, só para leitura. */
export function AvisoOffline() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-2xl bg-tinta px-4 py-3 text-sm text-tinta-foreground"
    >
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <strong className="font-semibold">Sem conexão.</strong> Você está vendo a última versão
        salva neste aparelho. Para registrar ou alterar algo, conecte-se de novo.
      </p>
    </div>
  )
}

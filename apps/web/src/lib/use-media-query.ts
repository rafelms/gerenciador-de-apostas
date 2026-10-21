import { useSyncExternalStore } from 'react'

/** true quando a media query casa. Ex.: useMediaQuery('(min-width: 1024px)') para o layout desktop (lg). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', avisar)
      return () => mq.removeEventListener('change', avisar)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const useDesktop = () => useMediaQuery('(min-width: 1024px)')

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { Providers } from './app/providers'
import { router } from './app/router'
import { verificarAtualizacoes, versaoNovaAtiva } from './lib/atualizacao'
import { recarregarUmaVez } from './lib/recarregar'
import './styles/index.css'

// Falha ao pré-carregar um arquivo de tela (deploy novo com o app aberto): recarrega em
// vez de deixar a navegação quebrar. Se já recarregou há pouco, o errorElement assume.
window.addEventListener('vite:preloadError', (evento) => {
  if (recarregarUmaVez()) evento.preventDefault()
})

// Service worker do PWA (só no build): a versão nova assume sozinha e a página recarrega,
// esperando o usuário salvar se houver formulário com dados não salvos (lib/atualizacao).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({
      immediate: true,
      onNeedReload: versaoNovaAtiva,
      onRegisteredSW: (_url, registro) => registro && verificarAtualizacoes(registro),
    }),
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)

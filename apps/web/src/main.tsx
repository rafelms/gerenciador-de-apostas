import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'

import { Providers } from './app/providers'
import { router } from './app/router'
import { recarregarUmaVez } from './lib/recarregar'
import './styles/index.css'

// Falha ao pré-carregar um arquivo de tela (deploy novo com o app aberto): recarrega em
// vez de deixar a navegação quebrar. Se já recarregou há pouco, o errorElement assume.
window.addEventListener('vite:preloadError', (evento) => {
  if (recarregarUmaVez()) evento.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
)

// Somente a URL e a chave PÚBLICA do Supabase chegam ao front (seção 8.6).
// A proteção dos dados é a RLS, não o segredo desta chave.
//
// Validação sem zod de propósito: este arquivo entra no bundle inicial, e o zod só é
// carregado com as telas que têm formulário (seção 16: bundle inicial < 250 KB gzip).

function urlValida(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false
  try {
    return ['http:', 'https:'].includes(new URL(valor).protocol)
  } catch {
    return false
  }
}

const url: unknown = import.meta.env.VITE_SUPABASE_URL
const chave: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!urlValida(url) || typeof chave !== 'string' || chave.length < 20) {
  throw new Error(
    'Variáveis de ambiente ausentes. Copie apps/web/.env.example para apps/web/.env.local e preencha.',
  )
}

export const env = { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: chave }

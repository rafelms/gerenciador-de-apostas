import { z } from 'zod'

// Somente a URL e a chave PÚBLICA do Supabase chegam ao front (seção 8.6).
// A proteção dos dados é a RLS, não o segredo desta chave.
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
})

const resultado = envSchema.safeParse(import.meta.env)

if (!resultado.success) {
  throw new Error(
    'Variáveis de ambiente ausentes. Copie apps/web/.env.example para apps/web/.env.local e preencha.',
  )
}

export const env = resultado.data

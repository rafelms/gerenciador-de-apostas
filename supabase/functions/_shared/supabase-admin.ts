import { createClient } from '@supabase/supabase-js'

// Cliente com a service role: ignora RLS. Existe SOMENTE dentro das Edge Functions;
// a chave é injetada pelo Supabase e nunca vai para o front (seção 8.6).
export const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

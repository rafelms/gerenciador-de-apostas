import { supabaseAdmin } from './supabase-admin.ts'

export interface Chamador {
  id: string
  aal: string
  papel: 'admin' | 'membro'
  ativo: boolean
}

function lerClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1] ?? ''
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')))
}

/**
 * Identifica quem chamou a function a partir do JWT do header Authorization.
 * getUser() valida o token no Auth; o claim `aal` diz se a sessão passou pelo MFA.
 */
export async function obterChamador(req: Request): Promise<Chamador | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null

  const { data: perfil } = await supabaseAdmin
    .from('profiles')
    .select('papel, ativo')
    .eq('id', data.user.id)
    .maybeSingle()
  if (!perfil) return null

  return {
    id: data.user.id,
    aal: String(lerClaims(token).aal ?? ''),
    papel: perfil.papel,
    ativo: perfil.ativo,
  }
}

/** Admin ativo com sessão aal2 (MFA validado). */
export function ehAdminComMfa(c: Chamador | null): c is Chamador {
  return !!c && c.papel === 'admin' && c.ativo && c.aal === 'aal2'
}

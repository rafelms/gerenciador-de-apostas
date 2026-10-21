// Edge Function admin-usuarios (seção 10.3)
//   POST /admin-usuarios/convidar  { email, nome }
//   POST /admin-usuarios/desativar { user_id }
//   POST /admin-usuarios/reativar  { user_id }
// Requer JWT de admin ativo com aal2. Limite: 10 chamadas/min por admin.
import { alterarUsuarioSchema, convidarUsuarioSchema } from '../_shared/domain/schemas/auth.ts'
import { ehAdminComMfa, obterChamador } from '../_shared/auth.ts'
import { cabecalhosCors, responderPreflight } from '../_shared/cors.ts'
import { erro, json } from '../_shared/respostas.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'

const LIMITE_USUARIOS_ATIVOS = 5 // inclui o admin
const BAN_DESATIVADO = '876000h' // ~100 anos: bloqueia login e refresh até reativar

async function convidar(req: Request, corpo: unknown): Promise<Response> {
  const entrada = convidarUsuarioSchema.safeParse(corpo)
  if (!entrada.success) return erro(req, 400, 'Dados inválidos.')

  const { count } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('ativo', true)
  if ((count ?? 0) >= LIMITE_USUARIOS_ATIVOS) {
    return erro(req, 409, `Limite de ${LIMITE_USUARIOS_ATIVOS} usuários ativos atingido.`)
  }

  const origem = req.headers.get('origin') ?? cabecalhosCors(req)['Access-Control-Allow-Origin']
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(entrada.data.email, {
    data: { nome: entrada.data.nome }, // o trigger handle_new_user usa este nome no perfil
    redirectTo: `${origem}/convite`,
  })
  if (error || !data.user) return erro(req, 400, 'Não foi possível enviar o convite.')

  return json(req, { user_id: data.user.id })
}

async function desativar(req: Request, corpo: unknown, chamadorId: string): Promise<Response> {
  const entrada = alterarUsuarioSchema.safeParse(corpo)
  if (!entrada.success) return erro(req, 400, 'Dados inválidos.')
  const { user_id } = entrada.data
  if (user_id === chamadorId) return erro(req, 400, 'Você não pode desativar a si mesmo.')

  const { error } = await supabaseAdmin.from('profiles').update({ ativo: false }).eq('id', user_id)
  if (error) return erro(req, 400, 'Não foi possível desativar.')

  // Bloqueia novos logins/refresh e derruba as sessões abertas.
  await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: BAN_DESATIVADO })
  await supabaseAdmin.rpc('fn_revogar_sessoes', { p_user_id: user_id })

  return json(req, { ok: true })
}

async function reativar(req: Request, corpo: unknown): Promise<Response> {
  const entrada = alterarUsuarioSchema.safeParse(corpo)
  if (!entrada.success) return erro(req, 400, 'Dados inválidos.')
  const { user_id } = entrada.data

  const { count } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('ativo', true)
  if ((count ?? 0) >= LIMITE_USUARIOS_ATIVOS) {
    return erro(req, 409, `Limite de ${LIMITE_USUARIOS_ATIVOS} usuários ativos atingido.`)
  }

  const { error } = await supabaseAdmin.from('profiles').update({ ativo: true }).eq('id', user_id)
  if (error) return erro(req, 400, 'Não foi possível reativar.')
  await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: 'none' })

  return json(req, { ok: true })
}

Deno.serve(async (req) => {
  const preflight = responderPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return erro(req, 405, 'Método não permitido.')

  const chamador = await obterChamador(req)
  if (!ehAdminComMfa(chamador)) return erro(req, 403, 'Acesso negado.')

  const { data: dentroDoLimite } = await supabaseAdmin.rpc('fn_registrar_chamada_admin', {
    p_user_id: chamador.id,
    p_limite: 10,
  })
  if (!dentroDoLimite) return erro(req, 429, 'Muitas requisições. Aguarde um minuto.')

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return erro(req, 400, 'Dados inválidos.')
  }

  const acao = new URL(req.url).pathname.split('/').filter(Boolean).at(-1)
  switch (acao) {
    case 'convidar':
      return convidar(req, corpo)
    case 'desativar':
      return desativar(req, corpo, chamador.id)
    case 'reativar':
      return reativar(req, corpo)
    default:
      return erro(req, 404, 'Ação desconhecida.')
  }
})

import type { ConvidarUsuarioInput } from '@shared/schemas/auth.ts'

import { supabase } from '@/lib/supabase'

export const chavesAdmin = {
  usuarios: ['admin', 'usuarios'] as const,
}

export async function listarUsuarios() {
  const { data, error } = await supabase.rpc('fn_admin_listar_usuarios')
  if (error) throw error
  return data
}

/** Chama a Edge Function admin-usuarios e devolve a mensagem de erro amigável, se houver. */
async function chamarAdminUsuarios(acao: 'convidar' | 'desativar' | 'reativar', corpo: object) {
  const { error } = await supabase.functions.invoke(`admin-usuarios/${acao}`, { body: corpo })
  if (error) {
    let mensagem = 'Não foi possível concluir. Tente de novo.'
    try {
      const resposta = (error as { context?: Response }).context
      const json = (await resposta?.json()) as { erro?: string } | undefined
      if (json?.erro) mensagem = json.erro
    } catch {
      // mantém a mensagem genérica
    }
    throw new Error(mensagem)
  }
}

export const convidarUsuario = (dados: ConvidarUsuarioInput) =>
  chamarAdminUsuarios('convidar', dados)
export const desativarUsuario = (user_id: string) => chamarAdminUsuarios('desativar', { user_id })
export const reativarUsuario = (user_id: string) => chamarAdminUsuarios('reativar', { user_id })

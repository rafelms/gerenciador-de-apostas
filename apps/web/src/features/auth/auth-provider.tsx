import type { AuthenticatorAssuranceLevels, Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database'
import { textosAuth } from './textos'

export type Perfil = Pick<Tables<'profiles'>, 'id' | 'nome' | 'papel' | 'ativo' | 'preferencias'>
type NivelAal = AuthenticatorAssuranceLevels | null

interface AuthContexto {
  carregando: boolean
  sessao: Session | null
  perfil: Perfil | null
  aalAtual: NivelAal
  aalProximo: NivelAal
  /** Usuário tem fator TOTP cadastrado mas ainda não o informou nesta sessão. */
  precisaMfa: boolean
  ehAdmin: boolean
  sair: () => Promise<void>
  recarregar: () => Promise<void>
}

interface DadosDaSessao {
  perfil: Perfil | null
  aalAtual: NivelAal
  aalProximo: NivelAal
}

const Contexto = createContext<AuthContexto | null>(null)

async function carregarDadosDaSessao(userId: string): Promise<DadosDaSessao> {
  const [{ data: perfil }, { data: nivel }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, nome, papel, ativo, preferencias')
      .eq('id', userId)
      .maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  return { perfil, aalAtual: nivel?.currentLevel ?? null, aalProximo: nivel?.nextLevel ?? null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [sessao, setSessao] = useState<Session | null>(null)
  const [sessaoCarregada, setSessaoCarregada] = useState(false)

  useEffect(() => {
    // Importante: não chamar o Supabase de dentro deste callback (pode travar o lock
    // interno do supabase-js). Só guardamos a sessão; a query abaixo faz o resto.
    // O evento INITIAL_SESSION entrega a sessão salva logo na inscrição.
    const { data } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao)
      setSessaoCarregada(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = sessao?.user.id
  // O token muda quando a sessão sobe para aal2 após o MFA: a chave inclui o token
  // para recarregar o nível. Entre tokens do MESMO usuário mantemos o dado anterior
  // (sem piscar a tela de carregamento na renovação automática).
  const consulta = useQuery({
    queryKey: ['sessao', userId, sessao?.access_token],
    queryFn: () => carregarDadosDaSessao(userId!),
    enabled: !!userId,
    staleTime: Infinity,
    placeholderData: (anterior, consultaAnterior) =>
      consultaAnterior?.queryKey[1] === userId ? anterior : undefined,
  })

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    // Logout limpa todo o cache de dados do servidor (seção 8.1).
    queryClient.clear()
  }, [queryClient])

  // RLS esconde o perfil de usuário desativado (eh_ativo() = false): desloga.
  const perfilBloqueado =
    consulta.isSuccess && (!consulta.data.perfil || !consulta.data.perfil.ativo)
  useEffect(() => {
    if (!perfilBloqueado) return
    toast.error(textosAuth.contaDesativada)
    void sair()
  }, [perfilBloqueado, sair])

  const { refetch } = consulta
  const recarregar = useCallback(async () => {
    await refetch()
  }, [refetch])

  const dados = userId && !perfilBloqueado ? consulta.data : undefined
  const perfil = dados?.perfil ?? null
  const aalAtual = dados?.aalAtual ?? null
  const aalProximo = dados?.aalProximo ?? null

  const valor = useMemo<AuthContexto>(
    () => ({
      carregando: !sessaoCarregada || (!!userId && consulta.isPending),
      sessao,
      perfil,
      aalAtual,
      aalProximo,
      precisaMfa: aalProximo === 'aal2' && aalAtual !== 'aal2',
      ehAdmin: perfil?.papel === 'admin' && perfil.ativo,
      sair,
      recarregar,
    }),
    [
      sessaoCarregada,
      userId,
      consulta.isPending,
      sessao,
      perfil,
      aalAtual,
      aalProximo,
      sair,
      recarregar,
    ],
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Contexto)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}

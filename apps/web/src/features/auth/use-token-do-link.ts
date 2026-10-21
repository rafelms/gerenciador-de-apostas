import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import { supabase } from '@/lib/supabase'

type Estado = 'verificando' | 'ok' | 'invalido'

/**
 * Links de e-mail (convite e recuperação) trazem `token_hash` na URL.
 * Trocamos o token por uma sessão com verifyOtp; sem token, aceitamos uma
 * sessão já existente (ex.: usuário logado que abriu a tela de novo).
 */
export function useTokenDoLink(tipo: 'invite' | 'recovery'): Estado {
  const [params] = useSearchParams()
  const [estado, setEstado] = useState<Estado>('verificando')
  const executado = useRef(false)
  const tokenHash = params.get('token_hash')

  useEffect(() => {
    // StrictMode roda efeitos duas vezes em dev; o token só pode ser usado uma vez.
    if (executado.current) return
    executado.current = true

    void (async () => {
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash })
        // Remove o token da barra de endereço (não fica no histórico).
        window.history.replaceState(null, '', window.location.pathname)
        setEstado(error ? 'invalido' : 'ok')
        return
      }
      const { data } = await supabase.auth.getSession()
      setEstado(data.session ? 'ok' : 'invalido')
    })()
  }, [tipo, tokenHash])

  return estado
}

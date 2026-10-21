import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { CarregandoTela } from '@/components/carregando-tela'
import { CodigoTotp } from '@/components/codigo-totp'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-provider'
import { AuthLayout } from './auth-layout'
import { textosAuth } from './textos'

/** Segundo fator: pede o código TOTP de 6 dígitos e eleva a sessão para aal2. */
export function MfaPage() {
  const { carregando, sessao, precisaMfa, recarregar, sair } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destino = (location.state as { de?: string } | null)?.de ?? '/'
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (carregando) return <CarregandoTela />
  if (!sessao) return <Navigate to="/login" replace />
  if (!precisaMfa) return <Navigate to={destino} replace />

  async function verificar(e: FormEvent) {
    e.preventDefault()
    if (!/^\d{6}$/.test(codigo)) {
      setErro('O código tem 6 dígitos.')
      return
    }
    setEnviando(true)
    setErro(null)
    const { data: fatores } = await supabase.auth.mfa.listFactors()
    const totp = fatores?.totp.find((f) => f.status === 'verified')
    if (!totp) {
      setEnviando(false)
      setErro(textosAuth.erroGenerico)
      return
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: totp.id,
      code: codigo,
    })
    setEnviando(false)
    if (error) {
      setErro(textosAuth.codigoInvalido)
      setCodigo('')
      return
    }
    await recarregar()
    navigate(destino, { replace: true })
  }

  return (
    <AuthLayout
      titulo="Verificação em duas etapas"
      descricao="Digite o código de 6 dígitos do seu app autenticador."
      rodape={
        <Button variant="link" onClick={() => void sair()}>
          Sair e usar outra conta
        </Button>
      }
    >
      <form onSubmit={verificar} className="grid gap-4" noValidate>
        <CodigoTotp valor={codigo} onChange={setCodigo} erro={erro} />
        <Button type="submit" disabled={enviando} className="w-full">
          {enviando && <Loader2 className="animate-spin" aria-hidden="true" />}
          Verificar
        </Button>
      </form>
    </AuthLayout>
  )
}

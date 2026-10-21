import { useQuery } from '@tanstack/react-query'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { CodigoTotp } from '@/components/codigo-totp'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-provider'
import { supabase } from '@/lib/supabase'

interface Cadastro {
  factorId: string
  qrCode: string // SVG em data URL, exibido via <img> (sem innerHTML)
  segredo: string
}

/** Ativar/desativar o segundo fator (TOTP). Obrigatório para admin, recomendado para membros. */
export function SecaoMfa() {
  const { recarregar, ehAdmin } = useAuth()
  const [cadastro, setCadastro] = useState<Cadastro | null>(null)
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const fatores = useQuery({
    queryKey: ['mfa', 'fatores'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      return data
    },
  })
  const fatorAtivo = fatores.data?.totp.find((f) => f.status === 'verified')?.id ?? null
  const carregando = fatores.isPending

  async function carregarFatores() {
    await fatores.refetch()
  }

  async function iniciarCadastro() {
    setErro(null)
    setEnviando(true)
    // Remove cadastros anteriores não concluídos para não acumular fatores pendentes.
    const { data: lista } = await supabase.auth.mfa.listFactors()
    for (const f of lista?.all ?? []) {
      if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `LotoGestor ${new Date().toISOString().slice(0, 10)}`,
    })
    setEnviando(false)
    if (error || !data) {
      toast.error('Não foi possível iniciar a ativação. Tente de novo.')
      return
    }
    setCadastro({ factorId: data.id, qrCode: data.totp.qr_code, segredo: data.totp.secret })
  }

  async function confirmarCadastro(e: FormEvent) {
    e.preventDefault()
    if (!cadastro) return
    if (!/^\d{6}$/.test(codigo)) {
      setErro('O código tem 6 dígitos.')
      return
    }
    setEnviando(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: cadastro.factorId,
      code: codigo,
    })
    setEnviando(false)
    if (error) {
      setErro('Código inválido. Confira o app autenticador e tente de novo.')
      setCodigo('')
      return
    }
    toast.success('Verificação em duas etapas ativada.')
    setCadastro(null)
    setCodigo('')
    await carregarFatores()
    await recarregar()
  }

  async function desativar() {
    if (!fatorAtivo) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorAtivo })
    if (error) {
      toast.error('Para desativar, entre de novo usando o código do autenticador.')
      return
    }
    toast.success('Verificação em duas etapas desativada.')
    await supabase.auth.refreshSession()
    await carregarFatores()
    await recarregar()
  }

  if (carregando) {
    return <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Carregando" />
  }

  if (fatorAtivo) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-lucro" aria-hidden="true" />
          <span className="font-medium">Verificação em duas etapas</span>
          <Badge variant="secondary">Ativa</Badge>
        </div>
        <ConfirmDialog
          titulo="Desativar a verificação em duas etapas?"
          descricao={
            ehAdmin
              ? 'Sem ela você perde o acesso à área de administração até ativar de novo.'
              : 'Sua conta fica protegida apenas pela senha.'
          }
          textoConfirmar="Desativar"
          destrutivo
          onConfirmar={desativar}
        >
          <Button variant="outline">
            <ShieldOff aria-hidden="true" /> Desativar
          </Button>
        </ConfirmDialog>
      </div>
    )
  }

  if (cadastro) {
    return (
      <form onSubmit={confirmarCadastro} className="grid gap-4">
        <ol className="grid list-decimal gap-1 pl-5 text-sm">
          <li>Abra um app autenticador (Google Authenticator, Authy, 1Password…).</li>
          <li>Escaneie o QR code ou digite o código manual.</li>
          <li>Informe o código de 6 dígitos gerado pelo app.</li>
        </ol>
        <img
          src={cadastro.qrCode}
          alt="QR code para cadastrar o LotoGestor no app autenticador"
          className="mx-auto size-48 rounded-lg bg-white p-2"
        />
        <p className="text-center text-sm">
          Código manual:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 break-all">{cadastro.segredo}</code>
        </p>
        <CodigoTotp valor={codigo} onChange={setCodigo} erro={erro} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setCadastro(null)}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" aria-hidden="true" />}
            Confirmar e ativar
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-medium">Verificação em duas etapas</p>
        <p className="text-sm text-muted-foreground">
          {ehAdmin
            ? 'Obrigatória para a área de administração.'
            : 'Recomendada: protege sua conta mesmo se a senha vazar.'}
        </p>
      </div>
      <Button onClick={() => void iniciarCadastro()} disabled={enviando}>
        {enviando ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
        Ativar
      </Button>
    </div>
  )
}

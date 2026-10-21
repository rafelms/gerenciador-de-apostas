import type { RegraModalidade } from '@shared/regras/tipos.ts'
import { resultadoManualSchema, type ResultadoManualInput } from '@shared/schemas/resultados.ts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardPen, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Campo } from '@/components/campo'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { informarResultado, type ConcursoDaAposta } from '@/features/conferencia/api'
import { CamposResultado } from '@/features/resultados/campos-resultado'
import {
  rateioDoFormulario,
  rateioParaFormulario,
  type RateioDoFormulario,
} from '@/features/resultados/rateio-formulario'
import { hojeIso } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'

interface InformarResultadoProps {
  apostaId: string
  slug: string
  regra: RegraModalidade
  numero: number
  /** Resultado não oficial já informado (para corrigir); null quando ainda não há. */
  atual: ConcursoDaAposta['resultado']
}

/**
 * O usuário informa o resultado de um concurso da aposta enquanto a API da CAIXA não
 * traz o oficial. Vale para todas as apostas do concurso; o oficial o substitui.
 */
export function InformarResultado({
  apostaId,
  slug,
  regra,
  numero,
  atual,
}: InformarResultadoProps) {
  const queryClient = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const [data, setData] = useState(hojeIso())
  const [dezenas, setDezenas] = useState<number[]>([])
  const [acumulado, setAcumulado] = useState(false)
  const [rateio, setRateio] = useState<RateioDoFormulario>({})
  const [erros, setErros] = useState<string[]>([])

  // Cada abertura parte do resultado atual (pode ter mudado desde a última vez).
  function abrir(valor: boolean) {
    if (valor) {
      setData(atual?.dataSorteio ?? hojeIso())
      setDezenas(atual?.dezenas ?? [])
      setAcumulado(!!atual?.acumulado)
      setRateio(atual ? rateioParaFormulario(atual.rateio) : {})
      setErros([])
    }
    setAberto(valor)
  }

  const salvar = useMutation({
    mutationFn: (r: ResultadoManualInput) => informarResultado(apostaId, r),
    onSuccess: (r) => {
      toast.success(
        r.premiadas > 0
          ? 'Resultado salvo. Sua aposta foi premiada!'
          : 'Resultado salvo e aposta conferida.',
      )
      void queryClient.invalidateQueries({ queryKey: chaves.apostas })
      void queryClient.invalidateQueries({ queryKey: chaves.notificacoes })
      void queryClient.invalidateQueries({ queryKey: ['concursos'] })
      setAberto(false)
    },
    onError: (e) => toast.error(e.message),
  })

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const entrada = resultadoManualSchema.safeParse({
      modalidadeSlug: slug,
      numero,
      dataSorteio: data,
      dezenas,
      rateio: rateioDoFormulario(regra, rateio),
      acumulado,
    })
    if (!entrada.success) {
      setErros(
        entrada.error.issues.map((i) =>
          i.path[0] === 'rateio' ? 'Confira os valores do rateio.' : i.message,
        ),
      )
      return
    }
    setErros([])
    salvar.mutate(entrada.data)
  }

  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ClipboardPen aria-hidden="true" /> {atual ? 'Corrigir resultado' : 'Informar resultado'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {atual ? 'Corrigir' : 'Informar'} resultado do concurso {numero}
          </DialogTitle>
          <DialogDescription>
            Use se você já sabe o resultado e ele ainda não chegou aqui. Ele vale para todas as
            apostas deste concurso e é trocado pelo resultado oficial da CAIXA assim que ele for
            sincronizado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} noValidate className="grid gap-5">
          <Campo label="Data do sorteio">
            <Input
              type="date"
              className="w-fit"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </Campo>
          <CamposResultado
            regra={regra}
            dezenas={dezenas}
            onDezenas={setDezenas}
            acumulado={acumulado}
            onAcumulado={setAcumulado}
            rateio={rateio}
            onRateio={setRateio}
          />
          {erros.length > 0 && (
            <ul role="alert" className="grid gap-1 text-sm font-medium text-destructive">
              {[...new Set(erros)].map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar e conferir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

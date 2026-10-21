import { useFormContext } from 'react-hook-form'
import { toast } from 'sonner'

import { ModalidadeChip } from '@/components/modalidade-chip'
import { Skeleton } from '@/components/ui/skeleton'
import { useModalidades } from '@/features/modalidades/use-modalidades'
import type { FormAposta } from './estado'

export function SecaoModalidade({ bloqueada }: { bloqueada: boolean }) {
  const { watch, setValue, getValues, formState } = useFormContext<FormAposta>()
  const { data: modalidades, isPending } = useModalidades()
  const atual = watch('modalidadeSlug')
  const erro = formState.errors.modalidadeSlug?.message

  function escolher(slug: FormAposta['modalidadeSlug']) {
    if (slug === atual) return
    // Dezenas de uma modalidade não valem para outra: recomeça os jogos.
    const tinhaDezenas = getValues('jogos').some((j) => j.dezenas.length > 0)
    setValue('modalidadeSlug', slug, { shouldValidate: formState.isSubmitted })
    setValue('jogos', [{ dezenas: [] }])
    setValue('concursoInicial', '')
    if (tinhaDezenas) toast.info('Os jogos foram limpos para a nova modalidade.')
  }

  if (isPending) return <Skeleton className="h-11 w-full" />

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Modalidade</legend>
      <div className="flex flex-wrap gap-2">
        {modalidades?.map((m) => (
          <ModalidadeChip
            key={m.slug}
            nome={m.nome}
            cor={m.cor}
            selecionado={atual === m.slug}
            disabled={bloqueada && atual !== m.slug}
            onClick={() => escolher(m.slug)}
          />
        ))}
      </div>
      {bloqueada && (
        <p className="text-sm text-muted-foreground">
          A modalidade não muda depois que a aposta foi criada.
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
    </fieldset>
  )
}

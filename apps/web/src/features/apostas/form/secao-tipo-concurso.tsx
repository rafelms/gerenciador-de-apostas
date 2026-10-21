import { useQuery } from '@tanstack/react-query'
import { Repeat, Ticket, Users } from 'lucide-react'
import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'

import { Campo } from '@/components/campo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Modalidade } from '@/features/modalidades/use-modalidades'
import { formatarData } from '@/lib/formatadores'
import { chaves } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { ultimoConcurso } from '../api'
import type { FormAposta } from './estado'

const tipos = [
  { valor: 'simples', rotulo: 'Simples', descricao: 'Um ou mais jogos', icone: Ticket },
  { valor: 'bolao', rotulo: 'Bolão', descricao: 'Cotas de um bolão', icone: Users },
  { valor: 'teimosinha', rotulo: 'Teimosinha', descricao: 'Vários concursos', icone: Repeat },
] as const

export function SecaoTipoConcurso({
  modalidade,
  edicao,
}: {
  modalidade: Modalidade | undefined
  edicao: boolean
}) {
  const { watch, setValue, register, getValues, formState } = useFormContext<FormAposta>()
  const tipo = watch('tipo')
  const erros = formState.errors

  const ultimo = useQuery({
    queryKey: chaves.ultimoConcurso(modalidade?.id ?? 0),
    queryFn: () => ultimoConcurso(modalidade!.id),
    enabled: !!modalidade,
  })
  const sugestao = ultimo.data ? ultimo.data.numero + 1 : null

  // Preenche o próximo concurso automaticamente numa aposta nova.
  useEffect(() => {
    if (!edicao && sugestao && !getValues('concursoInicial'))
      setValue('concursoInicial', String(sugestao))
  }, [edicao, sugestao, getValues, setValue])

  // Lotomania: a teimosinha só vale para quantidades fixas (2, 3, 4, 6, 8, 9 ou 12).
  const qtdsFixas = modalidade?.regra.teimosinhaConcursos ?? null
  const qtdConcursos = watch('qtdConcursos')

  function escolherTipo(novo: FormAposta['tipo']) {
    setValue('tipo', novo)
    const atual = Number(getValues('qtdConcursos'))
    if (novo === 'teimosinha' && qtdsFixas && !qtdsFixas.includes(atual))
      setValue('qtdConcursos', String(qtdsFixas[0]))
    else if (novo === 'teimosinha' && atual < 2) setValue('qtdConcursos', '2')
    if (novo !== 'teimosinha') setValue('qtdConcursos', '1')
  }

  return (
    <div className="grid gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Tipo de aposta</legend>
        <div role="radiogroup" aria-label="Tipo de aposta" className="grid grid-cols-3 gap-2">
          {tipos.map(({ valor, rotulo, descricao, icone: Icone }) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={tipo === valor}
              onClick={() => escolherTipo(valor)}
              className={cn(
                'flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition-colors duration-150',
                tipo === valor
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-accent',
              )}
            >
              <Icone className="size-5" aria-hidden="true" />
              <span className="text-sm font-semibold">{rotulo}</span>
              <span
                className={cn('text-xs', tipo === valor ? 'opacity-90' : 'text-muted-foreground')}
              >
                {descricao}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          label={tipo === 'teimosinha' ? 'Concurso inicial' : 'Concurso'}
          erro={erros.concursoInicial?.message}
          ajuda={
            sugestao && ultimo.data ? (
              <span className="flex flex-wrap items-center gap-x-2">
                Próximo: {sugestao}
                {ultimo.data.data_proximo && ` (sorteio ${formatarData(ultimo.data.data_proximo)})`}
                {watch('concursoInicial') !== String(sugestao) && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => setValue('concursoInicial', String(sugestao))}
                  >
                    Usar
                  </Button>
                )}
              </span>
            ) : undefined
          }
        >
          <Input inputMode="numeric" autoComplete="off" {...register('concursoInicial')} />
        </Campo>

        {tipo === 'teimosinha' && !qtdsFixas && (
          <Campo
            label="Quantidade de concursos"
            erro={erros.qtdConcursos?.message}
            ajuda="De 2 a 24 concursos seguidos."
          >
            <Input
              type="number"
              inputMode="numeric"
              min={2}
              max={24}
              {...register('qtdConcursos')}
            />
          </Campo>
        )}
      </div>

      {tipo === 'teimosinha' && qtdsFixas && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Quantidade de concursos</legend>
          <div
            role="radiogroup"
            aria-label="Quantidade de concursos"
            className="flex flex-wrap gap-2"
          >
            {qtdsFixas.map((q) => (
              <button
                key={q}
                type="button"
                role="radio"
                aria-checked={qtdConcursos === String(q)}
                onClick={() =>
                  setValue('qtdConcursos', String(q), { shouldValidate: formState.isSubmitted })
                }
                className={cn(
                  'min-h-11 min-w-11 rounded-full border px-3 text-sm font-semibold tabular-nums transition-colors duration-150',
                  qtdConcursos === String(q)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent',
                )}
              >
                {q}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A {modalidade?.nome} aceita só estas quantidades de concursos seguidos.
          </p>
          {erros.qtdConcursos?.message && (
            <p role="alert" className="mt-1.5 text-sm font-medium text-destructive">
              {erros.qtdConcursos.message}
            </p>
          )}
        </fieldset>
      )}
    </div>
  )
}

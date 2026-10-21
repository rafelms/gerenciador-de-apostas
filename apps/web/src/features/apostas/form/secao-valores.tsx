import { formatarBRL } from '@shared/dinheiro.ts'
import { TriangleAlert } from 'lucide-react'
import { useFormContext } from 'react-hook-form'

import { Campo } from '@/components/campo'
import { InputDinheiro } from '@/components/input-dinheiro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Modalidade } from '@/features/modalidades/use-modalidades'
import { avisos, tarifaAcimaDoLimite, valorCalculado, type FormAposta } from './estado'

export function SecaoValores({ modalidade }: { modalidade: Modalidade | undefined }) {
  const { watch, register, setValue, formState } = useFormContext<FormAposta>()
  const form = watch()
  const erros = formState.errors
  const calculado = valorCalculado(form, modalidade)
  const listaAvisos = avisos(form, modalidade)

  // Enquanto o usuário não digita o valor pago, mostramos o calculado.
  const registroPago = register('valorPago', {
    onChange: () => setValue('valorPagoManual', true),
  })

  return (
    <div className="grid gap-4">
      {form.tipo === 'bolao' && (
        <div className="grid grid-cols-2 gap-4">
          <Campo label="Total de cotas" erro={erros.totalCotas?.message}>
            <Input inputMode="numeric" autoComplete="off" {...register('totalCotas')} />
          </Campo>
          <Campo label="Suas cotas" erro={erros.cotasUsuario?.message}>
            <Input inputMode="numeric" autoComplete="off" {...register('cotasUsuario')} />
          </Campo>
          <Campo label="Valor da cota" erro={erros.valorCota?.message}>
            <InputDinheiro {...register('valorCota')} />
          </Campo>
          <Campo
            label="Tarifa de serviço"
            erro={erros.tarifa?.message}
            ajuda={tarifaAcimaDoLimite(form) ? undefined : 'Até 35% do valor da cota.'}
          >
            <InputDinheiro {...register('tarifa')} />
          </Campo>
          <Campo
            label="Nº da cota (opcional)"
            erro={erros.numeroCota?.message}
            ajuda='"Cota: 35/38" → 35'
          >
            <Input inputMode="numeric" autoComplete="off" {...register('numeroCota')} />
          </Campo>
        </div>
      )}

      <div className="grid gap-2 rounded-xl border bg-muted/50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {form.tipo === 'bolao' ? 'Cotas × (cota + tarifa)' : 'Custo calculado'}
          </span>
          <span className="text-lg font-bold tabular-nums">
            {calculado !== null ? formatarBRL(calculado) : '—'}
          </span>
        </div>
        {form.tipo === 'teimosinha' && calculado !== null && (
          <p className="text-xs text-muted-foreground">
            Já multiplicado por {form.qtdConcursos} concursos.
          </p>
        )}
      </div>

      <Campo
        label="Valor pago"
        erro={erros.valorPago?.message}
        ajuda={
          form.valorPagoManual && calculado !== null ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => {
                setValue('valorPagoManual', false)
                setValue('valorPago', '')
              }}
            >
              Usar o valor calculado
            </Button>
          ) : (
            'Preenchido com o valor calculado. Edite se pagou outro valor.'
          )
        }
      >
        <InputDinheiro
          {...registroPago}
          value={
            form.valorPagoManual
              ? form.valorPago
              : calculado !== null
                ? formatarBRL(calculado).replace('R$ ', '')
                : ''
          }
        />
      </Campo>

      {listaAvisos.length > 0 && (
        <ul className="grid gap-2" aria-live="polite">
          {listaAvisos.map((a) => (
            <li
              key={a}
              className="flex gap-2 rounded-lg border border-alerta/40 bg-alerta/10 p-3 text-sm"
            >
              <TriangleAlert className="size-4 shrink-0 text-alerta" aria-hidden="true" />
              {a}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

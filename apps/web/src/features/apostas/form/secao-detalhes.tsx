import { calcularGastoUsuario, formatarBRL, ratearMaiorResto } from '@shared/dinheiro.ts'
import { Plus, Trash2 } from 'lucide-react'
import { useFieldArray, useFormContext } from 'react-hook-form'

import { Campo } from '@/components/campo'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Modalidade } from '@/features/modalidades/use-modalidades'
import { valorPagoEfetivo, type FormAposta } from './estado'

const LOCAIS = ['App Loterias CAIXA', 'Lotérica', 'Internet Banking']

function TabelaDivisao({ valorPago, participantes }: { valorPago: number; participantes: FormAposta['participantes'] }) {
  const pesos = participantes.map((p) => Number(p.peso.replace(',', '.')))
  if (pesos.some((p) => !(p > 0))) return null
  const soma = pesos.reduce((a, b) => a + b, 0)
  const partes = ratearMaiorResto(valorPago, pesos)
  const seu = calcularGastoUsuario(
    valorPago,
    participantes.map((p, i) => ({ peso: pesos[i]!, ehUsuario: p.ehUsuario })),
  )
  return (
    <div className="grid gap-1 text-sm">
      <p className="text-muted-foreground">
        Sua parte no gasto: <strong className="text-foreground tabular-nums">{formatarBRL(seu)}</strong>
      </p>
      <ul className="grid gap-0.5 text-muted-foreground">
        {participantes.map((p, i) => (
          <li key={i} className="flex justify-between gap-2 tabular-nums">
            <span className="truncate">{p.nome || `Pessoa ${i + 1}`}</span>
            <span>
              {((pesos[i]! / soma) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% · {formatarBRL(partes[i]!)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SecaoDetalhes({ modalidade }: { modalidade: Modalidade | undefined }) {
  const { control, register, watch, setValue, formState } = useFormContext<FormAposta>()
  const { fields, append, remove } = useFieldArray({ control, name: 'participantes' })
  const form = watch()
  const erros = formState.errors
  const valorPago = valorPagoEfetivo(form, modalidade)

  function alternarDivisao(ativar: boolean) {
    setValue('dividir', ativar)
    if (ativar && form.participantes.length === 0) {
      // "Eu" entra por padrão (seção 11.2).
      setValue('participantes', [
        { nome: 'Eu', peso: '1', ehUsuario: true },
        { nome: '', peso: '1', ehUsuario: false },
      ])
    }
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-labelledby="titulo-divisao">
        <div className="flex items-center gap-3">
          <Checkbox id="dividir" checked={form.dividir} onCheckedChange={(v) => alternarDivisao(v === true)} className="size-5" />
          <Label htmlFor="dividir" id="titulo-divisao" className="text-base">
            Dividir com outras pessoas
          </Label>
        </div>

        {form.dividir && (
          <div className="grid gap-3">
            <ul className="grid gap-2">
              {fields.map((field, i) => (
                <li key={field.id} className="flex items-end gap-2">
                  <Campo label={i === 0 ? 'Nome' : `Nome da pessoa ${i + 1}`} className="min-w-0 flex-1">
                    <Input
                      autoComplete="off"
                      readOnly={form.participantes[i]?.ehUsuario}
                      {...register(`participantes.${i}.nome`)}
                    />
                  </Campo>
                  <Campo label="Peso" className="w-20">
                    <Input inputMode="decimal" autoComplete="off" {...register(`participantes.${i}.peso`)} />
                  </Campo>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={form.participantes[i]?.ehUsuario}
                    onClick={() => remove(i)}
                    aria-label={`Remover ${form.participantes[i]?.nome || `pessoa ${i + 1}`}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
            {erros.participantes?.message && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {erros.participantes.message}
              </p>
            )}
            <div>
              <Button type="button" variant="outline" onClick={() => append({ nome: '', peso: '1', ehUsuario: false })}>
                <Plus aria-hidden="true" /> Adicionar pessoa
              </Button>
            </div>
            {valorPago !== null && <TabelaDivisao valorPago={valorPago} participantes={form.participantes} />}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Data da aposta" erro={erros.dataAposta?.message}>
          <Input type="date" {...register('dataAposta')} />
        </Campo>
        <Campo label="Local da compra (opcional)" erro={erros.localCompra?.message}>
          <Input list="locais-compra" autoComplete="off" {...register('localCompra')} />
        </Campo>
        <datalist id="locais-compra">
          {LOCAIS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </div>
      <Campo label="Observação (opcional)" erro={erros.observacao?.message} ajuda={`${form.observacao.length}/500`}>
        <Textarea rows={3} maxLength={500} {...register('observacao')} />
      </Campo>
    </div>
  )
}

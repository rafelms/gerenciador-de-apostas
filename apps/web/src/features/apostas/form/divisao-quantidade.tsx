import { MAX_PARTICIPANTES, participantesPorQuantidade } from '@shared/aposta.ts'
import { formatarBRL } from '@shared/dinheiro.ts'
import { Hash, Minus, Plus, UsersRound } from 'lucide-react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { useId } from 'react'
import { useFormContext } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { qtdPessoasValida, type FormAposta } from './estado'

const modos = [
  {
    valor: 'pessoas',
    rotulo: 'Informar as pessoas',
    descricao: 'Nome e peso de cada um',
    icone: UsersRound,
  },
  {
    valor: 'quantidade',
    rotulo: 'Só a quantidade',
    descricao: 'Partes iguais, sem nomes',
    icone: Hash,
  },
] as const

/** Seletor entre dividir informando cada pessoa ou só a quantidade (radiogroup com setas). */
export function SeletorModoDivisao({
  valor,
  onChange,
}: {
  valor: FormAposta['modoDivisao']
  onChange: (modo: FormAposta['modoDivisao']) => void
}) {
  const idTitulo = useId()
  return (
    <div className="grid gap-2">
      <p id={idTitulo} className="text-sm font-medium">
        Como dividir?
      </p>
      <RadioGroupPrimitive.Root
        aria-labelledby={idTitulo}
        value={valor}
        onValueChange={(v) => onChange(v as FormAposta['modoDivisao'])}
        className="grid grid-cols-2 gap-2"
      >
        {modos.map(({ valor: v, rotulo, descricao, icone: Icone }) => (
          <RadioGroupPrimitive.Item
            key={v}
            value={v}
            className={cn(
              'flex min-h-16 items-center gap-2 rounded-lg border bg-card p-3 text-left transition-colors duration-150 outline-none',
              'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
              'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
            )}
          >
            <Icone className="size-5 shrink-0" aria-hidden="true" />
            <span className="grid min-w-0">
              <span className="text-sm font-semibold">{rotulo}</span>
              <span className="text-xs opacity-80">{descricao}</span>
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  )
}

/** "3 × R$ 1,43 e 1 × R$ 1,42": as partes das outras pessoas agrupadas por valor. */
function descreverOutras(partes: number[]): string {
  const grupos = new Map<number, number>()
  for (const p of partes) grupos.set(p, (grupos.get(p) ?? 0) + 1)
  const lista = [...grupos].sort((a, b) => b[0] - a[0])
  if (lista.length === 1) {
    const [valor, qtd] = lista[0]!
    return `${qtd === 1 ? 'a outra pessoa' : `as outras ${qtd} pessoas`}: ${formatarBRL(valor)}${qtd === 1 ? '' : ' cada'}`
  }
  return `outras pessoas: ${lista.map(([valor, qtd]) => `${qtd} × ${formatarBRL(valor)}`).join(' e ')}`
}

/** Modo "só a quantidade": um campo numérico (2…30) e o resumo da parte de cada um. */
export function DivisaoPorQuantidade({ valorPago }: { valorPago: number | null }) {
  const { register, watch, setValue, formState } = useFormContext<FormAposta>()
  const qtdTexto = watch('qtdPessoas')
  const qtd = qtdPessoasValida({ qtdPessoas: qtdTexto })
  const id = useId()

  function ajustar(delta: number) {
    const atual = Number.parseInt(qtdTexto, 10)
    const base = Number.isNaN(atual) ? 2 : atual
    const novo = Math.min(MAX_PARTICIPANTES, Math.max(2, base + delta))
    setValue('qtdPessoas', String(novo), { shouldValidate: formState.isSubmitted })
  }

  const partes =
    qtd !== null && valorPago !== null
      ? participantesPorQuantidade(valorPago, qtd).map((p) => p.contribuicaoCentavos)
      : null

  const erro = formState.errors.qtdPessoas?.message
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Quantas pessoas dividem?</Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => ajustar(-1)}
            disabled={qtd !== null && qtd <= 2}
            aria-label="Uma pessoa a menos"
          >
            <Minus aria-hidden="true" />
          </Button>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={2}
            max={MAX_PARTICIPANTES}
            step={1}
            autoComplete="off"
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? `${id}-ajuda ${id}-erro` : `${id}-ajuda`}
            className="h-11 w-24 text-center text-base tabular-nums"
            {...register('qtdPessoas')}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => ajustar(1)}
            disabled={qtd !== null && qtd >= MAX_PARTICIPANTES}
            aria-label="Uma pessoa a mais"
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">
          Contando com você. O valor pago é dividido em partes iguais.
        </p>
        {erro && (
          <p id={`${id}-erro`} role="alert" className="text-sm font-medium text-destructive">
            {erro}
          </p>
        )}
      </div>

      <div aria-live="polite" className="grid gap-1 text-sm">
        {partes ? (
          <>
            <p className="text-muted-foreground">
              Sua parte no gasto:{' '}
              <strong className="text-foreground tabular-nums">{formatarBRL(partes[0]!)}</strong>
            </p>
            <p className="text-muted-foreground tabular-nums">
              {formatarBRL(valorPago!)} ÷ {qtd} pessoas · {descreverOutras(partes.slice(1))}
            </p>
          </>
        ) : (
          qtd !== null && (
            <p className="text-muted-foreground">
              Informe o valor pago para ver a parte de cada um.
            </p>
          )
        )}
      </div>
    </div>
  )
}

import { formatarBRL } from '@shared/dinheiro.ts'
import type { RegraModalidade } from '@shared/regras/tipos.ts'
import { Eraser } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VolanteNumericoProps {
  regra: RegraModalidade
  selecionadas: number[]
  onChange: (dezenas: number[]) => void
  /** Preço da aposta simples vigente; null esconde o custo. */
  precoSimples: number | null
  rotulo?: string
}

/**
 * Volante: grade de dezenas clicáveis (seção 12.4).
 * 5 colunas no celular (alvos ≥ 44px a 360px) e 10 a partir de `sm`.
 * Mostra o contador "7/6–20" e o custo do jogo em tempo real.
 */
export function VolanteNumerico({
  regra,
  selecionadas,
  onChange,
  precoSimples,
  rotulo = 'Volante',
}: VolanteNumericoProps) {
  const marcadas = new Set(selecionadas)
  const qtd = marcadas.size
  const noLimite = qtd >= regra.maxMarcadas
  const valido = qtd >= regra.minMarcadas && qtd <= regra.maxMarcadas
  const custo = valido && precoSimples ? regra.custoJogo(qtd, precoSimples) : null

  function alternar(d: number) {
    if (marcadas.has(d)) {
      onChange(selecionadas.filter((x) => x !== d))
    } else if (!noLimite) {
      onChange([...selecionadas, d].sort((a, b) => a - b))
    }
  }

  const numeros = Array.from(
    { length: regra.universoMax - regra.universoMin + 1 },
    (_, i) => regra.universoMin + i,
  )

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" aria-live="polite">
          <span className={cn('font-semibold tabular-nums', !valido && qtd > 0 && 'text-alerta')}>
            {qtd}/{regra.minMarcadas}–{regra.maxMarcadas}
          </span>{' '}
          <span className="text-muted-foreground">dezenas</span>
          {custo !== null && (
            <>
              {' · '}
              <span className="font-semibold tabular-nums">{formatarBRL(custo)}</span>
            </>
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange([])}
          disabled={qtd === 0}
        >
          <Eraser aria-hidden="true" /> Limpar
        </Button>
      </div>
      <div role="group" aria-label={rotulo} className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {numeros.map((d) => {
          const ativa = marcadas.has(d)
          const texto = d.toString().padStart(2, '0')
          return (
            <button
              key={d}
              type="button"
              aria-pressed={ativa}
              aria-label={`Dezena ${texto}`}
              disabled={!ativa && noLimite}
              onClick={() => alternar(d)}
              className={cn(
                'flex h-11 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors duration-150',
                'disabled:cursor-not-allowed disabled:opacity-40',
                ativa ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent',
              )}
            >
              {texto}
            </button>
          )
        })}
      </div>
      {noLimite && (
        <p className="text-sm text-muted-foreground">
          Máximo de {regra.maxMarcadas} dezenas atingido. Desmarque uma para trocar.
        </p>
      )}
    </div>
  )
}

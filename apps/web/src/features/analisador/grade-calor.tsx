import { cn } from '@/lib/utils'
import { estiloCalor, passoCalor } from './calor'

export function LegendaCalor({ maximo, unidade }: { maximo: number; unidade: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>0</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((p) => {
          const e = estiloCalor(p)
          return <span key={p} className={cn('size-3 rounded-sm', e.className)} style={e.style} />
        })}
      </span>
      <span>
        {maximo} {maximo === 1 ? unidade.replace(/s$/, '') : unidade}
      </span>
    </div>
  )
}

interface GradeCalorProps {
  /** Contagem por dezena, na ordem do universo. */
  contagens: { dezena: number; qtd: number }[]
  colunas: number
  /** Ex.: "jogos", "sorteios": vai no texto acessível de cada célula. */
  unidade: string
  /** Dezenas com contorno (ex.: as que estão nos seus jogos). */
  marcadas?: Set<number>
  rotulo: string
}

/** Volante com cada dezena colorida pela contagem e o número visível embaixo. */
export function GradeCalor({ contagens, colunas, unidade, marcadas, rotulo }: GradeCalorProps) {
  const maximo = Math.max(0, ...contagens.map((c) => c.qtd))
  return (
    <ul
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}
      aria-label={rotulo}
    >
      {contagens.map(({ dezena, qtd }) => {
        const e = estiloCalor(passoCalor(qtd, maximo))
        const marcada = marcadas?.has(dezena)
        return (
          <li
            key={dezena}
            className={cn(
              'flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg leading-none tabular-nums',
              e.className,
              marcada && 'ring-2 ring-destaque ring-offset-1 ring-offset-card',
            )}
            style={e.style}
            aria-label={`${String(dezena).padStart(2, '0')}: ${qtd} ${unidade}${marcada ? ', nos seus jogos' : ''}`}
          >
            <span className="text-xs font-semibold sm:text-sm" aria-hidden="true">
              {String(dezena).padStart(2, '0')}
            </span>
            <span className="mt-0.5 text-[0.625rem] sm:text-xs" aria-hidden="true">
              {qtd}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

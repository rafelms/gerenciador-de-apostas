import { useQuery } from '@tanstack/react-query'
import { formatarBRL } from '@shared/dinheiro.ts'
import { CircleCheck, OctagonAlert, PiggyBank, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'

import { chaves } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { nivelOrcamento, nomeOrcamento, orcamentosDoMes, type Orcamento } from './api'

const ESTILO = {
  ok: { barra: 'bg-primary', texto: 'text-muted-foreground', icone: CircleCheck },
  alerta: { barra: 'bg-alerta', texto: 'text-alerta', icone: TriangleAlert },
  estourado: { barra: 'bg-prejuizo', texto: 'text-prejuizo', icone: OctagonAlert },
} as const

/** Barra de progresso do orçamento: valor, percentual e estado com ícone (não só cor). */
export function BarraOrcamento({
  orcamento,
  className,
}: {
  orcamento: Orcamento
  className?: string
}) {
  const { gasto, limite } = orcamento
  const nivel = nivelOrcamento(gasto, limite)
  const pct = Math.round((gasto / limite) * 100)
  const { barra, texto, icone: Icone } = ESTILO[nivel]
  const nome = nomeOrcamento(orcamento)
  const estado =
    gasto > limite
      ? `${formatarBRL(gasto - limite)} acima do limite`
      : gasto === limite
        ? 'Limite atingido'
        : `Restam ${formatarBRL(limite - gasto)}`

  return (
    <div className={cn('grid gap-1.5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">{nome}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{formatarBRL(gasto)}</span>
          <span className="text-muted-foreground"> de {formatarBRL(limite)}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={orcamento.modalidadeNome ? `Orçamento de ${nome}` : 'Orçamento geral'}
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={Math.min(gasto, limite)}
        aria-valuetext={`${formatarBRL(gasto)} de ${formatarBRL(limite)} (${pct}%)`}
        className="h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', barra)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className={cn('flex items-center gap-1.5 text-xs', texto)}>
        <Icone className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="tabular-nums">{pct}% usado</span>
        <span className="text-muted-foreground">· {estado}</span>
      </p>
    </div>
  )
}

/**
 * Orçamentos do mês que valem para uma aposta: o geral e o da modalidade (se houver).
 * No dashboard e no formulário de aposta (seção 11.9). Sem orçamento, não mostra nada
 * (ou um convite discreto, com `convite`).
 */
export function ResumoOrcamento({
  mes,
  modalidadeId,
  convite = false,
  titulo,
  className,
}: {
  mes: string
  /** undefined = todos os do mês; null = só o geral. */
  modalidadeId?: number | null
  convite?: boolean
  /** Título mostrado só quando há orçamento. */
  titulo?: string
  className?: string
}) {
  const { data } = useQuery({
    queryKey: chaves.orcamento(mes),
    queryFn: () => orcamentosDoMes(mes),
  })
  if (!data) return null
  const lista =
    modalidadeId === undefined
      ? data
      : data.filter((o) => o.modalidadeId === null || o.modalidadeId === modalidadeId)

  if (lista.length === 0) {
    if (!convite) return null
    return (
      <p className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        <PiggyBank className="size-4 shrink-0" aria-hidden="true" />
        <span>
          Quer um limite mensal?{' '}
          <Link
            to="/orcamento"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Defina um orçamento
          </Link>
          .
        </span>
      </p>
    )
  }
  return (
    <div className={cn('grid gap-4', className)}>
      {titulo && <p className="text-sm font-medium">{titulo}</p>}
      {lista.map((o) => (
        <BarraOrcamento key={o.id} orcamento={o} />
      ))}
    </div>
  )
}

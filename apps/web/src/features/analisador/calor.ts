import type { CSSProperties } from 'react'

/**
 * Escala sequencial de um só tom (primary sobre muted) em 4 passos. O texto troca de cor
 * no 3º passo: todos os pares têm contraste ≥ 5:1 nos dois temas (verificado por script).
 */
const PASSOS = [15, 35, 65, 100] as const

/** 0 = sem ocorrência; 1–4 = passo da escala, proporcional ao máximo. */
export function passoCalor(valor: number, maximo: number): number {
  if (valor <= 0 || maximo <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((valor / maximo) * 4)))
}

export function estiloCalor(passo: number): { className: string; style?: CSSProperties } {
  if (passo === 0)
    return { className: 'border border-dashed border-border bg-transparent text-muted-foreground' }
  return {
    className: passo >= 3 ? 'text-primary-foreground' : 'text-foreground',
    style: {
      backgroundColor: `color-mix(in oklab, var(--primary) ${PASSOS[passo - 1]}%, var(--muted))`,
    },
  }
}

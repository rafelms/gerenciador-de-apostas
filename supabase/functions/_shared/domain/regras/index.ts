// ARQUIVO GERADO por `pnpm sync:shared` — edite em packages/shared/src.
import { lotofacil } from './lotofacil.ts'
import { megasena } from './megasena.ts'
import { quina } from './quina.ts'
import type { RegraModalidade, SlugModalidade } from './tipos.ts'

export type * from './tipos.ts'

export const regras: Record<SlugModalidade, RegraModalidade> = { megasena, lotofacil, quina }

export const SLUGS_MVP: SlugModalidade[] = ['megasena', 'lotofacil', 'quina']

export function ehSlugSuportado(slug: string): slug is SlugModalidade {
  return slug in regras
}

export function obterRegra(slug: string): RegraModalidade {
  if (!ehSlugSuportado(slug)) throw new Error(`Modalidade não suportada: ${slug}`)
  return regras[slug]
}

/**
 * Nome da modalidade → slug (Apêndice A.2): sem acento, minúsculo, sem espaço/hífen.
 *   "Mega-Sena" → "megasena" · "Lotofácil" → "lotofacil" · "+Milionária" → "maismilionaria"
 */
export function normalizarSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\+/g, 'mais')
    .replace(/[^a-z0-9]/g, '')
}

/** "02 09 24", "2-9-24", "02|09|24", "2,9;24" → [2, 9, 24] (ordenado). Tokens inválidos viram NaN. */
export function parseDezenas(texto: string): number[] {
  return texto
    .trim()
    .split(/[\s,;|-]+/)
    .filter(Boolean)
    .map((t) => (/^\d{1,2}$/.test(t) ? Number(t) : Number.NaN))
    .sort((a, b) => a - b)
}

export function ordenarDezenas(dezenas: number[]): number[] {
  return [...dezenas].sort((a, b) => a - b)
}

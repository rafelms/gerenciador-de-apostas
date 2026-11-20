// Formatação e linhas das tabelas do dashboard (sem componentes: o Fast Refresh fica feliz).

import { ModalidadeChip } from '@/components/modalidade-chip'
import { rotulosTipo } from '@/features/apostas/filtros'
import type { DadosDashboard } from './resumo'

export const COR_PADRAO = '#6A6F9E'

/** Percentual pt-BR; `sinal` mostra o + (ROI), já que o − sempre aparece. */
export const porcentagem = (v: number | null, sinal = false) =>
  v === null
    ? '—'
    : v.toLocaleString('pt-BR', {
        style: 'percent',
        maximumFractionDigits: 1,
        signDisplay: sinal ? 'exceptZero' : 'auto',
      })

export const linhasPorModalidade = (d: DadosDashboard) =>
  d.por_modalidade.map((m) => ({
    ...m,
    chave: m.slug,
    nome: <ModalidadeChip nome={m.nome} cor={m.cor ?? COR_PADRAO} />,
  }))

export const linhasPorTipo = (d: DadosDashboard) =>
  d.por_tipo.map((t) => ({ ...t, chave: t.tipo, nome: rotulosTipo[t.tipo] }))

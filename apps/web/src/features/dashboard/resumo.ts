import { supabase } from '@/lib/supabase'
import type { TipoAposta } from '@/features/apostas/api'
import type { PontoMensal } from './periodo'

// Tudo o que o dashboard mostra vem da fn_dashboard (F4.1) numa chamada só. Os
// valores são os mesmos da lista: parte do usuário, pela data da aposta.

export interface Totais {
  gasto: number
  recuperado: number
  saldo: number
  /** Saldo ÷ gasto (null sem gasto). */
  roi: number | null
  qtdApostas: number
  /** Fração de apostas premiadas entre as já conferidas (null sem conferidas). */
  taxaPremiadas: number | null
}

interface TotaisSql {
  gasto: number
  recuperado: number
  qtd_apostas: number
  qtd_finalizadas: number
  qtd_premiadas: number
}

export interface ValoresGrupo {
  qtd: number
  gasto: number
  recuperado: number
}

interface ApostaDestaque {
  id: string
  modalidade_slug: string
  modalidade_nome: string
  modalidade_cor: string | null
  tipo: TipoAposta
  concurso_inicial: number
  concurso_final: number
  data_aposta: string
}

export interface DadosDashboard {
  totais: TotaisSql
  mensal: PontoMensal[]
  por_modalidade: (ValoresGrupo & {
    modalidade_id: number
    slug: string
    nome: string
    cor: string | null
  })[]
  por_tipo: (ValoresGrupo & { tipo: TipoAposta })[]
  acertos: {
    slug: string
    nome: string
    cor: string | null
    max_acertos: number
    acertos: number
    qtd: number
  }[]
  top_saldo: (ApostaDestaque & { gasto: number; recuperado: number; saldo: number })[]
  top_acertos: (ApostaDestaque & { melhor_acerto: number; max_acertos: number })[]
  quase_la: {
    aposta_id: string
    modalidade_slug: string
    modalidade_nome: string
    modalidade_cor: string | null
    numero: number
    data_sorteio: string
    acertos: number
    max_acertos: number
  }[]
  proximos: {
    slug: string
    nome: string
    cor: string | null
    numero: number
    qtd_apostas: number
    data_sorteio: string | null
  }[]
}

/** KPIs a partir dos totais da fn_dashboard. */
export function calcularTotais(t: TotaisSql): Totais {
  const saldo = t.recuperado - t.gasto
  return {
    gasto: t.gasto,
    recuperado: t.recuperado,
    saldo,
    roi: t.gasto > 0 ? saldo / t.gasto : null,
    qtdApostas: t.qtd_apostas,
    taxaPremiadas: t.qtd_finalizadas > 0 ? t.qtd_premiadas / t.qtd_finalizadas : null,
  }
}

/** ROI de um grupo (null sem gasto). */
export const roi = (g: Pick<ValoresGrupo, 'gasto' | 'recuperado'>) =>
  g.gasto > 0 ? (g.recuperado - g.gasto) / g.gasto : null

export async function carregarDashboard(
  inicio: string | null,
  fim: string | null,
  modalidadeId: number | undefined,
) {
  const { data, error } = await supabase.rpc('fn_dashboard', {
    ...(inicio && { p_inicio: inicio }),
    ...(fim && { p_fim: fim }),
    ...(modalidadeId && { p_modalidade: modalidadeId }),
  })
  if (error) throw error
  return data as unknown as DadosDashboard
}

export async function ultimasApostas(limite = 5) {
  const { data, error } = await supabase
    .from('vw_apostas_resumo')
    .select('*')
    .order('data_aposta', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limite)
  if (error) throw error
  return data
}

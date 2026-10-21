import { supabase } from '@/lib/supabase'

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

interface LinhaResumo {
  gasto_usuario_centavos: number | null
  recuperado_usuario_centavos: number | null
  status: string | null
}

/** Soma os indicadores a partir das linhas do resumo (a mesma regra da lista). */
export function calcularTotais(linhas: LinhaResumo[]): Totais {
  const gasto = linhas.reduce((s, l) => s + (l.gasto_usuario_centavos ?? 0), 0)
  const recuperado = linhas.reduce((s, l) => s + (l.recuperado_usuario_centavos ?? 0), 0)
  const finalizadas = linhas.filter((l) => l.status === 'premiada' || l.status === 'nao_premiada')
  const premiadas = finalizadas.filter((l) => l.status === 'premiada').length
  return {
    gasto,
    recuperado,
    saldo: recuperado - gasto,
    roi: gasto > 0 ? (recuperado - gasto) / gasto : null,
    qtdApostas: linhas.length,
    taxaPremiadas: finalizadas.length > 0 ? premiadas / finalizadas.length : null,
  }
}

/** Indicadores do período (datas yyyy-mm-dd, inclusivas). A fn_dashboard em SQL substitui isto na fase 4. */
export async function carregarTotais(inicio: string, fim: string) {
  const { data, error } = await supabase
    .from('vw_apostas_resumo')
    .select('gasto_usuario_centavos, recuperado_usuario_centavos, status')
    .gte('data_aposta', inicio)
    .lte('data_aposta', fim)
  if (error) throw error
  return calcularTotais(data)
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

import { supabase } from '@/lib/supabase'

export interface UltimoResultado {
  modalidadeId: number
  numero: number
  dataSorteio: string
  dezenas: number[]
  acumulado: boolean | null
  dataProximo: string | null
  valorEstimadoProximoCentavos: number | null
  /** 'usuario' = informado por um usuário, ainda não confirmado pela API. */
  fonte: string
}

/** Último concurso SORTEADO de cada modalidade (seção 11.5). */
export async function ultimosResultados(modalidadeIds: number[]): Promise<UltimoResultado[]> {
  const respostas = await Promise.all(
    modalidadeIds.map((id) =>
      supabase
        .from('concursos')
        .select(
          'modalidade_id, numero, data_sorteio, dezenas, acumulado, data_proximo, valor_estimado_proximo_centavos, fonte',
        )
        .eq('modalidade_id', id)
        .not('dezenas', 'is', null)
        .order('numero', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  )
  return respostas.flatMap(({ data, error }) => {
    if (error) throw error
    return data
      ? [
          {
            modalidadeId: data.modalidade_id,
            numero: data.numero,
            dataSorteio: data.data_sorteio,
            dezenas: data.dezenas!,
            acumulado: data.acumulado,
            dataProximo: data.data_proximo,
            valorEstimadoProximoCentavos: data.valor_estimado_proximo_centavos,
            fonte: data.fonte,
          },
        ]
      : []
  })
}

export interface ConcursoDoUsuario {
  modalidadeId: number
  numero: number
  qtdApostas: number
  sorteado: boolean
  dataSorteio: string | null
  /** Soma dos prêmios líquidos (parte do usuário) neste concurso. */
  liquidoCentavos: number
  premiado: boolean
}

/** Concursos em que o usuário tem apostas, do mais recente para o mais antigo. */
export async function concursosDoUsuario(limite = 30): Promise<ConcursoDoUsuario[]> {
  const { data: pedidos, error } = await supabase
    .from('aposta_concursos')
    .select('modalidade_id, numero_concurso, aposta_id')
    .order('numero_concurso', { ascending: false })
    .limit(500)
  if (error) throw error

  const grupos = new Map<string, { modalidadeId: number; numero: number; apostas: Set<string> }>()
  for (const p of pedidos) {
    const chave = `${p.modalidade_id}:${p.numero_concurso}`
    const g = grupos.get(chave) ?? {
      modalidadeId: p.modalidade_id,
      numero: p.numero_concurso,
      apostas: new Set(),
    }
    g.apostas.add(p.aposta_id)
    grupos.set(chave, g)
  }
  const lista = [...grupos.values()]
    .sort((a, b) => b.numero - a.numero || a.modalidadeId - b.modalidadeId)
    .slice(0, limite)
  if (lista.length === 0) return []

  const [concursos, premios] = await Promise.all([
    supabase
      .from('concursos')
      .select('id, modalidade_id, numero, data_sorteio, dezenas')
      .in('modalidade_id', [...new Set(lista.map((l) => l.modalidadeId))])
      .in('numero', [...new Set(lista.map((l) => l.numero))]),
    supabase.from('premios').select('concurso_id, liquido_usuario_centavos'),
  ])
  if (concursos.error) throw concursos.error
  if (premios.error) throw premios.error

  return lista.map((l) => {
    const c = concursos.data.find(
      (x) => x.modalidade_id === l.modalidadeId && x.numero === l.numero,
    )
    const doConcurso = c ? premios.data.filter((p) => p.concurso_id === c.id) : []
    return {
      modalidadeId: l.modalidadeId,
      numero: l.numero,
      qtdApostas: l.apostas.size,
      sorteado: !!c?.dezenas,
      dataSorteio: c?.data_sorteio ?? null,
      liquidoCentavos: doConcurso.reduce((s, p) => s + p.liquido_usuario_centavos, 0),
      premiado: doConcurso.length > 0,
    }
  })
}

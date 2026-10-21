import { configDoBanco, type ConfigPremio } from '@shared/premio.ts'
import { rateioDoBanco } from '@shared/resultados.ts'

import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

export type Premio = Tables<'premios'> & {
  premio_divisoes: { participante_id: string; liquido_centavos: number }[]
}

export interface ConcursoDaAposta {
  numero: number
  /** null = concurso ainda não sorteado (ou sem resultado sincronizado). */
  resultado: {
    id: number
    dataSorteio: string
    dezenas: number[]
    rateio: ReturnType<typeof rateioDoBanco>
    fonte: string
  } | null
  /** Conferência por jogo (aposta_jogo_id → acertos/dezenas). */
  conferencias: Map<
    string,
    { acertos: number; dezenasAcertadas: number[]; premiosPorFaixa: Record<string, number> }
  >
  premio: Premio | null
}

/**
 * Resultado de cada concurso da aposta (teimosinha: vários), com a conferência
 * gravada e o prêmio. Tudo respeita a RLS do usuário.
 */
export async function carregarConferencia(aposta: {
  id: string
  modalidade_id: number
  concurso_inicial: number
  qtd_concursos: number
}): Promise<ConcursoDaAposta[]> {
  const fim = aposta.concurso_inicial + aposta.qtd_concursos - 1
  const [concursos, conferencias, premios] = await Promise.all([
    supabase
      .from('concursos')
      .select('id, numero, data_sorteio, dezenas, rateio, fonte')
      .eq('modalidade_id', aposta.modalidade_id)
      .gte('numero', aposta.concurso_inicial)
      .lte('numero', fim),
    supabase
      .from('conferencias')
      .select('aposta_jogo_id, concurso_id, acertos, dezenas_acertadas, premios_por_faixa')
      .eq('aposta_id', aposta.id),
    supabase
      .from('premios')
      .select('*, premio_divisoes (participante_id, liquido_centavos)')
      .eq('aposta_id', aposta.id),
  ])
  if (concursos.error) throw concursos.error
  if (conferencias.error) throw conferencias.error
  if (premios.error) throw premios.error

  return Array.from({ length: aposta.qtd_concursos }, (_, i) => {
    const numero = aposta.concurso_inicial + i
    const c = concursos.data.find((x) => x.numero === numero && x.dezenas)
    const mapa: ConcursoDaAposta['conferencias'] = new Map()
    if (c) {
      for (const cf of conferencias.data.filter((x) => x.concurso_id === c.id)) {
        mapa.set(cf.aposta_jogo_id, {
          acertos: cf.acertos,
          dezenasAcertadas: cf.dezenas_acertadas,
          premiosPorFaixa: cf.premios_por_faixa as Record<string, number>,
        })
      }
    }
    return {
      numero,
      resultado: c
        ? {
            id: c.id,
            dataSorteio: c.data_sorteio,
            dezenas: c.dezenas!,
            rateio: rateioDoBanco(c.rateio),
            fonte: c.fonte,
          }
        : null,
      conferencias: mapa,
      premio:
        (c && (premios.data.find((p) => p.concurso_id === c.id) as Premio | undefined)) ?? null,
    }
  })
}

/** Lê a mensagem amigável `{ erro }` que as Edge Functions devolvem. */
export async function mensagemDaFunction(error: unknown, padrao: string): Promise<string> {
  try {
    const resposta = (error as { context?: Response }).context
    const json = (await resposta?.json()) as { erro?: string } | undefined
    return json?.erro ?? padrao
  } catch {
    return padrao
  }
}

export interface ResumoConferirAgora {
  concursosConferidos: number
  /** Concursos da aposta ainda não sorteados. */
  futuros: number
  /** A API da CAIXA falhou; conferiu só com o que já estava no banco. */
  apiIndisponivel: boolean
}

/**
 * Pede a conferência da própria aposta (Edge Function conferir-apostas). Usada
 * depois de criar/editar a aposta, de informar prêmio à mão e no botão "Conferir
 * agora": a function busca na API da CAIXA o resultado que ainda não sincronizou,
 * sem esperar o cron. Idempotente.
 */
export async function conferirApostaAgora(apostaId: string) {
  const { data, error } = await supabase.functions.invoke<ResumoConferirAgora>('conferir-apostas', {
    body: { aposta_id: apostaId },
  })
  if (error) throw new Error(await mensagemDaFunction(error, 'Não foi possível conferir agora.'))
  return data!
}

export async function marcarResgatado(premioId: string, resgatado: boolean) {
  const { error } = await supabase.rpc('fn_marcar_resgatado', {
    p_premio_id: premioId,
    p_resgatado: resgatado,
  })
  if (error) throw new Error('Não foi possível atualizar o prêmio.')
}

/**
 * Prêmio informado à mão (seção 11.5). Cria ou atualiza o prêmio do concurso
 * com valor_informado_manual = true; a divisão é refeita pela conferência.
 */
export async function informarPremioManual(args: {
  premioId: string | null
  apostaId: string
  concursoId: number
  brutoUsuario: number
  irUsuario: number
  totalCotas: number | null
  cotasUsuario: number | null
  regraIr: object
}) {
  // Bruto da aposta inteira estimado a partir da parte do usuário (bolão).
  const brutoAposta =
    args.totalCotas && args.cotasUsuario
      ? Math.round((args.brutoUsuario * args.totalCotas) / args.cotasUsuario)
      : args.brutoUsuario
  const valores = {
    bruto_aposta_centavos: brutoAposta,
    bruto_usuario_centavos: args.brutoUsuario,
    ir_usuario_centavos: args.irUsuario,
    liquido_usuario_centavos: args.brutoUsuario - args.irUsuario,
    regra_ir: { ...args.regraIr, informado_manual: true },
    valor_informado_manual: true,
  }
  const { error } = args.premioId
    ? await supabase
        .from('premios')
        .update({ ...valores, faixas_sem_valor: [] })
        .eq('id', args.premioId)
    : await supabase
        .from('premios')
        // prazo_resgate é calculado pelo trigger (o usuário não tem GRANT nessa coluna).
        .insert({
          ...valores,
          aposta_id: args.apostaId,
          concurso_id: args.concursoId,
        } as unknown as TablesInsert<'premios'>)
  if (error) throw new Error('Não foi possível salvar o prêmio.')
  await conferirApostaAgora(args.apostaId)
}

/** Descarta o valor informado à mão e volta ao calculado pela conferência. */
export async function usarPremioCalculado(premioId: string, apostaId: string) {
  const { error } = await supabase.from('premios').delete().eq('id', premioId)
  if (error) throw new Error('Não foi possível desfazer.')
  await conferirApostaAgora(apostaId)
}

/** Configuração global (IR, prazos) — leitura para qualquer usuário ativo. */
export async function carregarConfigPremio(): Promise<ConfigPremio> {
  const { data, error } = await supabase.from('configuracoes').select('*').eq('id', 1).single()
  if (error) throw error
  return configDoBanco(data)
}

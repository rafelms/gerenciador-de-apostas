// Conferência de apostas (seção 10.2), usada pelas functions `conferir-apostas` e
// `sync-resultados`. IDEMPOTENTE: só faz upserts e recálculos, então rodar duas
// vezes dá o mesmo resultado (e a chave_dedup impede notificação repetida).
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  conferirJogos,
  premioBrutoAposta,
  statusDaAposta,
  type FaixaRateio,
} from './domain/conferencia.ts'
import { textoNotificacaoResultado } from './domain/notificacoes.ts'
import {
  calcularPremio,
  configDoBanco,
  dividirPremio,
  prazoResgate,
  valorFaixaBruto,
  type ConfigPremio,
} from './domain/premio.ts'
import { ehSlugSuportado, obterRegra } from './domain/regras/index.ts'
import type { RegraModalidade } from './domain/regras/tipos.ts'
import { rateioDoBanco } from './domain/resultados.ts'

interface Concurso {
  id: number
  modalidade_id: number
  numero: number
  data_sorteio: string
  dezenas: number[] | null
  rateio: unknown
}

interface Aposta {
  id: string
  user_id: string
  tipo: 'simples' | 'bolao' | 'teimosinha'
  status: string
  modalidade_id: number
  qtd_concursos: number
  bolao_total_cotas: number | null
  bolao_cotas_usuario: number | null
}

interface Contexto {
  db: SupabaseClient
  cfg: ConfigPremio
  regra: RegraModalidade
  modalidadeNome: string
  rateio: FaixaRateio[]
  concurso: Concurso
}

/** Resultado de uma aposta em um concurso, para montar a notificação do usuário. */
interface ResultadoAposta {
  apostaId: string
  userId: string
  premiada: boolean
  liquido: number
  valorPendente: boolean
  melhorAcerto: number
}

export interface ResumoConferencia {
  concursoId: number
  apostasConferidas: number
  premiadas: number
}

function exigir<T>(r: { data: T | null; error: { message: string } | null }, oQue: string): T {
  if (r.error) throw new Error(`Falha ao ${oQue}: ${r.error.message}`)
  return r.data as T
}

async function carregarConfig(db: SupabaseClient): Promise<ConfigPremio> {
  const cfg = exigir<Parameters<typeof configDoBanco>[0]>(
    await db.from('configuracoes').select('*').eq('id', 1).single(),
    'ler configurações',
  )
  return configDoBanco(cfg)
}

async function carregarContexto(db: SupabaseClient, concursoId: number): Promise<Contexto | null> {
  const concurso = exigir<Concurso | null>(
    await db
      .from('concursos')
      .select('id, modalidade_id, numero, data_sorteio, dezenas, rateio')
      .eq('id', concursoId)
      .maybeSingle(),
    'ler o concurso',
  )
  if (!concurso?.dezenas) return null // ainda não sorteado
  const modalidade = exigir<{ slug: string; nome: string }>(
    await db.from('modalidades').select('slug, nome').eq('id', concurso.modalidade_id).single(),
    'ler a modalidade',
  )
  if (!ehSlugSuportado(modalidade.slug)) return null
  return {
    db,
    cfg: await carregarConfig(db),
    regra: obterRegra(modalidade.slug),
    modalidadeNome: modalidade.nome,
    rateio: rateioDoBanco(concurso.rateio),
    concurso,
  }
}

/** Confere UMA aposta em UM concurso: conferências, prêmio e divisão. */
async function conferirApostaNoConcurso(ctx: Contexto, aposta: Aposta): Promise<ResultadoAposta> {
  const { db, cfg, regra, concurso } = ctx
  const jogos = exigir<{ id: string; dezenas: number[] }[]>(
    await db.from('aposta_jogos').select('id, dezenas').eq('aposta_id', aposta.id).order('ordem'),
    'ler os jogos',
  )
  const c = conferirJogos(
    regra,
    jogos.map((j) => j.dezenas),
    concurso.dezenas!,
  )

  if (jogos.length > 0) {
    exigir(
      await db.from('conferencias').upsert(
        jogos.map((j, i) => ({
          aposta_jogo_id: j.id,
          concurso_id: concurso.id,
          aposta_id: aposta.id,
          user_id: aposta.user_id,
          acertos: c.jogos[i]!.acertos,
          dezenas_acertadas: c.jogos[i]!.dezenasAcertadas,
          premios_por_faixa: c.jogos[i]!.premiosPorFaixa,
          conferido_em: new Date().toISOString(),
        })),
        { onConflict: 'aposta_jogo_id,concurso_id' },
      ),
      'gravar conferências',
    )
  }

  const existente = exigir<{
    id: string
    valor_informado_manual: boolean
    liquido_usuario_centavos: number
    bruto_usuario_centavos: number
  } | null>(
    await db
      .from('premios')
      .select('id, valor_informado_manual, liquido_usuario_centavos, bruto_usuario_centavos')
      .eq('aposta_id', aposta.id)
      .eq('concurso_id', concurso.id)
      .maybeSingle(),
    'ler o prêmio',
  )

  let premio: { id: string; bruto: number; liquido: number } | null = null
  let valorPendente = false

  if (existente?.valor_informado_manual) {
    // O valor informado pelo usuário prevalece sobre o calculado.
    premio = {
      id: existente.id,
      bruto: existente.bruto_usuario_centavos,
      liquido: existente.liquido_usuario_centavos,
    }
  } else if (c.premiada) {
    const bruto = premioBrutoAposta(c.premiosPorFaixa, ctx.rateio, (v) => valorFaixaBruto(v, cfg))
    valorPendente = bruto.faixasSemValor.length > 0
    const bolao =
      aposta.tipo === 'bolao'
        ? { totalCotas: aposta.bolao_total_cotas, cotasUsuario: aposta.bolao_cotas_usuario }
        : {}
    const p = calcularPremio({ brutoAposta: bruto.brutoCentavos, ...bolao }, cfg)
    const gravado = exigir<{ id: string }>(
      await db
        .from('premios')
        .upsert(
          {
            aposta_id: aposta.id,
            user_id: aposta.user_id,
            concurso_id: concurso.id,
            bruto_aposta_centavos: p.brutoAposta,
            bruto_usuario_centavos: p.brutoUsuario,
            ir_usuario_centavos: p.irUsuario,
            liquido_usuario_centavos: p.liquidoUsuario,
            regra_ir: p.regraIr,
            faixas_sem_valor: bruto.faixasSemValor,
            prazo_resgate: prazoResgate(concurso.data_sorteio, cfg.prazoResgateDias),
          },
          { onConflict: 'aposta_id,concurso_id' },
        )
        .select('id')
        .single(),
      'gravar o prêmio',
    )
    premio = { id: gravado.id, bruto: p.brutoUsuario, liquido: p.liquidoUsuario }
  } else if (existente) {
    // Não premiada (ex.: jogos editados ou resultado corrigido): remove o prêmio calculado.
    exigir(await db.from('premios').delete().eq('id', existente.id), 'remover o prêmio')
  }

  if (premio) await gravarDivisao(db, aposta, premio)

  return {
    apostaId: aposta.id,
    userId: aposta.user_id,
    premiada: c.premiada || !!existente?.valor_informado_manual,
    liquido: premio?.liquido ?? 0,
    valorPendente,
    melhorAcerto: c.melhorAcerto,
  }
}

/** Snapshot do rateio entre os participantes (seção 9.6). Recalculado a cada conferência. */
async function gravarDivisao(
  db: SupabaseClient,
  aposta: Aposta,
  premio: { id: string; bruto: number; liquido: number },
) {
  const participantes = exigir<{ id: string; nome: string; peso: number; eh_usuario: boolean }[]>(
    await db
      .from('participantes')
      .select('id, nome, peso, eh_usuario')
      .eq('aposta_id', aposta.id)
      .order('ordem'),
    'ler participantes',
  )
  exigir(await db.from('premio_divisoes').delete().eq('premio_id', premio.id), 'limpar a divisão')
  if (participantes.length === 0) return
  const linhas = dividirPremio(
    premio,
    participantes.map((p) => ({ nome: p.nome, peso: Number(p.peso), ehUsuario: p.eh_usuario })),
  )
  exigir(
    await db.from('premio_divisoes').insert(
      participantes.map((p, i) => ({
        premio_id: premio.id,
        participante_id: p.id,
        user_id: aposta.user_id,
        liquido_centavos: linhas[i]!.liquido,
      })),
    ),
    'gravar a divisão',
  )
}

/** Recalcula o status da aposta (seção 9.7) olhando todos os concursos dela. */
async function atualizarStatus(db: SupabaseClient, aposta: Aposta) {
  if (aposta.status === 'cancelada') return
  const numeros = exigir<{ numero_concurso: number }[]>(
    await db.from('aposta_concursos').select('numero_concurso').eq('aposta_id', aposta.id),
    'ler concursos da aposta',
  ).map((n) => n.numero_concurso)
  const { count: sorteados } = await db
    .from('concursos')
    .select('id', { count: 'exact', head: true })
    .eq('modalidade_id', aposta.modalidade_id)
    .in('numero', numeros)
    .not('dezenas', 'is', null)
  const { count: premios } = await db
    .from('premios')
    .select('id', { count: 'exact', head: true })
    .eq('aposta_id', aposta.id)
  const status = statusDaAposta(aposta.qtd_concursos, sorteados ?? 0, (premios ?? 0) > 0)
  if (status !== aposta.status) {
    exigir(await db.from('apostas').update({ status }).eq('id', aposta.id), 'atualizar o status')
  }
}

/**
 * Uma notificação por usuário e concurso (chave_dedup = 'resultado:{concurso_id}').
 * `renotificar`: o resultado foi corrigido (ex.: a API substituiu um informado à mão),
 * então a notificação existente é reescrita e volta como não lida.
 */
async function notificar(ctx: Contexto, resultados: ResultadoAposta[], renotificar = false) {
  const porUsuario = new Map<string, ResultadoAposta[]>()
  for (const r of resultados) porUsuario.set(r.userId, [...(porUsuario.get(r.userId) ?? []), r])

  const linhas = [...porUsuario].map(([userId, rs]) => {
    const premiadas = rs.filter((r) => r.premiada)
    const texto = textoNotificacaoResultado({
      modalidadeNome: ctx.modalidadeNome,
      numeroConcurso: ctx.concurso.numero,
      qtdApostas: premiadas.length > 0 ? premiadas.length : rs.length,
      premiada: premiadas.length > 0,
      liquidoCentavos: premiadas.reduce((s, r) => s + r.liquido, 0),
      valorPendente: premiadas.some((r) => r.valorPendente),
      melhorAcerto: Math.max(...rs.map((r) => r.melhorAcerto)),
    })
    const alvo = premiadas.length === 1 ? premiadas[0]! : rs.length === 1 ? rs[0]! : null
    return {
      user_id: userId,
      tipo: premiadas.length > 0 ? 'premio' : 'resultado',
      titulo: texto.titulo,
      corpo: texto.corpo,
      link: alvo ? `/apostas/${alvo.apostaId}` : '/resultados',
      chave_dedup: `resultado:${ctx.concurso.id}`,
      ...(renotificar ? { lida_em: null, created_at: new Date().toISOString() } : {}),
    }
  })
  if (linhas.length === 0) return
  exigir(
    await ctx.db
      .from('notificacoes')
      .upsert(linhas, { onConflict: 'user_id,chave_dedup', ignoreDuplicates: !renotificar }),
    'gravar notificações',
  )
}

const CAMPOS_APOSTA =
  'id, user_id, tipo, status, modalidade_id, qtd_concursos, bolao_total_cotas, bolao_cotas_usuario'

/** Confere todas as apostas de um concurso (entrada { concurso_id } da seção 10.2). */
export async function conferirConcurso(
  db: SupabaseClient,
  concursoId: number,
  opcoes: { renotificar?: boolean } = {},
): Promise<ResumoConferencia> {
  const ctx = await carregarContexto(db, concursoId)
  if (!ctx) return { concursoId, apostasConferidas: 0, premiadas: 0 }

  const ids = exigir<{ aposta_id: string }[]>(
    await db
      .from('aposta_concursos')
      .select('aposta_id')
      .eq('modalidade_id', ctx.concurso.modalidade_id)
      .eq('numero_concurso', ctx.concurso.numero),
    'ler apostas do concurso',
  ).map((r) => r.aposta_id)
  if (ids.length === 0) return { concursoId, apostasConferidas: 0, premiadas: 0 }

  const apostas = exigir<Aposta[]>(
    await db.from('apostas').select(CAMPOS_APOSTA).in('id', ids),
    'ler apostas',
  )
  const resultados: ResultadoAposta[] = []
  for (const aposta of apostas) {
    resultados.push(await conferirApostaNoConcurso(ctx, aposta))
    await atualizarStatus(db, aposta)
  }
  await notificar(ctx, resultados, opcoes.renotificar)
  return {
    concursoId,
    apostasConferidas: resultados.length,
    premiadas: resultados.filter((r) => r.premiada).length,
  }
}

/**
 * Confere UMA aposta em todos os concursos dela que já têm resultado. Usado depois de
 * criar/editar a aposta ou informar um prêmio à mão (o resultado pode já ter saído).
 */
export async function conferirAposta(
  db: SupabaseClient,
  apostaId: string,
): Promise<{ concursosConferidos: number }> {
  const aposta = exigir<Aposta | null>(
    await db.from('apostas').select(CAMPOS_APOSTA).eq('id', apostaId).maybeSingle(),
    'ler a aposta',
  )
  if (!aposta) return { concursosConferidos: 0 }

  const numeros = exigir<{ numero_concurso: number }[]>(
    await db.from('aposta_concursos').select('numero_concurso').eq('aposta_id', apostaId),
    'ler concursos da aposta',
  ).map((n) => n.numero_concurso)
  const concursos = exigir<{ id: number }[]>(
    await db
      .from('concursos')
      .select('id')
      .eq('modalidade_id', aposta.modalidade_id)
      .in('numero', numeros)
      .not('dezenas', 'is', null),
    'ler concursos sorteados',
  )

  for (const { id } of concursos) {
    const ctx = await carregarContexto(db, id)
    if (!ctx) continue
    const r = await conferirApostaNoConcurso(ctx, aposta)
    await notificar(ctx, [r])
  }
  await atualizarStatus(db, aposta)
  return { concursosConferidos: concursos.length }
}

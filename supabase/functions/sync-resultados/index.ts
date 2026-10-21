// Edge Function sync-resultados (seção 10.1)
//   POST /sync-resultados           → sincroniza todas as modalidades (cron ou admin)
//   POST /sync-resultados/manual    → admin lança/edita um resultado à mão e dispara a conferência
//   POST /sync-resultados/informar  → usuário informa o resultado de um concurso da PRÓPRIA aposta
//                                     enquanto a API não traz o oficial (que tem prioridade)
// Aceita header `x-cron-secret` (GitHub Actions) OU JWT de admin com aal2 (verify_jwt = false).
// `informar` aceita o JWT de qualquer usuário ativo.
import { z } from 'zod'

import { ehAdminComMfa, obterChamador, segredoConfere, type Chamador } from '../_shared/auth.ts'
import { conferirConcurso } from '../_shared/conferir.ts'
import { responderPreflight } from '../_shared/cors.ts'
import {
  resultadoManualSchema,
  type ResultadoManualInput,
} from '../_shared/domain/schemas/resultados.ts'
import { erro, json } from '../_shared/respostas.ts'
import { gravarConcurso, sincronizar } from '../_shared/sincronizar.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'

const informarSchema = z.object({ apostaId: z.uuid() })

/** Resultado digitado (admin ou usuário) → formato gravado em `concursos`. */
function concursoDaEntrada(r: ResultadoManualInput) {
  return {
    numero: r.numero,
    dataSorteio: r.dataSorteio,
    dezenas: [...r.dezenas].sort((a, b) => a - b),
    rateio: [...r.rateio].sort((a, b) => b.acertos - a.acertos),
    acumulado: r.acumulado,
    dataProximo: null,
    valorEstimadoProximoCentavos: null,
  }
}

async function lerCorpo(req: Request): Promise<{ ok: true; corpo: unknown } | { ok: false }> {
  try {
    return { ok: true, corpo: await req.json() }
  } catch {
    return { ok: false }
  }
}

async function lancarManual(req: Request): Promise<Response> {
  const lido = await lerCorpo(req)
  if (!lido.ok) return erro(req, 400, 'Dados inválidos.')
  const entrada = resultadoManualSchema.safeParse(lido.corpo)
  if (!entrada.success)
    return erro(req, 400, entrada.error.issues[0]?.message ?? 'Dados inválidos.')
  const r = entrada.data

  const { data: modalidade } = await supabaseAdmin
    .from('modalidades')
    .select('id')
    .eq('slug', r.modalidadeSlug)
    .single()
  if (!modalidade) return erro(req, 400, 'Modalidade inválida.')

  const gravado = await gravarConcurso(supabaseAdmin, modalidade.id, concursoDaEntrada(r), 'manual')
  const conferencia = await conferirConcurso(supabaseAdmin, gravado.id, {
    renotificar: gravado.corrigido,
  })
  await supabaseAdmin.from('sync_logs').insert({
    origem: 'manual',
    modalidade_id: modalidade.id,
    status: 'ok',
    ultimo_concurso: r.numero,
    inseridos: gravado.novo ? 1 : 0,
    conferidos: conferencia.apostasConferidas,
    mensagem: `Resultado do concurso ${r.numero} lançado à mão.`,
  })
  return json(req, { concurso_id: gravado.id, ...conferencia })
}

/**
 * Resultado informado por um usuário para um concurso da própria aposta. O concurso
 * é um só para todos, então a conferência vale para as apostas de todo mundo. Não
 * sobrescreve o oficial nem o do admin; a próxima sincronização com a API o substitui.
 */
async function informarPorUsuario(req: Request, chamador: Chamador): Promise<Response> {
  const lido = await lerCorpo(req)
  if (!lido.ok) return erro(req, 400, 'Dados inválidos.')
  const alvo = informarSchema.safeParse(lido.corpo)
  if (!alvo.success) return erro(req, 400, 'Dados inválidos.')
  const entrada = resultadoManualSchema.safeParse(lido.corpo)
  if (!entrada.success)
    return erro(req, 400, entrada.error.issues[0]?.message ?? 'Dados inválidos.')
  const r = entrada.data

  const { data: aposta } = await supabaseAdmin
    .from('apostas')
    .select('user_id, modalidade_id, modalidades (slug)')
    .eq('id', alvo.data.apostaId)
    .maybeSingle<{ user_id: string; modalidade_id: number; modalidades: { slug: string } | null }>()
  // Mesma resposta para "não existe" e "é de outro usuário": não revela apostas alheias.
  if (!aposta || aposta.user_id !== chamador.id) return erro(req, 404, 'Aposta não encontrada.')
  if (aposta.modalidades?.slug !== r.modalidadeSlug)
    return erro(req, 400, 'A modalidade não é a da aposta.')

  const { data: daAposta } = await supabaseAdmin
    .from('aposta_concursos')
    .select('numero_concurso')
    .eq('aposta_id', alvo.data.apostaId)
    .eq('numero_concurso', r.numero)
    .maybeSingle()
  if (!daAposta) return erro(req, 400, 'Este concurso não é desta aposta.')

  const { data: atual } = await supabaseAdmin
    .from('concursos')
    .select('dezenas, fonte')
    .eq('modalidade_id', aposta.modalidade_id)
    .eq('numero', r.numero)
    .maybeSingle()
  if (atual?.dezenas && atual.fonte !== 'usuario') {
    return erro(
      req,
      409,
      atual.fonte === 'api_caixa'
        ? 'Este concurso já tem o resultado oficial.'
        : 'O administrador já lançou o resultado deste concurso.',
    )
  }

  const gravado = await gravarConcurso(
    supabaseAdmin,
    aposta.modalidade_id,
    concursoDaEntrada(r),
    'usuario',
  )
  const conferencia = await conferirConcurso(supabaseAdmin, gravado.id, {
    renotificar: gravado.corrigido,
  })
  await supabaseAdmin.from('sync_logs').insert({
    origem: 'usuario',
    modalidade_id: aposta.modalidade_id,
    status: 'ok',
    ultimo_concurso: r.numero,
    inseridos: gravado.novo ? 1 : 0,
    conferidos: conferencia.apostasConferidas,
    mensagem: `Resultado do concurso ${r.numero} informado por um usuário (não oficial).`,
  })
  return json(req, { concurso_id: gravado.id, ...conferencia })
}

/** Limite de 10 chamadas/min por usuário (a tabela de controle é a mesma do admin). */
async function dentroDoLimite(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.rpc('fn_registrar_chamada_admin', {
    p_user_id: userId,
    p_limite: 10,
  })
  return !!data
}

Deno.serve(async (req) => {
  const preflight = responderPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return erro(req, 405, 'Método não permitido.')

  const acao = new URL(req.url).pathname.split('/').filter(Boolean).at(-1)

  if (acao === 'informar') {
    const chamador = await obterChamador(req)
    if (!chamador?.ativo) return erro(req, 401, 'Sessão inválida.')
    if (!(await dentroDoLimite(chamador.id)))
      return erro(req, 429, 'Muitas requisições. Aguarde um minuto.')
    try {
      return await informarPorUsuario(req, chamador)
    } catch (e) {
      console.error('sync-resultados/informar:', e instanceof Error ? e.message : e)
      return erro(req, 500, 'Não foi possível salvar o resultado.')
    }
  }

  const doCron = segredoConfere(req.headers.get('x-cron-secret'), Deno.env.get('CRON_SECRET'))

  let origem: 'cron' | 'admin' = 'cron'
  if (!doCron) {
    const chamador = await obterChamador(req)
    if (!ehAdminComMfa(chamador)) return erro(req, 403, 'Acesso negado.')
    if (!(await dentroDoLimite(chamador.id)))
      return erro(req, 429, 'Muitas requisições. Aguarde um minuto.')
    origem = 'admin'
  }

  try {
    if (acao === 'manual') {
      if (origem !== 'admin') return erro(req, 403, 'Acesso negado.')
      return await lancarManual(req)
    }
    if (acao !== 'sync-resultados') return erro(req, 404, 'Ação desconhecida.')
    return json(
      req,
      await sincronizar(
        { db: supabaseAdmin, urlApi: Deno.env.get('CAIXA_API_URL') || undefined },
        origem,
      ),
    )
  } catch (e) {
    // Nunca expõe detalhes; o log fica no painel das functions.
    console.error('sync-resultados:', e instanceof Error ? e.message : e)
    return erro(req, 500, 'Não foi possível concluir a sincronização.')
  }
})

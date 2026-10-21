// Edge Function sync-resultados (seção 10.1)
//   POST /sync-resultados         → sincroniza todas as modalidades (cron ou admin)
//   POST /sync-resultados/manual  → admin lança/edita um resultado à mão e dispara a conferência
// Aceita header `x-cron-secret` (GitHub Actions) OU JWT de admin com aal2 (verify_jwt = false).
import { ehAdminComMfa, obterChamador, segredoConfere } from '../_shared/auth.ts'
import { conferirConcurso } from '../_shared/conferir.ts'
import { responderPreflight } from '../_shared/cors.ts'
import { resultadoManualSchema } from '../_shared/domain/schemas/resultados.ts'
import { erro, json } from '../_shared/respostas.ts'
import { gravarConcurso, sincronizar } from '../_shared/sincronizar.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'

async function lancarManual(req: Request): Promise<Response> {
  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return erro(req, 400, 'Dados inválidos.')
  }
  const entrada = resultadoManualSchema.safeParse(corpo)
  if (!entrada.success)
    return erro(req, 400, entrada.error.issues[0]?.message ?? 'Dados inválidos.')
  const r = entrada.data

  const { data: modalidade } = await supabaseAdmin
    .from('modalidades')
    .select('id')
    .eq('slug', r.modalidadeSlug)
    .single()
  if (!modalidade) return erro(req, 400, 'Modalidade inválida.')

  const gravado = await gravarConcurso(
    supabaseAdmin,
    modalidade.id,
    {
      numero: r.numero,
      dataSorteio: r.dataSorteio,
      dezenas: [...r.dezenas].sort((a, b) => a - b),
      rateio: [...r.rateio].sort((a, b) => b.acertos - a.acertos),
      acumulado: r.acumulado,
      dataProximo: null,
      valorEstimadoProximoCentavos: null,
    },
    'manual',
  )
  const conferencia = await conferirConcurso(supabaseAdmin, gravado.id)
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

Deno.serve(async (req) => {
  const preflight = responderPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return erro(req, 405, 'Método não permitido.')

  const acao = new URL(req.url).pathname.split('/').filter(Boolean).at(-1)
  const doCron = segredoConfere(req.headers.get('x-cron-secret'), Deno.env.get('CRON_SECRET'))

  let origem: 'cron' | 'admin' = 'cron'
  if (!doCron) {
    const chamador = await obterChamador(req)
    if (!ehAdminComMfa(chamador)) return erro(req, 403, 'Acesso negado.')
    const { data: dentroDoLimite } = await supabaseAdmin.rpc('fn_registrar_chamada_admin', {
      p_user_id: chamador.id,
      p_limite: 10,
    })
    if (!dentroDoLimite) return erro(req, 429, 'Muitas requisições. Aguarde um minuto.')
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

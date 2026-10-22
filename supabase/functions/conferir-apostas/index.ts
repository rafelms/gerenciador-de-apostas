// Edge Function conferir-apostas (seção 10.2)
//   service role: { concurso_id } → confere todas as apostas do concurso
//   usuário:      { aposta_id }   → confere a PRÓPRIA aposta nos concursos já sorteados
//                                   (depois de criar/editar a aposta, informar prêmio à mão ou
//                                   tocar em "Conferir agora"). Antes, busca na API da CAIXA os
//                                   resultados que faltam, sem esperar o cron.
// Idempotente: pode ser chamada quantas vezes for preciso.
import { z } from 'zod'

import { obterChamador, segredoConfere, tokenDoHeader } from '../_shared/auth.ts'
import { conferirAposta, conferirConcurso } from '../_shared/conferir.ts'
import { responderPreflight } from '../_shared/cors.ts'
import { erro, json } from '../_shared/respostas.ts'
import { buscarResultadosDaAposta } from '../_shared/sincronizar.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'

const porConcurso = z.object({ concurso_id: z.number().int().positive() })
const porAposta = z.object({ aposta_id: z.uuid() })

Deno.serve(async (req) => {
  const preflight = responderPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return erro(req, 405, 'Método não permitido.')

  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return erro(req, 400, 'Dados inválidos.')
  }

  try {
    if (segredoConfere(tokenDoHeader(req), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))) {
      const entrada = porConcurso.safeParse(corpo)
      if (!entrada.success) return erro(req, 400, 'Dados inválidos.')
      return json(req, await conferirConcurso(supabaseAdmin, entrada.data.concurso_id))
    }

    const chamador = await obterChamador(req)
    if (!chamador?.ativo) return erro(req, 401, 'Sessão inválida.')
    const entrada = porAposta.safeParse(corpo)
    if (!entrada.success) return erro(req, 400, 'Dados inválidos.')

    const { data: aposta } = await supabaseAdmin
      .from('apostas')
      .select('user_id')
      .eq('id', entrada.data.aposta_id)
      .maybeSingle()
    // Mesma resposta para "não existe" e "é de outro usuário": não revela apostas alheias.
    if (!aposta || aposta.user_id !== chamador.id) return erro(req, 404, 'Aposta não encontrada.')
    // API fora do ar não impede conferir com o que já está no banco. No local, a busca
    // fica desligada (config.toml) para os e2e não dependerem da API real.
    const busca =
      Deno.env.get('RESULTADOS_SOB_DEMANDA') === 'desligado'
        ? { futuros: 0, erro: undefined }
        : await buscarResultadosDaAposta(
            {
              db: supabaseAdmin,
              urlApi: Deno.env.get('CAIXA_API_URL') || undefined,
              urlAlternativa: Deno.env.get('API_ALTERNATIVA_URL') || undefined,
            },
            entrada.data.aposta_id,
          )
    const r = await conferirAposta(supabaseAdmin, entrada.data.aposta_id)
    return json(req, { ...r, futuros: busca.futuros, apiIndisponivel: !!busca.erro })
  } catch (e) {
    console.error('conferir-apostas:', e instanceof Error ? e.message : e)
    return erro(req, 500, 'Não foi possível conferir agora.')
  }
})

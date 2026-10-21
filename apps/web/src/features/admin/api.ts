import type { ConfiguracoesInput, ResultadoManualInput } from '@shared/schemas/resultados.ts'
import type { ConvidarUsuarioInput } from '@shared/schemas/auth.ts'

import { mensagemDaFunction } from '@/features/conferencia/api'
import { supabase } from '@/lib/supabase'

export const chavesAdmin = {
  usuarios: ['admin', 'usuarios'] as const,
  syncLogs: ['admin', 'sync-logs'] as const,
  configuracoes: ['admin', 'configuracoes'] as const,
  concurso: (modalidadeId: number, numero: number) =>
    ['admin', 'concurso', modalidadeId, numero] as const,
}

export async function listarUsuarios() {
  const { data, error } = await supabase.rpc('fn_admin_listar_usuarios')
  if (error) throw error
  return data
}

/** Chama a Edge Function admin-usuarios e devolve a mensagem de erro amigável, se houver. */
async function chamarAdminUsuarios(acao: 'convidar' | 'desativar' | 'reativar', corpo: object) {
  const { error } = await supabase.functions.invoke(`admin-usuarios/${acao}`, { body: corpo })
  if (error) {
    let mensagem = 'Não foi possível concluir. Tente de novo.'
    try {
      const resposta = (error as { context?: Response }).context
      const json = (await resposta?.json()) as { erro?: string } | undefined
      if (json?.erro) mensagem = json.erro
    } catch {
      // mantém a mensagem genérica
    }
    throw new Error(mensagem)
  }
}

export const convidarUsuario = (dados: ConvidarUsuarioInput) =>
  chamarAdminUsuarios('convidar', dados)
export const desativarUsuario = (user_id: string) => chamarAdminUsuarios('desativar', { user_id })
export const reativarUsuario = (user_id: string) => chamarAdminUsuarios('reativar', { user_id })

// ---------------------------------------------------------------------------
// Resultados (F2.9)
// ---------------------------------------------------------------------------
export interface ResumoSync {
  modalidades: {
    slug: string
    ultimo: number | null
    inseridos: number
    conferidos: number
    erro?: string
  }[]
}

/** "Sincronizar agora": a mesma rotina do cron, chamada com o JWT do admin (aal2). */
export async function sincronizarAgora(): Promise<ResumoSync> {
  const { data, error } = await supabase.functions.invoke<ResumoSync>('sync-resultados', {
    body: {},
  })
  if (error || !data)
    throw new Error(await mensagemDaFunction(error, 'Não foi possível sincronizar.'))
  return data
}

/** Lança (ou corrige) um resultado à mão e dispara a conferência das apostas do concurso. */
export async function lancarResultadoManual(r: ResultadoManualInput) {
  const { data, error } = await supabase.functions.invoke<{
    concurso_id: number
    apostasConferidas: number
    premiadas: number
  }>('sync-resultados/manual', { body: r })
  if (error || !data)
    throw new Error(await mensagemDaFunction(error, 'Não foi possível lançar o resultado.'))
  return data
}

export async function listarSyncLogs() {
  const { data, error } = await supabase
    .from('sync_logs')
    .select(
      'id, executado_em, origem, modalidade_id, status, ultimo_concurso, inseridos, conferidos, mensagem',
    )
    .order('executado_em', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

/** Concurso já gravado (para editar um resultado manual). */
export async function buscarConcursoAdmin(modalidadeId: number, numero: number) {
  const { data, error } = await supabase
    .from('concursos')
    .select('numero, data_sorteio, dezenas, rateio, acumulado, fonte')
    .eq('modalidade_id', modalidadeId)
    .eq('numero', numero)
    .maybeSingle()
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Configurações globais e preços (seção 11.6). A RLS exige admin + aal2.
// ---------------------------------------------------------------------------
export async function salvarConfiguracoes(c: ConfiguracoesInput) {
  const { error } = await supabase
    .from('configuracoes')
    .update({
      aliquota_ir_bps: c.aliquotaIrBps,
      limite_isencao_ir_centavos: c.limiteIsencaoIrCentavos,
      base_calculo_ir: c.baseCalculoIr,
      valor_rateio_api_eh: c.valorRateioApiEh,
      prazo_resgate_dias: c.prazoResgateDias,
    })
    .eq('id', 1)
  if (error) throw new Error('Não foi possível salvar as configurações.')
}

export async function carregarConfiguracoesAdmin() {
  const { data, error } = await supabase.from('configuracoes').select('*').eq('id', 1).single()
  if (error) throw error
  return data
}

export async function adicionarPreco(
  modalidadeId: number,
  precoSimplesCentavos: number,
  vigenteDesde: string,
) {
  const { error } = await supabase.from('modalidade_precos').insert({
    modalidade_id: modalidadeId,
    preco_simples_centavos: precoSimplesCentavos,
    vigente_desde: vigenteDesde,
  })
  if (error) {
    throw new Error(
      error.code === '23505'
        ? 'Já existe um preço com esta data de vigência.'
        : 'Não foi possível salvar o preço.',
    )
  }
}
